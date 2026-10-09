import unittest
from dataclasses import replace
import numpy as np
from tidelock.model import Parameters, step
from tidelock.scenarios import make_scenario
from tidelock.controllers import Fixed, Threshold, Predictive, Observation, fallback
from tidelock.simulation import simulate


class PhysicsTests(unittest.TestCase):
    def test_randomized_conservation_and_bounds(self):
        rng = np.random.default_rng(921)
        for flap in (True,False):
            p = Parameters(nonreturn_flap=flap)
            h=rng.uniform(0,2.8,200); b=rng.uniform(0,40,200); m=rng.uniform(0,4,200)
            a=rng.uniform(0,1,200); q=rng.uniform(0,2,200); load=rng.uniform(0,.1,200)
            z=step(h,b,m,a,rng.uniform(0,1,200),q,rng.uniform(0,3,200),load,p)
            np.testing.assert_allclose(h*120+q*5-z['q']*5-z['spill'],z['h']*120,atol=1e-10)
            np.testing.assert_allclose(b+m+load*5,z['basket']+z['suspended']+z['escaped'],atol=1e-10)
            self.assertTrue(np.all(z['h'] >= 0))
            self.assertTrue(np.all(z['basket'] <= 40))
            self.assertTrue(np.all(np.abs(z['actuator']-a) <= 5/60+1e-12))

    def test_opening_can_increase_backflow(self):
        p=Parameters(nonreturn_flap=False)
        shut=step(.8,0.,0.,0.,0.,0.,2.,0.,p)
        opened=step(.8,0.,0.,1.,1.,0.,2.,0.,p)
        self.assertLess(opened['q'],shut['q'])
        self.assertGreater(opened['h'],shut['h'])
        protected=step(.8,0.,0.,1.,1.,0.,2.,0.,Parameters())
        self.assertEqual(protected['q'],0)

    def test_full_basket_cannot_destroy_plastic(self):
        p=Parameters()
        z=step(1.5,40.,5.,0.,0.,.2,.3,.1,p)
        self.assertEqual(z['captured'],0)
        self.assertAlmostEqual(5+.5,z['escaped']+z['suspended'])

    def test_empty_storage_and_spill(self):
        p=Parameters()
        z=step(0.,0.,0.,1.,1.,0.,0.,0.,p)
        self.assertEqual(z['h'],0)
        z=step(2.79,0.,5.,0.,0.,10.,3.,1.,p)
        self.assertGreater(z['spill'],0)
        self.assertAlmostEqual(z['h'],2.8)

    def test_deterministic_shared_inputs(self):
        s=make_scenario('compound',11)
        s2=make_scenario('compound',11)
        self.assertEqual(s.digest(),s2.digest())
        a,rows,_,_=simulate(s,Fixed())
        b,rows2,_,_=simulate(s2,Fixed())
        self.assertEqual(rows,rows2)
        self.assertLess(a['water_residual_relative'],1e-8)
        self.assertLess(a['plastic_residual_relative'],1e-8)

    def test_maintenance_ledger(self):
        m,_,_,_=simulate(make_scenario('maintenance'),Fixed())
        self.assertGreater(m['removed_kg'],0)
        self.assertAlmostEqual(m['incoming_kg']+m['initial_basket_kg'],
                               m['escaped_kg']+m['removed_kg']+m['basket_final_kg']+m['suspended_final_kg'])

    def test_hysteresis(self):
        c=Threshold(); p=Parameters()
        o=Observation(1.4,.3,0,0,0,True,'ok')
        self.assertEqual(c.decide(o,None,p)[0],1)
        self.assertEqual(c.decide(replace(o,h=1.2),None,p)[0],1)
        self.assertEqual(c.decide(replace(o,h=1.0),None,p)[0],0)

    def test_fallback_and_infeasible_tide(self):
        o=Observation(.8,2.,0,0,0,False,'missing',.1)
        self.assertEqual(fallback(o)[0],0)
        o=replace(o,h=1.5,tide=.3)
        self.assertEqual(fallback(o)[0],1)
        forecast=np.tile([2.,2.,.02,0.],(36,1))
        _,mode,n=Predictive().decide(replace(o,reliable=True),forecast,Parameters())
        self.assertIn('no feasible',mode)
        self.assertEqual(n,0)

    def test_ordinary_safety_and_fault_visibility(self):
        for c in (Fixed(),Threshold(),Predictive()):
            m,_,_,_=simulate(make_scenario('ordinary'),c)
            self.assertEqual(m['safety_violation_episodes'],0)
        m,_,events,_=simulate(make_scenario('communication_loss'),Predictive())
        self.assertGreater(m['fallback_updates'],0)
        self.assertTrue(any(e['event']=='fault_start' for e in events))


if __name__ == '__main__':
    unittest.main()
