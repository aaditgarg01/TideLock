import type { Comparison, Controller } from "../types";
import { Panel, Badge, fmt, labels, colors } from "./Common";
import { Tradeoff } from "./Charts";
export function ComparisonView({ comparison }: { comparison: Comparison }) {
  const rows = comparison.aggregates;
  const fields: [string, string, string, number][] = [
    ["capture_fraction", "Plastic capture", "%", 100],
    ["escape_fraction", "Plastic escape", "%", 100],
    ["max_level_m", "Peak upstream level", "m", 1],
    ["safety_violation_duration_s", "Time above safety limit", "s", 1],
    ["safety_violation_episodes", "Safety violation episodes", "", 1],
    ["basket_overflow_events", "Basket overflow events", "", 1],
    ["compute_median_ms", "Median control update", "ms", 1],
  ];
  return (
    <div className="stack">
      <div className="comparison-banner">
        <div>
          <Badge
            tone={
              comparison.complete_pairs && comparison.paired_inputs_verified
                ? "teal"
                : "amber"
            }
          >
            {rows.length < 2
              ? "Single controller"
              : comparison.complete_pairs && comparison.paired_inputs_verified
                ? "Paired inputs verified"
                : "Incomplete comparison"}
          </Badge>
          <p>
            {comparison.kind === "multi-seed"
              ? "Multi-seed comparison · means with observed ranges"
              : "Single-seed comparison · individual outcomes"}
          </p>
        </div>
        <span className="mono">
          {comparison.successful_cases} / {comparison.expected_cases} cases
        </span>
      </div>
      <div className="two-col">
        <Panel
          title="Capture versus hydraulic risk"
          eyebrow="ALL COMPLETED CASES"
        >
          <Tradeoff comparison={comparison} />
          <p className="footnote">
            Each point is a controller/seed outcome. This is an observed
            trade-off, not a global Pareto frontier. Hover to inspect
            safety-limit violations.
          </p>
        </Panel>
        <Panel title="Controller performance" eyebrow="NO UNIVERSAL WINNER">
          <div className="bar-comparison">
            {rows.map((r) => (
              <div key={String(r.controller)}>
                <div className="split">
                  <strong>{labels[r.controller as Controller]}</strong>
                  <span className="mono">
                    {fmt(
                      typeof r.capture_fraction === "number"
                        ? r.capture_fraction * 100
                        : null,
                      1,
                    )}
                    %
                  </span>
                </div>
                <div className="bar-track">
                  <div
                    style={{
                      width: `${Number(r.capture_fraction || 0) * 100}%`,
                      background: colors[r.controller as Controller],
                    }}
                  />
                </div>
                <p>
                  {r.n} of {r.expected_n} seed(s) completed ·{" "}
                  <span
                    className={
                      Number(r.safety_violation_duration_s) > 0
                        ? "text-danger"
                        : ""
                    }
                  >
                    {fmt(r.safety_violation_duration_s as number, 0)} s above
                    safety limit
                  </span>
                </p>
              </div>
            ))}
          </div>
          <div className="notice">
            Predictive control can offer no benefit or perform worse. Faults,
            full baskets and extreme tides remain visible in the evidence.
          </div>
        </Panel>
      </div>
      <Panel title="Metric-by-metric comparison">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                {rows.map((r) => (
                  <th key={String(r.controller)}>
                    {labels[r.controller as Controller]}
                    <small>
                      n = {r.n} / {r.expected_n}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map(([key, label, unit, mult]) => (
                <tr key={key}>
                  <td>{label}</td>
                  {rows.map((r) => (
                    <td
                      key={String(r.controller)}
                      className={
                        key.startsWith("safety") && Number(r[key]) > 0
                          ? "text-danger"
                          : ""
                      }
                    >
                      {fmt(
                        r[key] === null ? null : Number(r[key]) * mult,
                        key.includes("episodes") || key.includes("events")
                          ? 0
                          : 2,
                      )}{" "}
                      {unit}
                      {comparison.kind === "multi-seed" && r[key] !== null && (
                        <small>
                          {fmt(Number(r[key + "_min"]) * mult, 2)}–
                          {fmt(Number(r[key + "_max"]) * mult, 2)} {unit}
                        </small>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">
          {comparison.note} Basket overflow is structurally prevented by model
          saturation; rejected capture is recorded separately.
        </p>
      </Panel>
      {comparison.failed_cases.length > 0 && (
        <Panel title="Failed cases">
          {comparison.failed_cases.map((c) => (
            <p className="notice danger" key={c.case_id}>
              {c.case_id}: {c.error}
            </p>
          ))}
        </Panel>
      )}
    </div>
  );
}
