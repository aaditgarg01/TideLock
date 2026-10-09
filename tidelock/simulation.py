"""Deterministic runner and honest conservation/risk metrics."""
from dataclasses import replace
import time
import numpy as np
from .model import Parameters, step
from .controllers import Observation


def simulate(sc, controller, dt=5.0):
    if dt <= 0 or abs(30/dt-round(30/dt)) > 1e-9 or abs(5/dt-round(5/dt)) > 1e-9:
        raise ValueError('Integration step must divide 5 s and 30 s')
    p = sc.p
    nominal = Parameters()  # A hidden flap failure is not revealed to control.
    h,b,m,a = .85, sc.initial_basket, 0., 0.
    est_h,est_m = h,m
    initial_volume = h*p.storage_area
    input_water = discharge = spill_total = 0.
    incoming = captured = escaped = removed = 0.
    rows,events,updates = [],[],[]
    history_h, history_d = [h], [float(sc.tide[0])]
    observed_history = []
    target = 0.
    previous_mode = None
    command_history = [(0.,0.)]
    last_trusted_time = 0.
    stuck_value = None
    mode = 'initial'
    last_fault = False
    for k in range(int(sc.duration/dt)):
        t = k*dt
        ix = sc.index(t)
        active = sc.active_fault(t)
        has_fault = sc.name in ('sensor_bias','sensor_stuck','communication_loss',
                                'telemetry_delay','actuator_delay','actuator_stuck','capacity_error')
        if has_fault and active != last_fault:
            events.append(dict(time_s=t,event='fault_start' if active else 'fault_end',detail=sc.name))
            last_fault = active
        if sc.name == 'maintenance' and abs(t-1200) < dt/2:
            removed += b
            events.append(dict(time_s=t,event='maintenance',detail=f'Removed {b:.6f} kg'))
            b = 0.
        if k % round(30/dt) == 0:
            age = 90. if active and sc.name == 'telemetry_delay' else 0.
            old = max(0,k-round(age/dt))
            old_ix = sc.index(max(t-age,0))
            sensed_h = history_h[old] + sc.noise[old_ix,0]
            sensed_d = history_d[old] + sc.noise[old_ix,1]
            reason = 'ok'
            if active and sc.name == 'sensor_bias':
                sensed_h -= .30
            if active and sc.name == 'sensor_stuck':
                if stuck_value is None:
                    stuck_value = sensed_h
                sensed_h = stuck_value
            observed_history.append(sensed_h)
            if active and sc.name == 'communication_loss':
                reason = 'missing packet'
            elif age > 60:
                reason = 'stale timestamp'
            elif len(observed_history) >= 4 and np.ptp(observed_history[-4:]) < 1e-10:
                reason = 'unchanged sensor for four readings'
            elif abs(sensed_h-est_h) > .20:
                reason = 'model innovation exceeds 0.20 m'
            reliable = reason == 'ok'
            if reliable:
                est_h = max(0.,sensed_h)
                last_trusted_time = t
            # On missing/stale telemetry, downstream uses the last forecast,
            # never the simulator's hidden true tide.
            d_est = sensed_d if reason not in ('missing packet','stale timestamp') else sc.forecast_tide[ix]
            b_est = np.clip(b - (8 if active and sc.name == 'capacity_error' else 0),0,p.basket_capacity)
            o = Observation(est_h,float(d_est),float(b_est),est_m,a,reliable,reason,
                            .025 + .001*(t-last_trusted_time))
            ids = np.minimum(ix+np.arange(36),len(sc.times)-1)
            forecast = np.column_stack([sc.forecast_q[ids],sc.forecast_tide[ids],
                                        sc.forecast_plastic[ids],np.full(36,sc.blockage)])
            start = time.perf_counter()
            target,mode,nvalid = controller.decide(o,forecast,nominal)
            elapsed = time.perf_counter()-start
            updates.append(dict(time_s=t,mode=mode,seconds=elapsed,feasible_plans=nvalid,
                                reliable=reliable,reason=reason,target=target))
            command_history.append((t,target))
            if mode != previous_mode:
                events.append(dict(time_s=t,event='mode',detail=mode+'; '+reason))
                previous_mode = mode
            if len(command_history)>2 and target != command_history[-2][1]:
                events.append(dict(time_s=t,event='bypass_command',detail=str(target)))
        applied_target = target
        if active and sc.name == 'actuator_delay':
            applied_target = next((u for when,u in reversed(command_history) if when <= t-90),0.)
        rate = 0. if active and sc.name == 'actuator_stuck' else 1.
        z = step(h,b,m,a,applied_target,sc.qin[ix],sc.tide[ix],sc.plastic[ix],p,dt,
                 sc.blockage,sc.hydraulic_factor,sc.capture_factor,rate)
        # Nominal internal inventory prediction uses synthetic forecasts and
        # measured actuator position. No true suspended mass enters control.
        ez = step(est_h,b_est,est_m,a,target,sc.forecast_q[ix],sc.forecast_tide[ix],
                  sc.forecast_plastic[ix],nominal,dt,sc.blockage)
        est_h,est_m = float(ez['h']),float(ez['suspended'])
        prev_a = a
        h,b,m,a = (float(z[key]) for key in ('h','basket','suspended','actuator'))
        input_water += sc.qin[ix]*dt
        discharge += float(z['q'])*dt
        spill_total += float(z['spill'])
        incoming += float(z['incoming'])
        captured += float(z['captured'])
        escaped += float(z['escaped'])
        water_error = initial_volume + input_water - discharge - spill_total - h*p.storage_area
        plastic_error = sc.initial_basket + incoming - escaped - removed - b - m
        rows.append(dict(time_s=t+dt,h_m=h,tide_m=float(sc.tide[ix]),qin_m3s=float(sc.qin[ix]),
                         qout_m3s=float(z['q']),basket_kg=b,suspended_kg=m,
                         captured_kg=captured,escaped_kg=escaped,incoming_kg=incoming,
                         removed_kg=removed,actuator=a,target=target,mode=mode,
                         spill_m3=spill_total,rejected_kg=float(z['rejected']),
                         water_error_m3=water_error,plastic_error_kg=plastic_error,
                         travel=abs(a-prev_a)))
        history_h.append(h)
        history_d.append(float(sc.tide[sc.index(t+dt)]))
    levels = np.array([r['h_m'] for r in rows])
    violation = levels > p.safety_level+1e-9
    rejected = np.array([r['rejected_kg']>1e-12 for r in rows])
    episodes = lambda mask: int(np.count_nonzero(mask & ~np.r_[False,mask[:-1]]))
    recovery = None
    if has_fault and controller.name != 'fixed':
        for i,u in enumerate(updates[:-2]):
            if u['time_s'] >= sc.fault_end and all('ALERT' not in v['mode'] for v in updates[i:i+3]):
                recovery = u['time_s']-sc.fault_end
                break
    costs = np.array([u['seconds'] for u in updates])
    metrics = dict(scenario=sc.name,seed=sc.seed,controller=controller.name,
                   disturbance_sha256=sc.digest(),dt_s=dt,
                   incoming_kg=incoming,captured_kg=captured,escaped_kg=escaped,
                   suspended_final_kg=m,initial_basket_kg=sc.initial_basket,
                   basket_final_kg=b,removed_kg=removed,
                   capture_fraction=captured/incoming,escape_fraction=escaped/incoming,
                   max_level_m=max(.85,float(levels.max())),
                   warning_duration_s=float((levels>p.warning_level).sum()*dt),
                   warning_excess_ms=float(np.maximum(levels-p.warning_level,0).sum()*dt),
                   safety_violation_episodes=episodes(violation),
                   safety_violation_duration_s=float(violation.sum()*dt),
                   basket_rejected_capture_episodes=episodes(rejected),basket_overflow_events=0,
                   spill_m3=spill_total,
                   actuator_command_changes=sum(e['event']=='bypass_command' for e in events),
                   actuator_total_travel=sum(r['travel'] for r in rows),
                   recovery_after_fault_s=recovery,
                   fallback_updates=sum('ALERT' in u['mode'] for u in updates),
                   compute_median_ms=float(np.median(costs)*1000),
                   compute_p95_ms=float(np.percentile(costs,95)*1000),
                   water_residual_relative=max(abs(r['water_error_m3']) for r in rows)/max(initial_volume+input_water,1),
                   plastic_residual_relative=max(abs(r['plastic_error_kg']) for r in rows)/max(sc.initial_basket+incoming,1))
    return metrics,rows,events,updates
