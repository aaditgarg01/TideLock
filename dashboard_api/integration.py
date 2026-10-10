"""Adapter: reuse the existing engine without altering pilot behavior."""
from dataclasses import replace
import hashlib
from pathlib import Path
import numpy as np
from tidelock.scenarios import make_scenario, SCENARIOS
from tidelock.controllers import Fixed, Threshold, Predictive
from tidelock.simulation import simulate
from .schemas import RunRequest, CaseResult, Metrics, Event, Comparison

ROOT = Path(__file__).resolve().parents[1]
WARNING = ('TideLock is an experimental simulation and is not validated for real drainage operations. '
           'A safe-state command does not guarantee flood prevention.')
DESCRIPTIONS = {
    'ordinary':'Modest runoff with low downstream tide.',
    'monsoon':'Intense synthetic runoff pulse with low tide.',
    'high_tide':'Elevated tide with modest runoff.',
    'compound':'Coincident runoff surge and elevated downstream tide.',
    'blockage':'Compound conditions with 40% additional screen blockage.',
    'near_full':'Compound conditions; basket starts at 36 of 40 kg.',
    'sensor_bias':'Upstream level reads 0.30 m too low from 600–900 s.',
    'sensor_stuck':'Upstream level freezes from 600–900 s.',
    'communication_loss':'Level telemetry is missing from 600–900 s; local position/fill remain.',
    'telemetry_delay':'Level packets are 90 s stale from 600–900 s.',
    'actuator_delay':'Bypass commands delayed 90 s from 600–900 s.',
    'actuator_stuck':'Actual actuator stops moving from 600–900 s.',
    'capacity_error':'Basket mass underestimated by 8 kg from 600–900 s.',
    'model_mismatch':'True hydraulic conductance −20%, capture coefficient −30%.',
    'maintenance':'Basket emptied at simulated time 1200 s.',
    'extreme_tide':'Downstream tide at 2 m; safe gravity drainage may be impossible.',
    'flap_failed':'Extreme tide with failed nonreturn flap; signed backflow permitted.'}


def source_hashes():
    return {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest()
            for directory in ('tidelock','dashboard_api') for p in sorted((ROOT/directory).glob('*.py'))}


def event_log(rows, events, updates, p):
    enriched=[]
    for e in events:
        kind=e['event']
        category=('injected' if kind.startswith('fault_') else 'command' if kind=='bypass_command'
                  else 'maintenance' if kind=='maintenance' else 'controller')
        severity='warning' if kind=='fault_start' or 'ALERT' in e['detail'] else 'info'
        enriched.append(Event(**e,category=category,severity=severity))
    previous_reliable=True
    for u in updates:
        if u['reliable'] != previous_reliable:
            enriched.append(Event(time_s=u['time_s'],severity='warning' if not u['reliable'] else 'info',
                category='detected',event='signal_unreliable' if not u['reliable'] else 'signal_recovered',
                detail=u['reason'],measurements={'reliable':u['reliable']}))
            previous_reliable=u['reliable']
    was_warning=was_unsafe=was_rejecting=False
    for r in rows:
        warning=r['h_m']>p.warning_level
        unsafe=r['h_m']>p.safety_level+1e-9
        rejecting=r['rejected_kg']>1e-12
        for changed,active,label,sev in ((warning!=was_warning,warning,'warning_level','warning'),
                (unsafe!=was_unsafe,unsafe,'safety_limit','critical'),
                (rejecting!=was_rejecting,rejecting,'basket_capture_rejected','warning')):
            if changed:
                enriched.append(Event(time_s=r['time_s'],severity=sev if active else 'info',category='condition',
                    event=label+('_exceeded' if active else '_cleared'),
                    detail=('Virtual plant condition; not a claim that the controller detected it. '
                            + ('Full basket rejects capture; physical basket overflow is not modeled.' if label.startswith('basket') else '')),
                    measurements={'level_m':r['h_m'],'basket_kg':r['basket_kg'],'actuator':r['actuator']}))
        was_warning,was_unsafe,was_rejecting=warning,unsafe,rejecting
    return sorted(enriched,key=lambda e:e.time_s)


def execute_case(request: RunRequest, controller: str, seed: int):
    sc=make_scenario(request.scenario,seed)
    sc.duration=request.duration_s
    c={'fixed':lambda:Fixed(),
       'threshold':lambda:Threshold(request.threshold_open_m,request.threshold_close_m),
       'predictive':lambda:Predictive(request.predictive_cap_m)}[controller]()
    metrics,rows,events,updates=simulate(sc,c,request.dt_s)
    return CaseResult(case_id=f'{controller}-{seed}',parameters=sc.p.dictionary(),metrics=metrics,traces=rows,
                      events=event_log(rows,events,updates,sc.p),updates=updates)


def comparison(request, cases, failed):
    metrics=[c.metrics for c in cases]
    fields=('capture_fraction','escape_fraction','captured_kg','escaped_kg','max_level_m',
            'safety_violation_duration_s','safety_violation_episodes','basket_overflow_events',
            'warning_excess_ms','compute_median_ms')
    aggregates=[]
    for name in request.controllers:
        group=[m for m in metrics if m.controller==name]
        a={'controller':name,'n':len(group),'expected_n':len(request.seeds)}
        for f in fields:
            values=[getattr(m,f) for m in group]
            a[f]=float(np.mean(values)) if values else None
            a[f+'_min']=min(values) if values else None
            a[f+'_max']=max(values) if values else None
        aggregates.append(a)
    paired=len(request.controllers)>1 and bool(metrics) and all(len({m.disturbance_sha256 for m in metrics if m.seed==seed})==1
                               for seed in request.seeds if any(m.seed==seed for m in metrics))
    complete=len(metrics)==len(request.controllers)*len(request.seeds)
    return Comparison(kind='multi-seed' if len(request.seeds)>1 else 'single-seed',
        expected_cases=len(request.controllers)*len(request.seeds),successful_cases=len(metrics),
        paired_inputs_verified=paired,complete_pairs=complete,case_metrics=metrics,aggregates=aggregates,
        failed_cases=failed,note='Means and ranges across completed seeds, not confidence intervals. '
        'Missing cases can bias means; compare complete pairs. Safety violations remain separate from capture.')
