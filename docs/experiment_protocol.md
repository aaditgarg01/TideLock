# Feasibility experiment protocol v1

Written before the first experiment run, 9 October 2026. This is a pilot protocol, not a registered study. All dimensions, inflow curves, plastic loads, faults and forecast errors are synthetic; none are measured in Mumbai.

## Question and locked comparison

Can basket-aware, finite-horizon bypass control capture more plastic at comparable upstream hydraulic risk than a fixed screen and a hysteretic threshold controller? A passive nonreturn flap is a separate modeled component, not the interception barrier. Its failure is an explicit test.

Use identical initial states and pre-generated disturbances/noise for all controllers in each scenario/seed. Main controllers: fixed bypass closed; hysteresis opens at 1.30 m and closes at 1.10 m; predictive 180 s horizon, 3 action blocks, 3 bypass settings, all 27 sequences enumerated. Main safety limit: 1.60 m; warning: 1.30 m. The 2.80 m storage rim is a different physical limit and spills are counted, never hidden by clipping at the safety threshold.

Five pilot seeds: 11, 23, 37, 51, 79. No picking a favorable seed for headline results. The deterministic replay uses seed 11, with its limitations visible. Test ordinary inflow, monsoon pulse, elevated tide, simultaneous tide/rain, partial blockage, near-full basket, bias, stuck sensor, missing telemetry, delayed telemetry, actuator delay, stuck actuator, capacity estimate error, flow/capture mismatch, maintenance, and extreme tide with and without the nonreturn flap. Integration step 5 s; controller period 30 s; duration 1800 s. Repeat deterministic cases at 2.5 s as a convergence check. Time-dependent noise is generated on the 5 s base grid, so numerical refinement does not change the disturbance realization.

## Targets specified before results

1. Water and plastic ledger residuals below 1e-8 relative to cumulative input plus initial inventory. Basket never exceeds capacity; water volume never becomes negative.
2. No safety-limit violations in ordinary conditions for all controllers. Do not require impossible drainage cases to be safe; they must produce explicit alerts.
3. Peak-level difference under step halving below 0.03 m, and final captured-mass difference below 2% of incoming mass, for deterministic fixed-controller ordinary and compound cases.
4. Predictive median computation below 1 s/update on the recorded development machine (target, not a hard real-time guarantee).
5. Research hypothesis, not a pass condition for software: at least 5 percentage points more capture than the threshold baseline at zero safety-limit violations in at least two of monsoon, tide, compound, near-full scenarios, in the five-seed means. If this fails, report failure and do not claim general superiority.

## Metrics and interpretation

Report input, captured, removed, escaped and still-suspended plastic separately; escape is not 1 - capture when material remains in storage. Initial basket material is not newly captured. Separate basket rejected-capture events from physical basket overflow (overflow is prevented by saturation in this model). Report level peaks, warning duration, violation episode count/duration, spill volume, movement count/travel, fault-to-normal recovery after the injected fault ends (null if unrecovered/not applicable), fallback count and update time.

Sweep threshold opening levels [1.15, 1.30, 1.45] with 0.20 m hysteresis, and predictive operating caps [1.40, 1.50, 1.60] on seed 11 compound conditions. The hard evaluation limit stays 1.60 m. Plot the empirical nondominated capture/risk set; do not call it a global optimal frontier. Use warning exceedance integral in m*s as the continuous risk proxy; show safety violations separately. Stronger follow-up: calibration seeds distinct from 20+ held-out seeds; tune thresholds and MPC budgets equally; forecast ablation, capacity ablation, passive high-flow bypass reference, and independent SWMM/flume plant validation.

## Claim boundary

The controller filters finitely many actions against sampled uncertainty corners. It does not prove recursive feasibility or continuous-set robustness. No terminal invariant set is supplied. Infeasibility triggers a head-aware fallback request and alert, not a promise of safety. A failed actuator cannot execute that request. The synthetic forecast is an imperfect advance schedule, not a deployed weather forecast. Run logs must preserve unsuccessful cases and all parameters.
