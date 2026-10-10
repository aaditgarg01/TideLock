import { useState } from "react";
import { FlaskConical, Play, ShieldCheck, LoaderCircle } from "lucide-react";
import type { RunConfig, Run, Scenario, Controller } from "../types";
import { Panel, Badge, ErrorState, labels } from "./Common";
export const initialConfig: RunConfig = {
  scenario: "compound",
  controllers: ["predictive"],
  seeds: [11],
  duration_s: 1800,
  dt_s: 5,
  threshold_open_m: 1.3,
  threshold_close_m: 1.1,
  predictive_cap_m: 1.6,
};
export function parseSeeds(text: string): number[] {
  const tokens = text.split(",").map((s) => s.trim());
  if (
    !tokens.length ||
    tokens.length > 10 ||
    tokens.some((s) => !/^\d+$/.test(s))
  )
    throw new Error("Enter 1–10 whole-number seeds, separated by commas.");
  const seeds = tokens.map(Number);
  if (seeds.some((s) => s > 4294967295) || new Set(seeds).size !== seeds.length)
    throw new Error("Seeds must be unique integers from 0 to 4294967295.");
  return seeds;
}
export function Laboratory({
  scenarios,
  durations,
  onRun,
  busy,
  run,
  error,
  controllerInfo,
}: {
  scenarios: Scenario[];
  durations: number[];
  onRun: (c: RunConfig) => Promise<void>;
  busy: boolean;
  run: Run | null;
  error: string;
  controllerInfo: { id: Controller; description: string }[];
}) {
  const [config, setConfig] = useState<RunConfig>(initialConfig),
    [seedText, setSeedText] = useState("11"),
    [validation, setValidation] = useState("");
  const set = <K extends keyof RunConfig>(key: K, value: RunConfig[K]) =>
    setConfig((c) => ({ ...c, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidation("");
    try {
      const seeds = parseSeeds(seedText);
      if (!config.controllers.length)
        throw new Error("Select at least one controller.");
      if (config.threshold_close_m >= config.threshold_open_m)
        throw new Error("Closing threshold must be below opening threshold.");
      await onRun({ ...config, seeds });
    } catch (e) {
      setValidation((e as Error).message);
    }
  };
  const selected = scenarios.find((s) => s.id === config.scenario);
  return (
    <div className="lab-grid">
      <Panel
        title="Configure an experiment"
        eyebrow="SIMULATION LABORATORY"
        action={<FlaskConical size={20} className="text-teal" />}
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              Scenario
              <select
                value={config.scenario}
                onChange={(e) => set("scenario", e.target.value)}
                aria-label="Scenario"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <small>{selected?.description}</small>
            </label>
            <label className="field">
              Random seed(s)
              <input
                aria-label="Random seeds"
                value={seedText}
                onChange={(e) => setSeedText(e.target.value)}
                placeholder="11, 23, 37"
              />
              <small>
                Comma-separated; up to 10. Shared across controllers.
              </small>
            </label>
            <label className="field">
              Duration
              <select
                aria-label="Duration"
                value={config.duration_s}
                onChange={(e) => set("duration_s", Number(e.target.value))}
              >
                {durations.map((n) => (
                  <option key={n} value={n}>
                    {n / 60} minutes ({n} s)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Integration interval
              <select
                aria-label="Integration interval"
                value={config.dt_s}
                onChange={(e) => set("dt_s", Number(e.target.value))}
              >
                <option value="5">5 seconds · pilot default</option>
                <option value="2.5">2.5 seconds · finer resolution</option>
              </select>
            </label>
          </div>
          <fieldset className="controller-picks">
            <legend>Controllers</legend>
            <p>
              Select multiple for a paired comparison under identical
              conditions.
            </p>
            {controllerInfo.map((c) => (
              <label
                key={c.id}
                className={config.controllers.includes(c.id) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={config.controllers.includes(c.id)}
                  onChange={(e) =>
                    set(
                      "controllers",
                      e.target.checked
                        ? [...config.controllers, c.id]
                        : config.controllers.filter((id) => id !== c.id),
                    )
                  }
                />
                <div>
                  <strong>{labels[c.id]}</strong>
                  <small>{c.description}</small>
                </div>
                <span
                  className="controller-swatch"
                  style={{
                    background:
                      c.id === "predictive"
                        ? "#44dccb"
                        : c.id === "threshold"
                          ? "#eabd6c"
                          : "#f49587",
                  }}
                />
              </label>
            ))}
          </fieldset>
          <details className="advanced">
            <summary>Controller settings</summary>
            <div className="form-grid three">
              <label className="field">
                Open threshold (m)
                <input
                  type="number"
                  min="1.1"
                  max="1.5"
                  step=".05"
                  value={config.threshold_open_m}
                  onChange={(e) =>
                    set("threshold_open_m", Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                Close threshold (m)
                <input
                  type="number"
                  min=".8"
                  max="1.4"
                  step=".05"
                  value={config.threshold_close_m}
                  onChange={(e) =>
                    set("threshold_close_m", Number(e.target.value))
                  }
                />
              </label>
              <label className="field">
                Predictive cap (m)
                <input
                  type="number"
                  min="1.4"
                  max="1.6"
                  step=".05"
                  value={config.predictive_cap_m}
                  onChange={(e) =>
                    set("predictive_cap_m", Number(e.target.value))
                  }
                />
              </label>
            </div>
            <p className="footnote">
              These change decisions, not the 1.60 m safety evaluation limit.
              Geometry and forecast shapes remain those of the chosen scenario.
            </p>
          </details>
          {(validation || error) && (
            <ErrorState message={validation || error} />
          )}
          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Play size={18} />
            )}{" "}
            {busy ? "Simulation running…" : "Run simulation"}
          </button>
          <p className="footnote">
            Executes the Python simulator. Duplicate submissions are guarded; no
            live hardware is connected.
          </p>
        </form>
      </Panel>
      <div className="stack">
        <Panel title="Execution status" eyebrow="LOCAL WORKER">
          <div className="worker-graphic">
            <div className={busy ? "worker-ring active" : "worker-ring"}>
              <ShieldCheck size={30} />
            </div>
            <div>
              <h3>
                {busy
                  ? "Computing virtual states"
                  : run
                    ? run.status === "complete"
                      ? "Experiment complete"
                      : run.status
                    : "Ready to simulate"}
              </h3>
              <p>1 worker · bounded queue · persistent results</p>
            </div>
          </div>
          {run ? (
            <>
              <div className="progress-track">
                <div
                  style={{
                    width: `${(run.completed_cases / run.total_cases) * 100}%`,
                  }}
                />
              </div>
              <div className="split small muted">
                <span>
                  {run.completed_cases} / {run.total_cases} cases processed
                </span>
                <Badge
                  tone={
                    run.status === "failed"
                      ? "danger"
                      : run.status === "complete"
                        ? "teal"
                        : "amber"
                  }
                >
                  {run.status}
                </Badge>
              </div>
              <p className="mono id-text">RUN / {run.id}</p>
              {run.warnings.map((w) => (
                <p className="notice" key={w}>
                  {w}
                </p>
              ))}
              {run.error && <ErrorState message={run.error} />}
            </>
          ) : (
            <p className="footnote">
              Configure a single-controller run or compare all three. Multi-seed
              runs report means and ranges without inventing confidence
              intervals.
            </p>
          )}
        </Panel>
        <Panel title="Designed for a fair comparison">
          <ol className="explain-list">
            <li>
              <span>01</span>
              <div>
                <strong>One disturbance realization</strong>
                <p>
                  Each seed generates the same inflow, tide, debris and noise
                  for every selected controller.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Physical metrics remain separate</strong>
                <p>
                  Capture, escape, suspended mass and safety violations are
                  never hidden in a composite score.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Every outcome is retained</strong>
                <p>
                  Failed cases stay visible. New evidence is saved separately
                  from the committed pilot.
                </p>
              </div>
            </li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}
