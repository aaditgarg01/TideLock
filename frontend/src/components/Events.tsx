import { useState } from "react";
import { Search } from "lucide-react";
import type { Event } from "../types";
import { Panel, Badge, Empty, timeLabel, fmt } from "./Common";
export function Events({
  events,
  preview = false,
}: {
  events: Event[];
  preview?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [severity, setSeverity] = useState("all"),
    [category, setCategory] = useState("all");
  const filtered = events.filter(
    (e) =>
      (severity === "all" || e.severity === severity) &&
      (category === "all" || e.category === category) &&
      `${e.event} ${e.detail} ${e.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const rows = preview ? filtered.slice(-5) : filtered;
  return (
    <Panel
      title={preview ? "Recent events" : "Event & fault log"}
      eyebrow="SIMULATED TIMELINE"
      action={<Badge>{filtered.length} events</Badge>}
    >
      {!preview && (
        <div className="filters">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search events"
              placeholder="Search faults, commands, conditions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Event severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            <option value="all">All severities</option>
            {["info", "warning", "critical"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Event category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All categories</option>
            {[
              "injected",
              "detected",
              "command",
              "condition",
              "maintenance",
              "controller",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
      {!rows.length ? (
        <Empty title="No matching events">
          Try a different filter. No event is invented when the model did not
          produce one.
        </Empty>
      ) : (
        <div className="event-list">
          {rows.map((e, i) => (
            <div
              className={`event-row ${e.severity}`}
              key={`${e.time_s}-${e.event}-${i}`}
            >
              <span className="event-dot" />
              <time className="mono">{timeLabel(e.time_s)}</time>
              <div className="event-copy">
                <div>
                  <strong>{e.event.replaceAll("_", " ")}</strong>
                  <Badge
                    tone={
                      e.category === "injected"
                        ? "purple"
                        : e.severity === "critical"
                          ? "danger"
                          : "muted"
                    }
                  >
                    {e.category}
                  </Badge>
                </div>
                <p>{e.detail}</p>
                {!preview && Object.keys(e.measurements).length > 0 && (
                  <p className="mono">
                    {Object.entries(e.measurements)
                      .map(
                        ([k, v]) =>
                          `${k}: ${typeof v === "number" ? fmt(v, 3) : String(v)}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </div>
              <Badge
                tone={
                  e.severity === "critical"
                    ? "danger"
                    : e.severity === "warning"
                      ? "amber"
                      : "muted"
                }
              >
                {e.severity}
              </Badge>
            </div>
          ))}
        </div>
      )}
      {!preview && (
        <p className="footnote">
          “Injected” records the experiment setup. “Detected” records
          sensor-quality checks. “Condition” is measured from the virtual plant,
          whether or not the controller noticed it. Basket saturation rejects
          capture; physical overflow is not modeled.
        </p>
      )}
    </Panel>
  );
}
