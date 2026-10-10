# TideLock

**Predictive plastic interception under tidal drainage constraints.**

Research-first, software-only feasibility prototype for InnovateX Theme 3. This repository contains a small runnable virtual plant and evidence package, with an integrated interactive dashboard. It is not a field-ready drainage controller.

## Interactive dashboard

Seven working screens connect directly to the existing simulator: overview, simulation laboratory, controller comparison, state replay, event/fault log, experiment evidence and model health. New runs are stored separately; the committed pilot is preserved.

See [installation, architecture, API contracts, limitations and demo guide](docs/dashboard.md).

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dashboard-lock.txt
npm --prefix frontend ci
npm --prefix frontend run build
python -m uvicorn dashboard_api.app:app --host 127.0.0.1 --port 8000
```

Open **http://127.0.0.1:8000**. API documentation: **http://127.0.0.1:8000/docs**. Use one API worker and a local filesystem for active run storage. Requires Python 3.12+ and Node 22.12+ for the pinned dashboard dependencies.

## Start here

- [One-page abstract](docs/round1_abstract.md)
- [Prior art, three candidate contributions and selected claim](docs/prior_art.md)
- [Model, equations, assumptions and architecture](docs/mathematical_model.md)
- [Predeclared experiment protocol](docs/experiment_protocol.md)
- [Executed pilot results](results/pilot/RESULTS.md)
- [Costing, deployment, team plan, pitch, judge Q&A and risks](docs/development_plan.md)
- [Run in Google Colab](https://colab.research.google.com/github/aaditgarg01/TideLock/blob/main/notebooks/TideLock_Feasibility.ipynb)

## What is built

Conservative storage/debris simulator; fixed, hysteretic and finite-horizon predictive controllers; noisy/failed virtual water-level sensors; rate-limited, delayed or stuck actuator; finite basket and maintenance events; tide/backflow cases; shared seeded disturbances; CSV evidence, event logs and charts; automated physics tests; a My Drive-ready notebook.

**Not built yet:** Independent hydraulic calibration, comprehensive fault-tolerant safety supervisor, field cost quotations, real Mumbai data or hardware. Those are later milestones in the development plan, consistent with starting from the research and minimal experiment first.

## What the pilot actually found

17 synthetic scenarios × 5 seeds × 3 controllers = **255 runs**. All parameters are explicitly labeled synthetic unless otherwise sourced. No site-level claim is made.

| Compound rain/tide event, five-seed mean | Fixed | Threshold | Predictive |
|---|---:|---:|---:|
| Incoming plastic | 34.15 kg | 34.15 kg | 34.15 kg |
| New plastic captured | 58.7% | 39.0% | 45.1% |
| Peak upstream level | 2.159 m | 1.583 m | 1.550 m |
| Time above 1.60 m safety limit | 559 s | 0 s | 0 s |

Predictive capture improves by **6.1 percentage points** against the main threshold setting in that event. Its warning-exceedance integral is slightly worse, so it does not dominate every risk metric. It has no capture advantage in ordinary and high-tide-only cases. **Near-full baskets and several sensor-fault scenarios still violate the safety limit.** Extreme downstream tide can make safe gravity drainage physically impossible. A fallback request is not a guarantee of safety.

![Compound scenario comparison](results/pilot/compound.png)

The research hypothesis met the predeclared pilot target in monsoon and compound scenarios only. These results use synthetic forecast schedules and a common plant/predictor model structure; independent validation and stronger baselines remain necessary. Novelty is provisional. See all adverse outcomes in the results, rather than quoting this table alone.

## Run locally

Requires Python 3.11+; tested with the versions in requirements-lock.txt. From this repository folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
python -m unittest discover -s tests -p test_physics.py -v
python -m tidelock.benchmark --output results/local
```

On Windows, activate with `.venv\Scripts\activate` instead. The checked-in pilot evidence stays unchanged; new results go to results/local by default. A shorter repeat:

```bash
python -m tidelock.benchmark --scenarios ordinary compound sensor_bias extreme_tide --seeds 11 --output results/local
```

For the physical metrics, fixed seed and configuration are deterministic. Computation timings and manifest creation times vary by machine. Every run records its input hash; all three controllers see the same input realization for each scenario/seed. The input generator and model source hashes are recorded in manifest.json. No cloud service or private data is needed.

## Run from My Drive

Open notebooks/TideLock_Feasibility.ipynb with Colab. Its first code cell mounts your Drive and uses `/content/drive/MyDrive/TideLock`. Authorize your own notebook session when prompted. It installs only the declared numerical/plotting dependencies and writes new results inside the project. The notebook has been syntax-checked locally; its Drive-mount interaction has not been executed in your Colab account.

## Evidence map

- metrics.csv: every controller/scenario/seed result, including failure and recovery fields.
- scenario_means.csv: descriptive five-seed means, not confidence intervals.
- traces/: first-seed time histories including true levels, actuator state and mass residuals.
- events/ and updates/: injected faults, maintenance, commands, modes, reliability flags and computation times.
- checks.json: predeclared checks and hypothesis outcome.
- convergence.csv: deterministic 5 s versus 2.5 s integration check.
- pareto.csv and pareto.png: empirical nondominated set of seven settings, not a global optimum; unsafe points marked.
- manifest.json: parameters, seeds, platform, source hashes and evidence status.

The regional context is Mumbai; the topology is motivated by documented tidal drainage practice. It is not a surveyed model of any particular outlet. Do not use these parameters or control commands on physical drainage infrastructure.
