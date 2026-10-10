import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, Radio, ArrowRight } from "lucide-react";
import type { CaseResult, Model } from "../types";
import { Panel, Badge, fmt, timeLabel } from "./Common";

export function Twin({
  data,
  model,
  compact = false,
}: {
  data: CaseResult;
  model: Model;
  compact?: boolean;
}) {
  const [index, setIndex] = useState(data.traces.length - 1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(20);
  useEffect(() => {
    setIndex(data.traces.length - 1);
    setPlaying(false);
  }, [data]);
  useEffect(() => {
    if (!playing) return;
    const handle = setInterval(
      () =>
        setIndex((i) => {
          if (i >= data.traces.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      (1000 * data.metrics.dt_s) / speed,
    );
    return () => clearInterval(handle);
  }, [playing, speed, data]);
  const row = data.traces[index];
  if (!row) return null;
  const p = model.parameters,
    cap = Number(p.basket_capacity),
    fill = Math.min(100, (row.basket_kg / cap) * 100),
    safe = Number(p.safety_level);
  const levelY = (h: number) =>
    282 - (Math.min(Number(p.rim_level), h) / Number(p.rim_level)) * 174;
  const update = [...data.updates]
    .reverse()
    .find((u) => u.time_s <= row.time_s);
  const faultEvents = data.events.filter(
    (e) => e.category === "injected" && e.time_s <= row.time_s,
  );
  const fault = faultEvents.at(-1)?.event === "fault_start";
  const unsafe = row.h_m > safe;
  return (
    <Panel
      title={compact ? "Virtual drainage reach" : "Drainage digital twin"}
      eyebrow="RECORDED STATE REPLAY"
      action={
        <Badge tone={unsafe ? "danger" : "teal"}>
          {unsafe ? "Safety limit exceeded" : "Simulation replay"}
        </Badge>
      }
    >
      <div className="twin-wrap">
        <svg
          viewBox="0 0 900 340"
          role="img"
          aria-label={`Conceptual drainage schematic at ${timeLabel(row.time_s)}. Upstream ${fmt(row.h_m)} metres, basket ${fmt(fill, 1)} percent.`}
        >
          <defs>
            <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#29cbbf" stopOpacity=".28" />
              <stop offset="100%" stopColor="#0c5477" stopOpacity=".16" />
            </linearGradient>
            <pattern
              id="grid"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 30 0 L 0 0 0 30"
                fill="none"
                stroke="#21364b"
                strokeWidth=".5"
              />
            </pattern>
            <pattern
              id="mesh"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 0 0 L 8 8 M 8 0 L 0 8"
                stroke="#82b7c1"
                strokeWidth=".6"
              />
            </pattern>
          </defs>
          <rect width="900" height="340" fill="url(#grid)" opacity=".45" />
          <text x="32" y="35" className="svg-label">
            01 / UPSTREAM STORAGE
          </text>
          <text x="638" y="35" className="svg-label">
            02 / TIDAL BOUNDARY
          </text>
          <path
            d="M42 98 L42 286 L854 286 L854 98"
            stroke="#415b73"
            strokeWidth="4"
            fill="none"
          />
          <rect
            x="44"
            y={levelY(row.h_m)}
            width="477"
            height={282 - levelY(row.h_m)}
            fill="url(#water)"
          />
          <rect
            x="555"
            y={levelY(row.tide_m)}
            width="297"
            height={282 - levelY(row.tide_m)}
            fill="url(#water)"
          />
          <path
            d={`M44 ${levelY(row.h_m)} H521 M555 ${levelY(row.tide_m)} H852`}
            stroke="#44dccb"
            strokeWidth="2"
          />
          <line
            x1="45"
            x2="480"
            y1={levelY(safe)}
            y2={levelY(safe)}
            stroke="#f49587"
            strokeDasharray="5 6"
            opacity=".65"
          />
          <text x="50" y={levelY(safe) - 9} fontSize="10" fill="#f49587">
            LIMIT {fmt(safe)} m
          </text>
          <path
            d="M0 215 H80"
            stroke="#44dccb"
            strokeWidth="3"
            strokeDasharray="8 7"
            className={playing ? "flow-line" : ""}
          />
          <path d="M75 209 L83 215 L75 221" fill="none" stroke="#44dccb" />
          <text x="50" y="314" className="svg-value">
            Qin {fmt(row.qin_m3s, 3)} m³/s
          </text>
          {Array.from(
            { length: Math.min(10, Math.ceil(row.suspended_kg)) },
            (_, i) => (
              <rect
                key={i}
                x={115 + ((i * 41 + row.time_s * row.qin_m3s * 0.2) % 330)}
                y={levelY(row.h_m) + 8 + (i % 3) * 5}
                width={i % 2 ? 9 : 6}
                height="5"
                rx="1"
                fill="#eabd6c"
                transform={`rotate(${i * 17} ${115 + ((i * 41 + row.time_s * row.qin_m3s * 0.2) % 330)} ${levelY(row.h_m) + 8 + (i % 3) * 5})`}
              />
            ),
          )}
          <rect
            x="482"
            y="92"
            width="32"
            height="131"
            fill="url(#mesh)"
            stroke="#7ba5b3"
          />
          <path d="M516 152 H605 V223 H516 Z" fill="#0b1928" stroke="#7ba5b3" />
          <rect
            x="520"
            y={219 - fill * 0.62}
            width="81"
            height={fill * 0.62}
            fill="#eabd6c"
            opacity=".65"
          />
          <text x="540" y="140" className="svg-label">
            BASKET
          </text>
          <text x="625" y="182" className="svg-value">
            {fmt(fill, 1)}%
          </text>
          <text x="625" y="199" className="svg-label">
            {fmt(row.basket_kg)} / {cap} kg
          </text>
          <rect
            x="479"
            y="238"
            width="40"
            height="45"
            fill="#07111f"
            stroke="#365167"
          />
          <line
            x1="486"
            y1="280"
            x2={486 + Math.sin((row.actuator * Math.PI) / 2) * 39}
            y2={280 - Math.cos((row.actuator * Math.PI) / 2) * 39}
            stroke="#44dccb"
            strokeWidth="6"
          />
          <circle cx="486" cy="280" r="5" fill="#d3fff8" />
          <text x="434" y="317" className="svg-label">
            BYPASS {Math.round(row.actuator * 100)}%
          </text>
          <rect
            x="491"
            y="56"
            width="20"
            height="20"
            rx="4"
            fill="#193749"
            stroke="#44dccb"
          />
          <path d="M501 77 V91" stroke="#44dccb" />
          <text x="527" y="69" className="svg-label">
            ACTUATOR
          </text>
          {[180, 748].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 64 V104`} stroke="#61778e" />
              <rect
                x={x - 14}
                y="50"
                width="28"
                height="19"
                rx="5"
                fill="#163045"
                stroke={fault && i === 0 ? "#eabd6c" : "#44dccb"}
              />
              <path
                d={`M${x - 9} 114 Q${x} 124 ${x + 9} 114 M${x - 15} 121 Q${x} 137 ${x + 15} 121`}
                fill="none"
                stroke={fault && i === 0 ? "#eabd6c" : "#44dccb"}
                opacity=".6"
              />
            </g>
          ))}
          <text x="245" y="88" className="svg-big">
            {fmt(row.h_m, 3)}
            <tspan fontSize="12"> m</tspan>
          </text>
          <text x="638" y="88" className="svg-big">
            {fmt(row.tide_m, 3)}
            <tspan fontSize="12"> m</tspan>
          </text>
          <text x="665" y="314" className="svg-label">
            {model.parameters.nonreturn_flap === false
              ? "SIGNED BACKFLOW POSSIBLE"
              : "SEPARATE NONRETURN FLAP"}
          </text>
        </svg>
      </div>
      <div className="replay-controls">
        <button
          className="icon-button"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            if (index === data.traces.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="icon-button"
          aria-label="Reset replay"
          onClick={() => {
            setIndex(0);
            setPlaying(false);
          }}
        >
          <RotateCcw size={16} />
        </button>
        <span className="mono time">{timeLabel(row.time_s)}</span>
        <input
          aria-label="Replay time"
          type="range"
          min="0"
          max={data.traces.length - 1}
          value={index}
          onChange={(e) => {
            setIndex(Number(e.target.value));
            setPlaying(false);
          }}
        />
        <span className="mono muted">
          {timeLabel(data.traces.at(-1)!.time_s)}
        </span>
        <select
          aria-label="Replay speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value="10">10×</option>
          <option value="20">20×</option>
          <option value="60">60×</option>
        </select>
      </div>
      <div className="twin-status">
        <span>
          <Radio size={13} />
          {fault
            ? "Injected fault active"
            : update?.reliable
              ? "Level signals reliable"
              : "Level signals unreliable"}
        </span>
        <span>
          Actual gate {Math.round(row.actuator * 100)}% <ArrowRight size={12} />{" "}
          target {Math.round(row.target * 100)}%
        </span>
        <Badge tone={row.mode.includes("ALERT") ? "amber" : "muted"}>
          {row.mode.includes("ALERT") ? "Fallback requested" : row.mode}
        </Badge>
      </div>
      <p className="footnote">
        Conceptual schematic driven by recorded simulation states. True virtual
        levels are shown; geometry and particle positions are illustrative, not
        hydraulically validated. Runoff is shown in m³/s; measured rainfall is
        unavailable.
      </p>
      {!compact && (
        <div className="event-jumps">
          {data.events
            .filter(
              (e) =>
                e.category === "injected" ||
                e.category === "maintenance" ||
                e.event === "safety_limit_exceeded",
            )
            .map((e, i) => (
              <button
                key={i}
                className="button secondary small"
                onClick={() => {
                  setIndex(
                    Math.max(
                      0,
                      data.traces.findIndex((r) => r.time_s >= e.time_s),
                    ),
                  );
                  setPlaying(false);
                }}
              >
                {timeLabel(e.time_s)} · {e.event.replaceAll("_", " ")}
              </button>
            ))}
        </div>
      )}
    </Panel>
  );
}
