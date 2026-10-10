import { useEffect, useState } from "react";
import {
  Waves,
  LayoutDashboard,
  FlaskConical,
  GitCompareArrows,
  Workflow,
  ListFilter,
  FolderArchive,
  ShieldCheck,
  ArrowUpRight,
  Download,
  Menu,
  X,
  Activity,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { api, downloadUrl, pilotDownload } from "./api";
import type {
  CaseResult,
  Comparison,
  Controller,
  Model,
  Run,
  RunConfig,
  Scenario,
  Tab,
} from "./types";
import {
  Panel,
  Badge,
  Loading,
  Empty,
  ErrorState,
  Metric,
  SafetyWarning,
  fmt,
  labels,
} from "./components/Common";
import { WaterChart, PlasticChart, FlowChart } from "./components/Charts";
import { Twin } from "./components/Twin";
import { Events } from "./components/Events";
import { Laboratory } from "./components/Laboratory";
import { ComparisonView } from "./components/ComparisonView";
import { Evidence } from "./components/Evidence";
import { ModelHealth } from "./components/ModelHealth";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "laboratory", label: "Simulation lab", icon: FlaskConical },
  { id: "comparison", label: "Controller comparison", icon: GitCompareArrows },
  { id: "twin", label: "Drainage twin", icon: Workflow },
  { id: "events", label: "Event & fault log", icon: ListFilter },
  { id: "evidence", label: "Experiment evidence", icon: FolderArchive },
  { id: "health", label: "Model health", icon: ShieldCheck },
] as const;
const titles: Record<Tab, [string, string]> = {
  overview: [
    "Every decision has a downstream effect.",
    "Explore the balance between plastic capture and hydraulic safety.",
  ],
  laboratory: [
    "Put the system to the test.",
    "Run the real simulator with shared, reproducible conditions.",
  ],
  comparison: [
    "Compare the decisions. Keep the trade-offs.",
    "Paired controller outcomes. No hidden failures. No universal winner.",
  ],
  twin: [
    "See the virtual plant respond.",
    "Replay recorded states, control actions and faults in a conceptual drainage reach.",
  ],
  events: [
    "A record of what actually happened.",
    "Follow injections, detections, commands and virtual plant conditions.",
  ],
  evidence: [
    "An experiment you can inspect.",
    "Trace each finding to its configuration, source version and data.",
  ],
  health: [
    "Understand the model’s limits.",
    "Inspect assumptions, signal reliability and the meaning of every safety check.",
  ],
};

export default function App() {
  const [tab, setTab] = useState<Tab>("overview"),
    [mobile, setMobile] = useState(false),
    [ready, setReady] = useState(false),
    [setupError, setSetupError] = useState(""),
    [version, setVersion] = useState(0);
  const [model, setModel] = useState<Model | null>(null),
    [scenarios, setScenarios] = useState<Scenario[]>([]),
    [durations, setDurations] = useState<number[]>([]),
    [controllerInfo, setControllerInfo] = useState<
      { id: Controller; label: string; description: string }[]
    >([]),
    [runs, setRuns] = useState<Run[]>([]);
  const [source, setSource] = useState<"pilot" | "run">("pilot"),
    [pilotScenario, setPilotScenario] = useState("compound"),
    [pilotMulti, setPilotMulti] = useState(false),
    [controller, setController] = useState<Controller>("predictive"),
    [seed, setSeed] = useState(11),
    [run, setRun] = useState<Run | null>(null);
  const [data, setData] = useState<CaseResult | null>(null),
    [comparison, setComparison] = useState<Comparison | null>(null),
    [loading, setLoading] = useState(false),
    [resultError, setResultError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [submitError, setSubmitError] = useState(""),
    [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let live = true;
    setSetupError("");
    Promise.all([
      api.health(),
      api.model(),
      api.scenarios(),
      api.controllers(),
      api.runs(),
    ])
      .then(([, m, s, c, r]) => {
        if (!live) return;
        setModel(m);
        setScenarios(s.scenarios);
        setDurations(s.durations_s);
        setControllerInfo(c);
        setRuns(r);
        setReady(true);
      })
      .catch((e) => {
        if (live) setSetupError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    let live = true;
    const handle = setInterval(
      () =>
        api
          .run(run.id)
          .then((r) => {
            if (live) {
              setRun(r);
              setSubmitError("");
              if (!["queued", "running"].includes(r.status))
                api
                  .runs()
                  .then(setRuns)
                  .catch(() => {});
            }
          })
          .catch((e) => {
            if (live)
              setSubmitError(
                `Status unavailable: ${e.message}. The run may still be processing.`,
              );
          }),
      600,
    );
    return () => {
      live = false;
      clearInterval(handle);
    };
  }, [run?.id, run?.status]);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setLoading(true);
    setResultError("");
    setData(null);
    setComparison(null);
    const load = async () => {
      if (source === "pilot") {
        const [d, c, m] = await Promise.all([
          api.pilot(pilotScenario, controller),
          api.pilotComparison(pilotScenario, pilotMulti),
          api.file("manifest.json"),
        ]);
        if (live) {
          setData(d);
          setComparison(c);
          setManifest(m.data as Record<string, unknown>);
        }
      } else if (run) {
        const selected = run.cases.find(
          (c) => c.case_id === `${controller}-${seed}`,
        );
        const [c, m] = await Promise.all([
          api.compare(run.id),
          api.manifest(run.id),
        ]);
        if (live) {
          setComparison(c);
          setManifest(m);
        }
        if (selected?.status === "complete") {
          const d = await api.case(run.id, selected.case_id);
          if (live) setData(d);
        } else if (selected?.status === "failed" && live)
          setResultError(
            selected.error ||
              "This simulation case failed. Other completed cases remain available.",
          );
      }
    };
    load()
      .catch((e) => {
        if (live) setResultError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [
    ready,
    source,
    pilotScenario,
    pilotMulti,
    controller,
    seed,
    run?.id,
    run?.status,
    run?.completed_cases,
    version,
  ]);
  const busy =
    submitting || (!!run && ["queued", "running"].includes(run.status));
  const submit = async (config: RunConfig) => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const r = await api.submit(config, crypto.randomUUID());
      setRun(r);
      setSource("run");
      setController(config.controllers[0]);
      setSeed(config.seeds[0]);
      setPilotMulti(false);
      setRuns((old) => [r, ...old.filter((x) => x.id !== r.id)]);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };
  const selectRun = (r: Run) => {
    setRun(r);
    setSource("run");
    const first = r.cases.find((c) => c.status === "complete");
    setController(first?.controller || r.request.controllers[0]);
    setSeed(first?.seed ?? r.request.seeds[0]);
    setTab("overview");
  };
  const activeModel =
    model && data
      ? { ...model, parameters: { ...model.parameters, ...data.parameters } }
      : model;
  const m = data?.metrics,
    last = data?.traces.at(-1),
    selectedScenario =
      source === "pilot" ? pilotScenario : run?.request.scenario;
  const goto = (id: Tab) => {
    setTab(id);
    setMobile(false);
  };
  const caseContent = (children: React.ReactNode) =>
    loading ? (
      <Loading label="Loading recorded simulation states…" />
    ) : resultError ? (
      <ErrorState
        message={resultError}
        retry={() => setVersion((v) => v + 1)}
      />
    ) : data ? (
      children
    ) : (
      <Empty
        title={busy ? "Experiment in progress" : "No completed case selected"}
      >
        {busy
          ? "The worker is computing real states. Results will appear here when a case finishes."
          : "Choose a completed case or run a new experiment in the laboratory."}
      </Empty>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#" onClick={() => goto("overview")}>
          <div className="brand-mark">
            <Waves size={26} />
          </div>
          <div>
            TideLock<span>COASTAL SYSTEMS LAB</span>
          </div>
        </a>
        <div className="workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={tab === id ? "active" : ""}
              onClick={() => goto(id)}
              key={id}
            >
              <Icon size={18} />
              <span>{label}</span>
              {tab === id && <ChevronRight size={14} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-card">
            <div className="split">
              <span className="status-dot" />
              <Badge tone="teal">VIRTUAL PLANT</Badge>
            </div>
            <h3>
              Built to question.
              <br />
              Not to assume.
            </h3>
            <p>Reproducible experiments for safer plastic interception.</p>
            <div className="mini-wave">
              <Waves size={52} />
            </div>
          </div>
          <div className="sidebar-footer">
            <span>TIDELOCK / v0.2</span>
            <span>INNOVATEX</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={12} />
            <span>{navigation.find((n) => n.id === tab)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i className={ready ? "status-dot" : "status-dot off"} />
              {ready ? "LOCAL SIMULATION" : "CONNECTING"}
            </span>
            <a
              className="icon-button"
              href="/docs"
              target="_blank"
              rel="noreferrer"
              aria-label="Open API documentation"
            >
              <ArrowUpRight size={17} />
            </a>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                TIDELOCK /{" "}
                {navigation.find((n) => n.id === tab)?.label.toUpperCase()}
              </p>
              <h1>{titles[tab][0]}</h1>
              <p>{titles[tab][1]}</p>
            </div>
            {tab !== "laboratory" && (
              <button
                className="button primary"
                onClick={() => goto("laboratory")}
              >
                <FlaskConical size={16} />
                New experiment
              </button>
            )}
          </div>
          <div className="simulation-notice">
            <Activity size={14} />
            <span>
              <strong>Simulation environment.</strong> Synthetic data only. No
              live drainage infrastructure is connected.
            </span>
            <Badge>RESEARCH PROTOTYPE</Badge>
          </div>
          {setupError ? (
            <ErrorState
              message={setupError}
              retry={() => setVersion((v) => v + 1)}
            />
          ) : !ready ? (
            <Loading label="Connecting to the local simulation API…" />
          ) : (
            <>
              {tab !== "laboratory" && tab !== "evidence" && (
                <div className="context-bar">
                  <div className="context-source">
                    <span className="eyebrow">EVIDENCE SOURCE</span>
                    <strong>
                      {source === "pilot"
                        ? "Committed pilot archive"
                        : `Run ${run?.id.slice(0, 8)}`}
                    </strong>
                    <Badge
                      tone={
                        source === "pilot"
                          ? "muted"
                          : run?.status === "failed"
                            ? "danger"
                            : "teal"
                      }
                    >
                      {source === "pilot" ? "READ ONLY" : run?.status}
                    </Badge>
                  </div>
                  <div className="context-controls">
                    {source === "pilot" ? (
                      <select
                        aria-label="Archived scenario"
                        value={pilotScenario}
                        onChange={(e) => setPilotScenario(e.target.value)}
                      >
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="scenario-label">
                        {selectedScenario?.replaceAll("_", " ")}
                      </span>
                    )}
                    <select
                      aria-label="Displayed controller"
                      value={controller}
                      onChange={(e) =>
                        setController(e.target.value as Controller)
                      }
                    >
                      {(source === "pilot"
                        ? ["fixed", "threshold", "predictive"]
                        : run?.request.controllers || []
                      ).map((c) => (
                        <option key={c} value={c}>
                          {labels[c as Controller]}
                        </option>
                      ))}
                    </select>
                    {source === "run" ? (
                      <select
                        aria-label="Displayed seed"
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                      >
                        {run?.request.seeds.map((s) => (
                          <option key={s} value={s}>
                            Seed {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge>SEED 11 TRACE</Badge>
                    )}
                    {source === "run" && (
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setSource("pilot");
                          setController("predictive");
                          setSeed(11);
                        }}
                      >
                        Pilot archive
                      </button>
                    )}
                  </div>
                </div>
              )}
              {run?.warnings.length && source === "run"
                ? run.warnings.map((w) => (
                    <p className="notice" key={w}>
                      {w}
                    </p>
                  ))
                : null}
              {tab === "laboratory" && (
                <Laboratory
                  scenarios={scenarios}
                  durations={durations}
                  controllerInfo={controllerInfo}
                  onRun={submit}
                  busy={busy}
                  run={run}
                  error={submitError}
                />
              )}
              {tab === "overview" &&
                caseContent(
                  m && data && activeModel && (
                    <div className="stack">
                      <div className="metrics-grid">
                        <Metric
                          label="Plastic captured"
                          value={fmt(m.captured_kg)}
                          unit="kg"
                          detail={`${fmt(m.capture_fraction * 100, 1)}% of incoming plastic`}
                          tone="teal"
                        />
                        <Metric
                          label="Plastic escaped"
                          value={fmt(m.escaped_kg)}
                          unit="kg"
                          detail={`${fmt(m.suspended_final_kg)} kg remains suspended`}
                        />
                        <Metric
                          label="Peak upstream level"
                          value={fmt(m.max_level_m, 3)}
                          unit="m"
                          detail={`Safety limit ${fmt(Number(activeModel.parameters.safety_level))} m`}
                          tone={m.safety_violation_episodes ? "danger" : ""}
                        />
                        <Metric
                          label="Above safety limit"
                          value={fmt(m.safety_violation_duration_s, 0)}
                          unit="s"
                          detail={`${m.safety_violation_episodes} violation episode(s)`}
                          tone={m.safety_violation_episodes ? "danger" : ""}
                        />
                      </div>
                      {m.safety_violation_episodes > 0 && (
                        <div className="notice danger" role="status">
                          <strong>Safety limit exceeded.</strong> This run
                          recorded {m.safety_violation_episodes} violation
                          episode(s). A controller or fallback command did not
                          guarantee hydraulic safety.
                        </div>
                      )}
                      <div className="two-col">
                        <Panel
                          title="Water-level response"
                          eyebrow="TRUE VIRTUAL LEVELS"
                          action={<Badge>{data.traces.length} samples</Badge>}
                        >
                          <WaterChart data={data} model={activeModel} />
                        </Panel>
                        <Panel
                          title="Where the plastic goes"
                          eyebrow="CONSERVATIVE MASS LEDGER"
                        >
                          <PlasticChart data={data} />
                        </Panel>
                      </div>
                      <div className="overview-lower">
                        <Twin data={data} model={activeModel} compact />
                        <Panel
                          title="Operating state"
                          eyebrow="END OF SELECTED RUN"
                        >
                          <div className="basket-gauge">
                            <div
                              className="gauge-ring"
                              style={
                                {
                                  "--fill": `${(m.basket_final_kg / Number(activeModel.parameters.basket_capacity)) * 100}%`,
                                } as React.CSSProperties
                              }
                            >
                              <span>
                                {fmt(
                                  (m.basket_final_kg /
                                    Number(
                                      activeModel.parameters.basket_capacity,
                                    )) *
                                    100,
                                  0,
                                )}
                                <small>% full</small>
                              </span>
                            </div>
                            <div>
                              <h3>
                                {fmt(m.basket_final_kg)} /{" "}
                                {String(activeModel.parameters.basket_capacity)}{" "}
                                kg
                              </h3>
                              <p>Collection basket</p>
                            </div>
                          </div>
                          <dl className="health-list">
                            <div>
                              <dt>Actual bypass opening</dt>
                              <dd>{fmt((last?.actuator || 0) * 100, 0)}%</dd>
                            </div>
                            <div>
                              <dt>Actuator command changes</dt>
                              <dd>{m.actuator_command_changes}</dd>
                            </div>
                            <div>
                              <dt>Fallback updates</dt>
                              <dd>{m.fallback_updates}</dd>
                            </div>
                            <div>
                              <dt>Rejected-capture episodes</dt>
                              <dd>{m.basket_rejected_capture_episodes}</dd>
                            </div>
                            <div>
                              <dt>Median control update</dt>
                              <dd>{fmt(m.compute_median_ms, 3)} ms</dd>
                            </div>
                          </dl>
                          <button
                            className="button secondary full"
                            onClick={() => goto("comparison")}
                          >
                            Compare controllers
                            <ArrowUpRight size={16} />
                          </button>
                        </Panel>
                      </div>
                      <Panel
                        title="Runoff and plastic arrival"
                        eyebrow="DERIVED FROM RETURNED TIME SERIES"
                      >
                        <FlowChart data={data} />
                      </Panel>
                      <Events events={data.events} preview />
                      <Panel
                        title="Reproducibility"
                        action={
                          <a
                            className="button secondary small"
                            href={
                              source === "run"
                                ? downloadUrl(run!.id, "summary", "json")
                                : pilotDownload("manifest.json")
                            }
                            download
                          >
                            <Download size={15} />
                            Export {source === "run" ? "summary" : "manifest"}
                          </a>
                        }
                      >
                        <div className="provenance">
                          <span>
                            Scenario <strong>{m.scenario}</strong>
                          </span>
                          <span>
                            Seed <strong>{m.seed}</strong>
                          </span>
                          <span>
                            Integration <strong>{m.dt_s} s</strong>
                          </span>
                          <span>
                            Duration{" "}
                            <strong>{data.traces.at(-1)?.time_s} s</strong>
                          </span>
                        </div>
                        <p className="mono hash">
                          DISTURBANCE SHA-256 / {m.disturbance_sha256}
                        </p>
                        <details>
                          <summary>Inspect full provenance</summary>
                          <pre className="json-view">
                            {JSON.stringify(manifest, null, 2)}
                          </pre>
                        </details>
                      </Panel>
                    </div>
                  ),
                )}
              {tab === "comparison" && (
                <div className="stack">
                  {source === "pilot" && (
                    <div className="segmented" aria-label="Comparison scope">
                      <button
                        className={!pilotMulti ? "active" : ""}
                        onClick={() => setPilotMulti(false)}
                      >
                        Single seed · 11
                      </button>
                      <button
                        className={pilotMulti ? "active" : ""}
                        onClick={() => setPilotMulti(true)}
                      >
                        All 5 pilot seeds
                      </button>
                    </div>
                  )}
                  {loading ? (
                    <Loading />
                  ) : resultError ? (
                    <ErrorState message={resultError} />
                  ) : comparison ? (
                    <ComparisonView comparison={comparison} />
                  ) : (
                    <Empty title="No comparison available">
                      Select multiple controllers in the simulation laboratory.
                    </Empty>
                  )}
                </div>
              )}
              {tab === "twin" &&
                caseContent(
                  data && activeModel && (
                    <Twin data={data} model={activeModel} />
                  ),
                )}
              {tab === "events" &&
                caseContent(data && <Events events={data.events} />)}
              {tab === "evidence" && (
                <Evidence runs={runs} onSelect={selectRun} currentRun={run} />
              )}
              {tab === "health" && model && (
                <ModelHealth model={model} data={data} />
              )}
            </>
          )}
          <SafetyWarning />
          <footer className="page-footer">
            <span>TIDELOCK · SAFETY-CONSTRAINED INTERCEPTION RESEARCH</span>
            <span>Conceptual model / Mumbai deployment context</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
