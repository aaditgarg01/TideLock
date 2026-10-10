import { useEffect, useState } from "react";
import {
  Download,
  FileJson,
  FolderLock,
  History,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, downloadUrl, pilotDownload } from "../api";
import type { EvidenceData, EvidenceFile, Run } from "../types";
import { Panel, Badge, Loading, Empty, ErrorState, fmt } from "./Common";
export function Evidence({
  runs,
  onSelect,
  currentRun,
}: {
  runs: Run[];
  onSelect: (r: Run) => void;
  currentRun: Run | null;
}) {
  const [files, setFiles] = useState<EvidenceFile[]>([]),
    [selected, setSelected] = useState("manifest.json"),
    [data, setData] = useState<EvidenceData | null>(null),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    api
      .files()
      .then((r) => {
        if (live) setFiles(r.files);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api
      .file(selected, offset)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [selected, offset, version]);
  return (
    <div className="stack">
      <Panel
        title="Generated experiments"
        eyebrow="PERSISTENT RUN HISTORY"
        action={<History size={19} />}
      >
        {!runs.length ? (
          <Empty title="No new runs yet">
            The committed pilot below is available immediately. Run an
            experiment in the laboratory to create new evidence.
          </Empty>
        ) : (
          <div className="run-history">
            {runs.map((r) => (
              <button
                key={r.id}
                className={
                  currentRun?.id === r.id
                    ? "history-item selected"
                    : "history-item"
                }
                onClick={() => onSelect(r)}
              >
                <div>
                  <strong>{r.request.scenario.replaceAll("_", " ")}</strong>
                  <span>
                    {r.request.controllers.length} controller(s) ·{" "}
                    {r.request.seeds.length} seed(s) ·{" "}
                    {r.request.duration_s / 60} min
                  </span>
                </div>
                <div>
                  <Badge
                    tone={
                      r.status === "failed"
                        ? "danger"
                        : r.status === "complete"
                          ? "teal"
                          : "amber"
                    }
                  >
                    {r.status}
                  </Badge>
                  <small>{new Date(r.created_at).toLocaleString()}</small>
                  <code>{r.id.slice(0, 8)}</code>
                </div>
              </button>
            ))}
          </div>
        )}
        {currentRun &&
          currentRun.cases.some((c) => c.status === "complete") && (
            <div className="export-row">
              {[
                ["metrics", "csv"],
                ["traces", "csv"],
                ["events", "csv"],
                ["updates", "csv"],
                ["summary", "json"],
              ].map(([kind, format]) => (
                <a
                  className="button secondary small"
                  key={kind}
                  href={downloadUrl(currentRun.id, kind, format)}
                  download
                >
                  <Download size={14} />
                  {kind} {format.toUpperCase()}
                </a>
              ))}
            </div>
          )}
      </Panel>
      <div className="evidence-grid">
        <Panel
          title="Pilot archive"
          eyebrow="READ ONLY"
          action={<FolderLock size={19} />}
        >
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search evidence files"
              placeholder="Find metrics, traces, checks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="file-list">
            {files
              .filter((f) => f.path.includes(search))
              .map((f) => (
                <button
                  key={f.path}
                  className={selected === f.path ? "selected" : ""}
                  onClick={() => {
                    setSelected(f.path);
                    setOffset(0);
                  }}
                >
                  <FileJson size={15} />
                  <span>{f.path}</span>
                  <small>{fmt(f.bytes / 1024, 0)} KB</small>
                </button>
              ))}
          </div>
          <p className="footnote">
            Committed pilot files are served through a read-only allowlist.
            Per-step traces were archived only for seed 11.
          </p>
        </Panel>
        <Panel
          title={selected}
          eyebrow="EVIDENCE INSPECTOR"
          action={
            <a
              href={pilotDownload(selected)}
              className="icon-button"
              aria-label="Download evidence file"
              download
            >
              <Download size={17} />
            </a>
          }
        >
          {loading ? (
            <Loading />
          ) : error ? (
            <ErrorState
              message={error}
              retry={() => setVersion((v) => v + 1)}
            />
          ) : !data ? (
            <Empty title="Select evidence" />
          ) : data.kind === "image" ? (
            <img
              className="evidence-image"
              src={pilotDownload(selected)}
              alt={selected}
            />
          ) : data.kind === "table" ? (
            <>
              <div className="table-wrap evidence-table">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(data.rows?.[0] || {}).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows?.map((r, i) => (
                      <tr key={i}>
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k}>
                            {v === null
                              ? "Unavailable"
                              : typeof v === "number"
                                ? fmt(v, 5)
                                : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pagination">
                <span>
                  {offset + 1}–{Math.min(offset + 50, data.total || 0)} of{" "}
                  {data.total} rows
                </span>
                <button
                  className="icon-button"
                  aria-label="Previous evidence page"
                  disabled={offset === 0}
                  onClick={() => setOffset((v) => Math.max(0, v - 50))}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next evidence page"
                  disabled={offset + 50 >= (data.total || 0)}
                  onClick={() => setOffset((v) => v + 50)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <pre className="json-view">
              {data.kind === "json"
                ? JSON.stringify(data.data, null, 2)
                : data.text}
            </pre>
          )}
        </Panel>
      </div>
    </div>
  );
}
