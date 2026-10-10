"""Run: python -m uvicorn dashboard_api.app:app --host 127.0.0.1 --port 8000."""
from contextlib import asynccontextmanager
import csv
import io
import json
import logging
import os
from pathlib import Path
from typing import Literal, Annotated
from fastapi import FastAPI, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from .schemas import RunRequest, RunStatus, CaseResult, Metrics, Trace, Event, Update, Comparison, ScenarioName, ControllerName
from .store import RunStore, StoreError, read_json
from .evidence import PilotEvidence
from .integration import ROOT, WARNING, DESCRIPTIONS, comparison, event_log
from tidelock.model import Parameters
from tidelock.scenarios import make_scenario


def create_app(data_dir=None, store_factory=RunStore):
    @asynccontextmanager
    async def lifespan(app):
        app.state.store=store_factory(data_dir or os.getenv('TIDELOCK_DATA_DIR',str(ROOT/'.tidelock'/'runs')))
        app.state.evidence=PilotEvidence(ROOT/'results'/'pilot')
        try:
            yield
        finally:
            app.state.store.close()

    app=FastAPI(title='TideLock Simulation API',version='1.0.0',description=WARNING,lifespan=lifespan)
    origins=['http://localhost:5173','http://127.0.0.1:5173','http://localhost:8000','http://127.0.0.1:8000']
    app.add_middleware(CORSMiddleware,allow_origins=origins,allow_methods=['GET','POST'],
                       allow_headers=['Content-Type','Idempotency-Key'])
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=['localhost','127.0.0.1','testserver'])
    app.add_middleware(GZipMiddleware,minimum_size=1500)

    @app.middleware('http')
    async def local_access(request,call_next):
        origin=request.headers.get('origin')
        if origin and origin not in origins:
            return JSONResponse(status_code=403,content={'error':{'code':'origin_forbidden','message':'Local dashboard origins only'}})
        response=await call_next(request)
        response.headers['X-Content-Type-Options']='nosniff'
        if request.url.path.startswith('/api/'):
            response.headers['Cache-Control']='no-store'
        return response

    @app.exception_handler(Exception)
    async def unexpected_error(request,exc):
        logging.getLogger(__name__).error('Unhandled API error',exc_info=exc)
        return JSONResponse(status_code=500,content={'error':{'code':'internal_error','message':'Unexpected server error; inspect the server log.'}})

    @app.exception_handler(StoreError)
    async def store_error(request,exc):
        return JSONResponse(status_code=exc.status,content={'error':{'code':exc.code,'message':exc.message}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(request,exc):
        details='; '.join('.'.join(map(str,e['loc']))+': '+e['msg'] for e in exc.errors())
        return JSONResponse(status_code=422,content={'error':{'code':'validation_error','message':details}})

    @app.get('/api/health')
    def health():
        active=[r for r in app.state.store.list() if r['status'] in ('queued','running')]
        return dict(status='ok',mode='simulation-only',warning=WARNING,worker_limit=1,
                    queue_limit=3,active_jobs=len(active),version='1.0.0')

    @app.get('/api/scenarios')
    def scenarios():
        return dict(scenarios=[{'id':k,'label':k.replace('_',' ').title(),'description':v} for k,v in DESCRIPTIONS.items()],
                    durations_s=[300,600,900,1200,1800],integration_steps_s=[5.0,2.5],
                    max_seeds=10,max_seed=4294967295)

    @app.get('/api/controllers')
    def controllers():
        return [{'id':'fixed','label':'Fixed barrier','description':'Screen engaged; bypass remains closed.'},
                {'id':'threshold','label':'Hysteretic threshold','description':'Opens and closes at distinct level thresholds; uses head-aware fallback.'},
                {'id':'predictive','label':'TideLock predictive','description':'27 candidate plans, 180-second horizon, five sampled uncertainty cases.'}]

    @app.get('/api/model')
    def model():
        return dict(warning=WARNING,parameters=Parameters().dictionary(),
            assumptions=['Synthetic geometry, runoff, tide and debris; no measured Mumbai site data.',
              'One lumped storage reach; no momentum, spatial backwater or structural-load validation.',
              'Well-mixed plastic with synthetic capture law; no re-entrainment.',
              'Finite sampled uncertainty checks do not prove robust or recursive feasibility.',
              'Level telemetry loss leaves local basket and actuator feedback available.',
              'A full basket rejects capture; basket overflow is prevented by saturation in this model.'],
            unavailable=['Measured rainfall (mm/h)','Field sensor calibration','Physical gate forces',
                         'Marine corrosion','Complete power loss','Validated deployment costs'],
            metrics={'capture_fraction':'Newly captured plastic / incoming plastic; excludes initial basket inventory.',
              'escape_fraction':'Escaped plastic / incoming plastic. Remaining mass may still be suspended.',
              'safety_violation_duration_s':'Integration samples with true simulated level above 1.60 m, multiplied by dt.',
              'warning_excess_ms':'Integral of max(h − 1.30 m, 0) in metre-seconds; a risk proxy, not damage.',
              'recovery_after_fault_s':'Time after injected fault ends until three non-alert updates; not proof of hydraulic recovery.'})

    @app.post('/api/runs',response_model=RunStatus,status_code=202)
    def submit(body:RunRequest,idempotency_key:Annotated[str|None,Header(max_length=128)]=None):
        return app.state.store.submit(body,idempotency_key)

    @app.get('/api/runs',response_model=list[RunStatus])
    def runs():
        return app.state.store.list()

    @app.get('/api/runs/{run_id}',response_model=RunStatus)
    def status(run_id:str):
        return app.state.store.get(run_id)

    @app.get('/api/runs/{run_id}/manifest')
    def manifest(run_id:str):
        return read_json(app.state.store.path(run_id)/'manifest.json')

    @app.get('/api/runs/{run_id}/cases/{case_id}',response_model=CaseResult)
    def case(run_id:str,case_id:str):
        return app.state.store.result(run_id,case_id)

    @app.get('/api/runs/{run_id}/metrics',response_model=list[Metrics])
    def metrics(run_id:str):
        return [r.metrics for r in app.state.store.results(run_id)]

    @app.get('/api/runs/{run_id}/cases/{case_id}/traces',response_model=list[Trace])
    def traces(run_id:str,case_id:str):
        return app.state.store.result(run_id,case_id).traces

    @app.get('/api/runs/{run_id}/cases/{case_id}/events',response_model=list[Event])
    def events(run_id:str,case_id:str):
        return app.state.store.result(run_id,case_id).events

    @app.get('/api/runs/{run_id}/cases/{case_id}/updates',response_model=list[Update])
    def updates(run_id:str,case_id:str):
        return app.state.store.result(run_id,case_id).updates

    @app.get('/api/runs/{run_id}/comparison',response_model=Comparison)
    def compare(run_id:str):
        m=app.state.store.get(run_id)
        return comparison(RunRequest.model_validate(m['request']),app.state.store.results(run_id),
                          [c for c in m['cases'] if c['status']=='failed'])

    @app.get('/api/runs/{run_id}/export')
    def export(run_id:str,kind:Literal['metrics','traces','events','updates','summary']='metrics',
               format:Literal['csv','json']='csv'):
        m=RunStatus.model_validate(app.state.store.get(run_id))
        results=app.state.store.results(run_id)
        if kind=='summary':
            if format!='json': raise StoreError('invalid_export','Summary export requires JSON')
            payload={'run':m.model_dump(),'manifest':manifest(run_id),'comparison':compare(run_id).model_dump()}
        else:
            payload=[]
            for c in results:
                records=[c.metrics.model_dump()] if kind=='metrics' else [r.model_dump() for r in getattr(c,kind)]
                payload.extend({'case_id':c.case_id,'controller':c.metrics.controller,'seed':c.metrics.seed,**r} for r in records)
        headers={'Content-Disposition':f'attachment; filename="tidelock-{run_id[:8]}-{kind}.{format}"'}
        if format=='json': return Response(json.dumps(payload,allow_nan=False),media_type='application/json',headers=headers)
        if not payload: raise StoreError('no_results','No completed results to export yet',409)
        stream=io.StringIO(newline='')
        fields=list(dict.fromkeys(k for r in payload for k in r))
        writer=csv.DictWriter(stream,fieldnames=fields,lineterminator='\n')
        writer.writeheader()
        for row in payload:
            writer.writerow({k:json.dumps(v) if isinstance(v,(dict,list)) else v for k,v in row.items()})
        return Response(stream.getvalue(),media_type='text/csv',headers=headers)

    @app.get('/api/evidence/pilot')
    def inventory():
        return dict(id='pilot',label='Committed feasibility pilot',immutable=True,files=app.state.evidence.inventory())

    @app.get('/api/evidence/pilot/case',response_model=CaseResult)
    def pilot_case(scenario:ScenarioName='compound',controller:ControllerName='predictive'):
        evidence=app.state.evidence
        # Only seed 11 has archived per-step traces; do not manufacture the others.
        all_metrics=evidence.read('metrics.csv',0,10000)['rows']
        metric=next(m for m in all_metrics if m['scenario']==scenario and m['controller']==controller and m['seed']==11)
        stem=f'{scenario}_{controller}.csv'
        rows=evidence.read('traces/'+stem,0,10000)['rows']
        events=evidence.read('events/'+stem,0,10000)['rows']
        updates=evidence.read('updates/'+stem,0,10000)['rows']
        return CaseResult(case_id=f'{controller}-11',parameters=make_scenario(scenario).p.dictionary(),metrics=metric,traces=rows,updates=updates,
                          events=event_log(rows,events,updates,make_scenario(scenario).p))

    @app.get('/api/evidence/pilot/comparison',response_model=Comparison)
    def pilot_comparison(scenario:ScenarioName='compound',multi_seed:bool=False):
        seeds=[11,23,37,51,79] if multi_seed else [11]
        req=RunRequest(scenario=scenario,controllers=['fixed','threshold','predictive'],seeds=seeds)
        rows=app.state.evidence.read('metrics.csv',0,10000)['rows']
        cases=[CaseResult(case_id=f"{m['controller']}-{m['seed']}",metrics=m,traces=[],events=[],updates=[])
               for m in rows if m['scenario']==scenario and m['seed'] in seeds]
        return comparison(req,cases,[])

    @app.get('/api/evidence/pilot/files/{name:path}')
    def evidence(name:str,offset:int=Query(0,ge=0),limit:int=Query(100,ge=1,le=200)):
        return app.state.evidence.read(name,offset,limit)

    @app.get('/api/evidence/pilot/download/{name:path}')
    def download(name:str):
        p=app.state.evidence.resolve(name)
        return FileResponse(p,filename=p.name)

    @app.get('/api/{unknown:path}',include_in_schema=False)
    def api_not_found(unknown):
        raise StoreError('not_found','API endpoint not found',404)

    dist=ROOT/'frontend'/'dist'
    if dist.is_dir(): app.mount('/',StaticFiles(directory=dist,html=True),name='dashboard')
    return app


app=create_app()
