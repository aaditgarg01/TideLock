import type { CaseResult, Model } from "../types";
import { Panel, Badge, fmt } from "./Common";
export function ModelHealth({
  model,
  data,
}: {
  model: Model;
  data: CaseResult | null;
}) {
  const m = data?.metrics;
  const unreliable = data?.updates.filter((u) => !u.reliable).length;
  return (
    <div className="stack">
      <div className="two-col">
        <Panel title="Run integrity" eyebrow="MEASURED FROM THE VIRTUAL PLANT">
          <dl className="health-list">
            <div>
              <dt>Water balance residual</dt>
              <dd>
                {m ? m.water_residual_relative.toExponential(2) : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Plastic balance residual</dt>
              <dd>
                {m
                  ? m.plastic_residual_relative.toExponential(2)
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Unreliable signal updates</dt>
              <dd>{unreliable ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Fallback requests</dt>
              <dd>{m?.fallback_updates ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Safety-limit violations</dt>
              <dd>
                <Badge tone={m?.safety_violation_episodes ? "danger" : "muted"}>
                  {m
                    ? `${m.safety_violation_episodes} episodes / ${m.safety_violation_duration_s} s`
                    : "Unavailable"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>Post-fault mode recovery</dt>
              <dd>
                {m?.recovery_after_fault_s == null
                  ? "Not applicable or not recovered"
                  : `${fmt(m.recovery_after_fault_s, 0)} s`}
              </dd>
            </div>
          </dl>
          <p className="footnote">
            Small balance residuals verify numerical bookkeeping, not hydraulic
            validity. Returning to normal controller mode does not prove
            hydraulic recovery.
          </p>
        </Panel>
        <Panel title="Model settings" eyebrow="SELECTED SCENARIO">
          <dl className="health-list">
            {Object.entries(data?.parameters || model.parameters).map(
              ([k, v]) => (
                <div key={k}>
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>
                    {typeof v === "boolean"
                      ? v
                        ? "Enabled"
                        : "Disabled"
                      : fmt(v, 4)}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </Panel>
      </div>
      <Panel title="Assumptions and limits">
        <div className="two-col">
          <div>
            <h3>What this model assumes</h3>
            <ul className="plain-list">
              {model.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Unavailable measurements</h3>
            <ul className="plain-list muted">
              {model.unavailable.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </Panel>
      <Panel title="How the metrics are calculated">
        <dl className="definitions">
          {Object.entries(model.metrics).map(([k, v]) => (
            <div key={k}>
              <dt>{k.replaceAll("_", " ")}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
