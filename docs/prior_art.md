# Prior art and contribution decision

Review date: 9 October 2026. Focused public-source review, not an exhaustive literature search or patent-clearance opinion. Source descriptions below reflect the specific pages/abstracts reviewed, not an assertion about every capability of each system. Manufacturer performance claims have not been independently validated here.

## Closest approaches

| Existing approach | What the reviewed evidence already establishes | Consequence for TideLock |
|---|---|---|
| [Ocean Cleanup Interceptor Original](https://theoceancleanup.com/rivers/interceptor-original/) | Guided collection, conveyor extraction, sensor-based container distribution and full-capacity notification. | Automated capture, collection capacity sensing and operator alerts are not new. |
| [Wing-Gate automatic retractable screen](https://unitedstormwater.com/wing_gate.php) | A pressure-operated inlet screen opens during high flow and returns when flow subsides. | “Open the screen to avoid flooding” is already an established product mechanism. |
| [NWPX Park TrashTrooper TTB](https://www.nwpxpark.com/products/trash-interceptor/) | The product description explicitly includes a mechanical bypass for screen clogging and upstream flood prevention. | Compare with passive high-flow bypass, not only a permanently obstructed screen. The current threshold controller is a strong first abstraction, not a calibrated model of this product. |
| [Oh & Bartos, Water Research (2023)](https://doi.org/10.1016/j.watres.2023.119825), [author code](https://github.com/future-water/mpc-pond) | MPC controls detention-basin outlet releases for pollution removal and flood objectives; EKF assimilation addresses uncertainty. | Flood/pollution optimization, forecasts and data assimilation are prior art. Macroplastic basket loading and tidal bypass operation are a possible application-specific distinction, not proof of novelty. |
| [Kim, Oh & Bartos (2025)](https://future-water.org/publication/2025-01-01-stormwater) | The authors describe a stormwater digital twin that estimates hydraulic states while identifying and rejecting faulty sensor measurements. | Sensor validation and a stormwater digital twin cannot be standalone novelty claims. Our residual/stuck-value checks are much simpler and less validated. |
| [EPA SWMM 5.2 manual](https://www.epa.gov/system/files/documents/2022-04/swmm-users-manual-version-5.2.pdf) | Supports tidal outfall boundaries, flow regulators and backflow prevention; Appendix B.4 distinguishes boundary levels and tide gates. | Signed head and nonreturn behavior must be explicit. “Gate open” and “drainage safe” are different statements. |
| [BMC Mahul pumping-station tender, hydraulic controls](https://portal.mcgm.gov.in/irj/go/km/docs/documents/Tenders/ETH/ETH_7000021132_1_120822.pdf) | Specifies upstream/downstream sensing, tide-dependent gate operation and pumping when gravity drainage is restricted. | Two level sensors and tidal gate logic are already locally specified. TideLock must complement existing drainage operations, not claim to invent them. |
| [EPA flow-control retrofit work](https://www.epa.gov/emergency-response-research/stormwater-management-technologies-flow-control-devices) | Describes outfall restriction designed around receiving-water flow objectives and upstream flood avoidance. | Hydraulic safety constraints are established engineering practice. |

Research searches included automated trash bypass, stormwater MPC, waste interception safety constraints, tidal outfall control and drainage sensor faults. An exact published implementation of the full TideLock combination was not established in this limited review. That is an unresolved search result, not evidence that none exists. A targeted patent and reference-chain review remains necessary before stronger originality claims.

## Three candidate contributions

Scores are our prioritization judgments on a 1–5 scale, not experimental measurements. “Novelty” means plausible differentiation from the sources above and remains unverified.

| Rank / candidate | Novelty | Student feasibility | Measurable | Impact potential | 10-minute clarity |
|---|---:|---:|---:|---:|---:|
| 1. Basket-aware, head-sensitive predictive bypass control with an explicit operating-envelope benchmark | 3 | 4 | 5 | 4 | 5 |
| 2. Sensor-confidence-aware safety supervisor for a tidal interceptor | 2 | 3 | 4 | 4 | 4 |
| 3. Joint collection scheduling and interception control under uncertain maintenance availability | 3 | 2 | 3 | 4 | 3 |

**Select candidate 1.** Its central question is whether the evolving obstruction caused by retained macroplastic changes when bypass should begin and end. Treat the finite basket and tidal head as coupled control constraints, and report the conditions under which interception must be curtailed. Fault injection is a stress test, not a second research contribution. Joint logistics optimization would require reliable collection-cost and service-time data we do not have.

## Defensible claim

“TideLock is a reproducible feasibility study of basket-aware predictive bypass control for a simplified tidal plastic interceptor. It compares capture, hydraulic constraint violations and degraded operation against fixed and hysteretic control under shared disturbances.”

Do not say “first smart barrier,” “novel MPC,” “flood-proof,” “patent-free,” or “validated digital twin of Mumbai.” This is a virtual plant with synthetic parameters. Scientific novelty and field advantage are not established. To distinguish the mechanism itself, remove basket awareness and tide prediction in separate ablations; without those, improvements cannot be attributed uniquely to the selected contribution.

## Decision after the pilot

Continue with a bounded research prototype, not a municipal product claim. The pilot supports testing the control tradeoff further, but fault cases expose unsafe states and the near-full basket gains no new capture over threshold control. Next: stronger observer/fallback design, passive-bypass comparison, forecast and basket ablations, then independently calibrated hydraulics. If the simpler threshold or passive design matches performance after fair tuning, prefer it.
