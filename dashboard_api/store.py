"""Bounded process execution with atomic, persistent, inspectable results."""
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import logging
import multiprocessing
import os
from pathlib import Path
import re
import signal
import sys
import threading
import uuid
from .schemas import RunRequest, RunStatus, CaseResult
from .integration import execute_case, source_hashes
from tidelock.scenarios import make_scenario

logger=logging.getLogger(__name__)
ID=re.compile(r'^[a-f0-9]{32}$')
CASE=re.compile(r'^(fixed|threshold|predictive)-[0-9]{1,10}$')


class StoreError(Exception):
    def __init__(self, code, message, status=400):
        self.code,self.message,self.status=code,message,status


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, data):
    tmp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with tmp.open('w') as f:
        json.dump(data,f,allow_nan=False)
        f.flush(); os.fsync(f.fileno())
    os.replace(tmp,path)


def read_json(path):
    return json.loads(path.read_text())


def initialize_worker():
    # Let the API own Ctrl+C and drain accepted work on graceful shutdown.
    signal.signal(signal.SIGINT, signal.SIG_IGN)


def execute_job(path_string):
    folder=Path(path_string)
    meta=read_json(folder/'run.json')
    request=RunRequest.model_validate(meta['request'])
    meta.update(status='running',updated_at=now())
    write_json(folder/'run.json',meta)
    for seed in request.seeds:
        for controller in request.controllers:
            case_id=f'{controller}-{seed}'
            try:
                result=execute_case(request,controller,seed)
                write_json(folder/f'{case_id}.json',result.model_dump())
                case=dict(case_id=case_id,controller=controller,seed=seed,status='complete',error=None)
            except Exception as exc:
                logger.exception('Simulation case %s failed',case_id)
                case=dict(case_id=case_id,controller=controller,seed=seed,status='failed',
                          error=f'{type(exc).__name__}: simulation failed; inspect server log')
            meta['cases'].append(case)
            meta['completed_cases']+=1
            meta['updated_at']=now()
            write_json(folder/'run.json',meta)
    failed=sum(c['status']=='failed' for c in meta['cases'])
    meta.update(status='failed' if failed==meta['total_cases'] else 'partial' if failed else 'complete',updated_at=now())
    if failed:
        meta['error']=f'{failed} simulation case(s) failed; retained in comparison.'
    write_json(folder/'run.json',meta)


class RunStore:
    def __init__(self, root, executor=None, runner=execute_job, max_pending=3):
        self.root=Path(root).resolve()
        self.root.mkdir(parents=True,exist_ok=True)
        self.guard=threading.RLock()
        self.lock=(self.root/'.server.lock').open('a+')
        try:
            if sys.platform=='win32':
                import msvcrt
                self.lock.seek(0); self.lock.write('1'); self.lock.flush(); self.lock.seek(0)
                msvcrt.locking(self.lock.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            self.lock.close()
            raise RuntimeError('Run directory already in use. Start only one API worker.')
        self.executor=executor or ProcessPoolExecutor(max_workers=1,mp_context=multiprocessing.get_context('spawn'),initializer=initialize_worker)
        self.runner=runner
        self.max_pending=max_pending
        for p in self.root.glob('*/run.json'):
            m=read_json(p)
            if m['status'] in ('queued','running'):
                m.update(status='failed',error='Server restarted before completion; prior partial results preserved.',updated_at=now())
                write_json(p,m)

    def close(self):
        self.executor.shutdown(wait=True,cancel_futures=False)
        self.lock.close()

    def path(self, run_id):
        if not ID.fullmatch(run_id):
            raise StoreError('not_found','Unknown run ID',404)
        p=self.root/run_id
        if p.is_symlink() or not (p/'run.json').is_file():
            raise StoreError('not_found','Run not found',404)
        return p

    def list(self):
        return sorted((read_json(p) for p in self.root.glob('*/run.json') if not p.parent.is_symlink()),
                      key=lambda m:m['created_at'],reverse=True)

    def get(self, run_id):
        return read_json(self.path(run_id)/'run.json')

    def result(self, run_id, case_id):
        folder=self.path(run_id)
        meta=self.get(run_id)
        case=next((c for c in meta['cases'] if c['case_id']==case_id),None)
        if not CASE.fullmatch(case_id) or case is None:
            raise StoreError('not_found','Case not available',404)
        if case['status']=='failed':
            raise StoreError('case_failed',case['error'],409)
        p=folder/f'{case_id}.json'
        if p.is_symlink():
            raise StoreError('not_found','Case not available',404)
        return CaseResult.model_validate(read_json(p))

    def results(self, run_id):
        meta=self.get(run_id)
        return [self.result(run_id,c['case_id']) for c in meta['cases'] if c['status']=='complete']

    def submit(self, request, token):
        canonical=json.dumps(request.model_dump(),sort_keys=True)
        fingerprint=hashlib.sha256(canonical.encode()).hexdigest()
        token_hash=hashlib.sha256(token.encode()).hexdigest() if token else None
        with self.guard:
            history=self.list()
            for m in history:
                if token_hash and m.get('idempotency_hash')==token_hash:
                    if m['fingerprint'] != fingerprint:
                        raise StoreError('idempotency_conflict','Idempotency key already used for a different request',409)
                    return m
                if m['status'] in ('queued','running') and m['fingerprint']==fingerprint:
                    return m
            if sum(m['status'] in ('queued','running') for m in history)>=self.max_pending:
                raise StoreError('queue_full','Worker queue is full; wait for a run to finish',429)
            if len(history)>=200:
                raise StoreError('storage_limit','200-run limit reached; archive completed run folders before continuing',507)
            run_id=uuid.uuid4().hex
            folder=self.root/run_id
            folder.mkdir()
            warnings=[]
            if request.duration_s<=600 and request.scenario in ('sensor_bias','sensor_stuck','communication_loss',
                    'telemetry_delay','actuator_delay','actuator_stuck','capacity_error'):
                warnings.append('This duration ends before the injected fault; choose at least 900 seconds to observe it.')
            if request.duration_s<=1200 and request.scenario=='maintenance':
                warnings.append('Maintenance at 1200 seconds is outside this run; choose 1800 seconds.')
            meta=RunStatus(id=run_id,status='queued',created_at=now(),updated_at=now(),request=request,
                           total_cases=len(request.seeds)*len(request.controllers),warnings=warnings).model_dump()
            meta.update(fingerprint=fingerprint,idempotency_hash=token_hash)
            write_json(folder/'run.json',meta)
            manifest=dict(evidence='SYNTHETIC SIMULATION; NOT FIELD VALIDATED',run_id=run_id,
                created_at=meta['created_at'],request=request.model_dump(),source_sha256=source_hashes(),
                parameters=make_scenario(request.scenario).p.dictionary(),
                initial_level_m=.85,control_interval_s=30,horizon_s=180,
                runtime={'python':sys.version},
                immutable_pilot=False,
                note='Same scenario seed and integration interval across controllers. New results do not change pilot evidence.')
            write_json(folder/'manifest.json',manifest)
            try:
                future=self.executor.submit(self.runner,str(folder))
                future.add_done_callback(lambda f:self._finish(run_id,f))
            except Exception:
                meta.update(status='failed',error='Worker could not start',updated_at=now())
                write_json(folder/'run.json',meta)
                raise StoreError('worker_failed','Worker could not start; failed run has been recorded',503)
            return meta

    def _finish(self, run_id, future):
        try:
            future.result()
        except Exception:
            logger.exception('Worker failed for run %s',run_id)
            with self.guard:
                meta=self.get(run_id)
                meta.update(status='failed',error='Simulation worker failed; any completed cases are preserved.',updated_at=now())
                write_json(self.path(run_id)/'run.json',meta)
