"""Run the predeclared pilot; preserve every outcome, including failures."""
import argparse
import csv
import hashlib
import json
import os
import platform
import sys
from pathlib import Path
from datetime import datetime, timezone
import numpy as np
from .scenarios import SCENARIOS, make_scenario
from .controllers import Fixed, Threshold, Predictive
from .simulation import simulate


def csv_write(path, rows):
    if not rows:
        return
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)


def nondominated(points):
    """Minimize risk, maximize capture. Ties are both retained."""
    return [i for i,(risk,cap) in enumerate(points) if not any(
        r <= risk and c >= cap and (r < risk or c > cap)
        for j,(r,c) in enumerate(points) if i != j)]


def run(output, seeds, scenarios):
    if not seeds or not scenarios or len(set(seeds)) != len(seeds) or len(set(scenarios)) != len(scenarios):
        raise ValueError('Choose non-empty lists of unique seeds and scenarios')
    output.mkdir(parents=True,exist_ok=True)
    metrics=[]; traces={}
    for scenario in scenarios:
        for seed in seeds:
            sc=make_scenario(scenario,seed)
            for c in (Fixed(),Threshold(),Predictive()):
                m,rows,events,updates=simulate(sc,c)
                metrics.append(m)
                if seed == seeds[0]:
                    stem=f'{scenario}_{c.name}'
                    csv_write(output/'traces'/f'{stem}.csv',rows)
                    csv_write(output/'events'/f'{stem}.csv',events)
                    csv_write(output/'updates'/f'{stem}.csv',updates)
                    traces[(scenario,c.name)]=rows
        print(f'Completed {scenario}',flush=True)
    csv_write(output/'metrics.csv',metrics)
    means=[]
    keys=('capture_fraction','escape_fraction','max_level_m','warning_excess_ms',
          'safety_violation_duration_s','captured_kg','incoming_kg','suspended_final_kg',
          'compute_median_ms','fallback_updates')
    for scenario in scenarios:
        for name in ('fixed','threshold','predictive'):
            group=[m for m in metrics if m['scenario']==scenario and m['controller']==name]
            row=dict(scenario=scenario,controller=name,seeds=len(group))
            for key in keys:
                row[key]=float(np.mean([m[key] for m in group]))
            means.append(row)
    csv_write(output/'scenario_means.csv',means)
    frontier=[]
    sc=make_scenario('compound',11)
    variants=[('fixed',Fixed())]+[(f'threshold {x:.2f}',Threshold(x,x-.20)) for x in [1.15,1.30,1.45]]
    variants += [(f'predictive cap {x:.2f}',Predictive(x)) for x in [1.40,1.50,1.60]]
    for label,c in variants:
        m,*_=simulate(sc,c)
        frontier.append(dict(label=label,warning_excess_ms=m['warning_excess_ms'],
                             captured_kg=m['captured_kg'],violation_s=m['safety_violation_duration_s']))
    nd=nondominated([(r['warning_excess_ms'],r['captured_kg']) for r in frontier])
    for i,r in enumerate(frontier):
        r['nondominated']=i in nd
    csv_write(output/'pareto.csv',frontier)
    convergence=[]
    for scenario in ('ordinary','compound'):
        sc=make_scenario(scenario,11,deterministic=True)
        a,*_=simulate(sc,Fixed(),5)
        b,*_=simulate(sc,Fixed(),2.5)
        convergence.append(dict(scenario=scenario,peak_difference_m=abs(a['max_level_m']-b['max_level_m']),
                                capture_difference_fraction_of_input=abs(a['captured_kg']-b['captured_kg'])/a['incoming_kg']))
    csv_write(output/'convergence.csv',convergence)
    wins=[]
    for scenario in ('monsoon','high_tide','compound','near_full'):
        g={r['controller']:r for r in means if r['scenario']==scenario}
        if 'predictive' not in g:
            continue
        if (g['predictive']['safety_violation_duration_s']==0 and
            g['threshold']['safety_violation_duration_s']==0 and
            g['predictive']['capture_fraction']-g['threshold']['capture_fraction']>=.05):
            wins.append(scenario)
    checks={
        'conservation_pass':all(max(m['water_residual_relative'],m['plastic_residual_relative'])<1e-8 for m in metrics),
        'ordinary_safety_pass':all(m['safety_violation_episodes']==0 for m in metrics if m['scenario']=='ordinary') if 'ordinary' in scenarios else None,
        'convergence_pass':all(r['peak_difference_m']<.03 and r['capture_difference_fraction_of_input']<.02 for r in convergence),
        'predictive_median_compute_target_pass':all(m['compute_median_ms']<1000 for m in metrics if m['controller']=='predictive'),
        'hypothesis_qualifying_scenarios':wins,
        'hypothesis_at_least_two_pass':len(wins)>=2 if set(('monsoon','high_tide','compound','near_full')).issubset(scenarios) else None,
        'infeasible_extreme_tide_alert_pass':all(m['fallback_updates']>0 for m in metrics if m['scenario']=='extreme_tide' and m['controller']=='predictive') if 'extreme_tide' in scenarios else None}
    (output/'checks.json').write_text(json.dumps(checks,indent=2)+'\n')
    root=Path(__file__).resolve().parents[1]
    source_files=sorted((root/'tidelock').glob('*.py'))+[root/'docs'/'experiment_protocol.md']
    manifest=dict(created_utc=datetime.now(timezone.utc).isoformat(),
                  evidence='SYNTHETIC SIMULATION; NOT FIELD VALIDATED',
                  python=sys.version,numpy=np.__version__,platform=platform.platform(),
                  seeds=seeds,scenarios=list(scenarios),runs=len(metrics),
                  parameters=make_scenario('ordinary').p.dictionary(),
                  source_sha256={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_files})
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    plots(output,traces,means,frontier,seeds[0])
    lines=['# TideLock pilot results','',
           '**Synthetic, uncalibrated model. Not evidence of real Mumbai drainage performance.**','',
           f'{len(metrics)} runs; seeds {seeds}. All prescribed cases retained. Means below are descriptive, not confidence intervals.','',
           '| Scenario | Controller | Captured % | Escaped % | Peak level m | Safety violation s |',
           '|---|---|---:|---:|---:|---:|']
    for r in means:
        lines.append(f"| {r['scenario']} | {r['controller']} | {100*r['capture_fraction']:.1f} | {100*r['escape_fraction']:.1f} | {r['max_level_m']:.3f} | {r['safety_violation_duration_s']:.0f} |")
    lines += ['','Plastic not captured or escaped remains suspended in storage. Initial basket inventory is excluded from newly captured mass.',
              '', '## Predeclared checks','', '```json',json.dumps(checks,indent=2),'```','',
              '## Interpretation','',
              'The pilot tests the mechanics and exposes limitations. A successful conservation or runtime check does not validate the capture law, forecast, or hydraulic geometry. The hypothesis outcome must be reported as shown; no post-run tuning was used to alter these benchmark results.',
              '', 'Null checks were not evaluated because required scenarios were omitted. The frontier is the nondominated subset of seven tested settings on seed-11 compound conditions; it is not a global Pareto optimum. Dashed segments are visual guides, not additional achievable policies. See pareto.csv for safety violations at every point.',
              '', 'Warnings and violations are evaluated against actual simulated levels, not noisy sensor values. The MPC checks only 27 plans over five sampled uncertainty cases and can miss other feasible actions. Some alerts mean this limited candidate set is infeasible, not that every physical control strategy is impossible.',
              '', '![Compound scenario](compound.png)','', '![Tradeoff](pareto.png)','',
              '![Extreme tide](extreme_tide.png)','', '![Sensor fault](sensor_bias.png)']
    (output/'RESULTS.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps(checks,indent=2),flush=True)


def plots(output,traces,means,frontier,trace_seed=11):
    os.environ.setdefault('MPLCONFIGDIR',str(output/'.matplotlib'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family':'DejaVu Sans','axes.spines.top':False,
                         'axes.spines.right':False,'figure.dpi':140})
    colors={'fixed':'#a94343','threshold':'#d59122','predictive':'#007d89'}
    for scenario in ('compound','extreme_tide','sensor_bias','ordinary'):
        if (scenario,'fixed') not in traces:
            continue
        fig,axes=plt.subplots(3,1,figsize=(10,9),sharex=True,layout='constrained')
        for name in colors:
            rows=traces[(scenario,name)]
            t=np.array([r['time_s']/60 for r in rows])
            for ax,key in zip(axes,['h_m','captured_kg','actuator']):
                ax.plot(t,[r[key] for r in rows],label=name,color=colors[name],lw=1.8)
        rows=traces[(scenario,'fixed')]
        axes[0].plot(t,[r['tide_m'] for r in rows],label='downstream tide',color='#79838e',ls=':')
        axes[0].axhline(1.60,color='#a94343',ls='--',label='safety limit 1.60 m')
        axes[0].axhline(1.30,color='#9b9b9b',ls='--',label='warning 1.30 m')
        axes[0].legend(ncol=3,fontsize=8,loc='upper right')
        axes[0].set_ylabel('Level above invert (m)')
        axes[1].set_ylabel('New plastic captured (kg)')
        axes[2].set_ylabel('Bypass opening (0-1)')
        axes[2].set_xlabel('Simulated time (minutes)')
        for ax in axes:
            ax.grid(alpha=.15)
        if scenario=='sensor_bias':
            for ax in axes:
                ax.axvspan(10,15,alpha=.10,color='purple')
        fig.suptitle(f'TideLock / {scenario.replace("_"," ")} / seed {trace_seed}\nSynthetic model; not field validated',fontsize=14)
        fig.savefig(output/f'{scenario}.png'); plt.close(fig)
    fig,ax=plt.subplots(figsize=(10,6),layout='constrained')
    nd=[]
    for i,r in enumerate(frontier):
        color=colors['predictive' if r['label'].startswith('predictive') else 'threshold' if r['label'].startswith('threshold') else 'fixed']
        ax.scatter(r['warning_excess_ms'],r['captured_kg'],s=65,color=color,marker='x' if r['violation_s']>0 else 'o')
        ax.annotate(f"{i+1}",(r['warning_excess_ms'],r['captured_kg']),xytext=(5,6),textcoords='offset points')
        if r['nondominated']:
            nd.append((r['warning_excess_ms'],r['captured_kg']))
    nd=sorted(nd)
    if nd:
        ax.plot(*zip(*nd),ls='--',color='#888',alpha=.7)
    ax.set_xlabel('Warning exceedance integral (m s); lower is better')
    ax.set_ylabel('New plastic captured (kg); higher is better')
    ax.set_title('Empirical capture / hydraulic-risk frontier\nCompound event, seed 11; x marks safety violations')
    ax.text(1.02,.98,'\n'.join(f'{i+1}. {r["label"]}' for i,r in enumerate(frontier)),
            transform=ax.transAxes,va='top',fontsize=9)
    ax.grid(alpha=.15)
    fig.savefig(output/'pareto.png'); plt.close(fig)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path('results/local'))
    parser.add_argument('--seeds',type=int,nargs='+',default=[11,23,37,51,79])
    parser.add_argument('--scenarios',nargs='+',choices=SCENARIOS,default=SCENARIOS)
    args=parser.parse_args()
    run(args.output,args.seeds,args.scenarios)


if __name__=='__main__':
    main()
