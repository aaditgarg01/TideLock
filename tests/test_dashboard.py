"""API integration, real process execution, provenance and fault containment."""
from concurrent.futures import Future
import csv
import hashlib
import io
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from dashboard_api.app import create_app
from dashboard_api.integration import ROOT, WARNING, execute_case, comparison
from dashboard_api.schemas import RunRequest
from dashboard_api.store import RunStore, StoreError, execute_job

class HeldExecutor:
    def __init__(self): self.futures=[]
    def submit(self,*args):
        f=Future(); self.futures.append(f); return f
    def shutdown(self,**kwargs): pass

class DashboardTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.client=TestClient(create_app(self.tmp.name))
        self.client.__enter__()
    def tearDown(self):
        self.client.__exit__(None,None,None);self.tmp.cleanup()
    def wait(self,run_id):
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            r=self.client.get('/api/runs/'+run_id).json()
            if r['status'] not in ('running','queued'): return r
            time.sleep(.05)
        self.fail('Simulation did not finish within 60 seconds')
    def test_real_execution_retrieval_exports_and_paired_comparison(self):
        request=dict(scenario='ordinary',controllers=['fixed','threshold','predictive'],seeds=[11,23],duration_s=300)
        response=self.client.post('/api/runs',json=request,headers={'Idempotency-Key':'test-real'})
        self.assertEqual(response.status_code,202,response.text)
        rid=response.json()['id'];r=self.wait(rid)
        self.assertEqual(r['status'],'complete',r)
        self.assertEqual(r['completed_cases'],6)
        self.assertEqual(self.client.post('/api/runs',json=request,headers={'Idempotency-Key':'test-real'}).json()['id'],rid)
        case=self.client.get(f'/api/runs/{rid}/cases/predictive-11').json()
        self.assertEqual(len(case['traces']),60)
        self.assertEqual(case['traces'][-1]['time_s'],300)
        self.assertAlmostEqual(case['metrics']['captured_kg'],case['traces'][-1]['captured_kg'])
        for endpoint in ('traces','events','updates'):
            self.assertEqual(self.client.get(f'/api/runs/{rid}/cases/predictive-11/{endpoint}').json(),case[endpoint])
        cmp=self.client.get(f'/api/runs/{rid}/comparison').json()
        self.assertEqual(cmp['kind'],'multi-seed');self.assertTrue(cmp['paired_inputs_verified']);self.assertTrue(cmp['complete_pairs'])
        self.assertEqual(len(cmp['case_metrics']),6)
        for kind in ('metrics','traces','events','updates'):
            export=self.client.get(f'/api/runs/{rid}/export',params={'kind':kind,'format':'csv'})
            self.assertEqual(export.status_code,200,export.text)
            self.assertGreater(len(list(csv.DictReader(io.StringIO(export.text)))),0)
            self.assertIn('attachment',export.headers['content-disposition'])
        summary=self.client.get(f'/api/runs/{rid}/export?kind=summary&format=json').json()
        self.assertIn('tidelock/model.py',summary['manifest']['source_sha256'])
        self.assertNotIn('idempotency_hash',summary['run'])
        self.assertEqual(len(self.client.get(f'/api/runs/{rid}/metrics').json()),6)
    def test_all_archived_case_schemas_and_ledgers(self):
        scenarios=self.client.get('/api/scenarios').json()['scenarios']
        for scenario in scenarios:
            for controller in ('fixed','threshold','predictive'):
                with self.subTest(scenario=scenario['id'],controller=controller):
                    r=self.client.get('/api/evidence/pilot/case',params={'scenario':scenario['id'],'controller':controller})
                    self.assertEqual(r.status_code,200)
                    case=r.json();m=case['metrics'];last=case['traces'][-1]
                    self.assertEqual(m['scenario'],scenario['id'])
                    self.assertEqual(m['controller'],controller)
                    self.assertAlmostEqual(m['captured_kg'],last['captured_kg'])
                    self.assertEqual(last['time_s'],1800)
                    self.assertEqual(len(case['traces']),360)

    def test_validation_and_structured_errors(self):
        for body in ({'scenario':'invalid'},{'seeds':[True]},{'seeds':[1,1]},{'seeds':[-1]},
                     {'controllers':[]},{'controllers':['fixed','fixed']},{'duration_s':60},
                     {'dt_s':1},{'threshold_close_m':1.4,'threshold_open_m':1.2},{'path':'/tmp'}):
            with self.subTest(body=body):
                r=self.client.post('/api/runs',json=body)
                self.assertEqual(r.status_code,422);self.assertEqual(r.json()['error']['code'],'validation_error')
        self.assertEqual(self.client.get('/api/runs/not-a-run').status_code,404)
        self.assertEqual(self.client.get('/api/health',headers={'Origin':'https://unknown.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/unknown').status_code,404)
    def test_pilot_evidence_readonly_and_safety(self):
        files=list((ROOT/'results/pilot').rglob('*'))
        before={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()}
        health=self.client.get('/api/health').json();self.assertEqual(health['warning'],WARNING)
        self.assertEqual(len(self.client.get('/api/scenarios').json()['scenarios']),17)
        self.assertEqual(len(self.client.get('/api/controllers').json()),3)
        inventory=self.client.get('/api/evidence/pilot').json();self.assertTrue(inventory['immutable'])
        for name in ('metrics.csv','checks.json','convergence.csv','pareto.csv','manifest.json','RESULTS.md'):
            r=self.client.get('/api/evidence/pilot/files/'+name);self.assertEqual(r.status_code,200,r.text)
        page=self.client.get('/api/evidence/pilot/files/metrics.csv?offset=50&limit=50').json()
        self.assertEqual(page['total'],255);self.assertEqual(len(page['rows']),50)
        case=self.client.get('/api/evidence/pilot/case?scenario=sensor_bias&controller=predictive').json()
        self.assertTrue(any(e['category']=='injected' for e in case['events']))
        self.assertTrue(any(e['event']=='safety_limit_exceeded' for e in case['events']))
        self.assertGreater(case['metrics']['safety_violation_episodes'],0)
        for scope,expected in (('false',3),('true',15)):
            cmp=self.client.get('/api/evidence/pilot/comparison?multi_seed='+scope).json()
            self.assertEqual(cmp['successful_cases'],expected);self.assertTrue(cmp['complete_pairs'])
        for name in ('%2e%2e%2fmanifest.json','%2Fetc%2Fpasswd','unknown.csv'):
            self.assertEqual(self.client.get('/api/evidence/pilot/files/'+name).status_code,404)
        self.assertEqual(self.client.get('/api/evidence/pilot/download/metrics.csv').content,(ROOT/'results/pilot/metrics.csv').read_bytes())
        self.assertEqual(before,{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in files if p.is_file()})

class StoreTests(unittest.TestCase):
    def test_queue_deduplication_conflict_and_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            executor=HeldExecutor();store=RunStore(tmp,executor=executor,max_pending=2)
            first=store.submit(RunRequest(duration_s=300),'a')
            self.assertEqual(store.submit(RunRequest(duration_s=300),'b')['id'],first['id'])
            with self.assertRaises(StoreError) as error:store.submit(RunRequest(duration_s=600),'a')
            self.assertEqual(error.exception.status,409)
            store.submit(RunRequest(duration_s=600),'c')
            with self.assertRaises(StoreError) as error:store.submit(RunRequest(duration_s=900),'d')
            self.assertEqual(error.exception.status,429)
            with self.assertRaises(RuntimeError): RunStore(tmp,executor=HeldExecutor())
            store.close()
            reopened=RunStore(tmp,executor=HeldExecutor())
            self.assertEqual(reopened.get(first['id'])['status'],'failed')
            self.assertIn('restarted',reopened.get(first['id'])['error']);reopened.close()
    def test_partial_and_failed_cases_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            store=RunStore(tmp,executor=HeldExecutor())
            req=RunRequest(scenario='ordinary',duration_s=300,controllers=['fixed','threshold'])
            run=store.submit(req,None)
            real=execute_case
            def selective(req,controller,seed):
                if controller=='threshold': raise ValueError('injected test failure')
                return real(req,controller,seed)
            with patch('dashboard_api.store.execute_case',side_effect=selective),self.assertLogs('dashboard_api.store',level='ERROR'):
                execute_job(str(store.path(run['id'])))
            result=store.get(run['id']);self.assertEqual(result['status'],'partial')
            failed=[c for c in result['cases'] if c['status']=='failed']
            cmp=comparison(req,store.results(run['id']),failed)
            self.assertEqual(cmp.successful_cases,1);self.assertFalse(cmp.complete_pairs)
            self.assertEqual(cmp.aggregates[1]['capture_fraction'],None)
            with self.assertRaises(StoreError):store.result(run['id'],'threshold-11')
            store.close()
    def test_worker_failure_recorded_and_paths_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            ex=HeldExecutor();store=RunStore(tmp,executor=ex)
            run=store.submit(RunRequest(duration_s=300),None)
            with self.assertLogs('dashboard_api.store',level='ERROR'):ex.futures[0].set_exception(RuntimeError('worker stopped'))
            self.assertEqual(store.get(run['id'])['status'],'failed')
            for rid in ('../outside','/etc/passwd','x'*32):
                with self.assertRaises(StoreError):store.path(rid)
            store.close()

if __name__=='__main__':unittest.main()
