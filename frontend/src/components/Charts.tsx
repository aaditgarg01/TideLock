import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Scatter,
  ScatterChart,
  ZAxis,
} from "recharts";
import type { CaseResult, Comparison, Model } from "../types";
import { colors, fmt, labels } from "./Common";
const axis = { fill: "#8194ac", fontSize: 11 };
const tip = {
  background: "#0e2033",
  border: "1px solid #294258",
  borderRadius: 10,
  color: "#e8f2fc",
  fontSize: 12,
};
export function WaterChart({
  data,
  model,
}: {
  data: CaseResult;
  model: Model;
}) {
  return (
    <div className="chart" data-testid="water-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data.traces}
          margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#223448" vertical={false} />
          <XAxis
            dataKey="time_s"
            tick={axis}
            tickFormatter={(v) => `${Number(v) / 60}m`}
            minTickGap={35}
          />
          <YAxis tick={axis} unit=" m" width={55} domain={[0, "auto"]} />
          <Tooltip
            contentStyle={tip}
            labelFormatter={(v) => `Simulated ${Number(v) / 60} min`}
            formatter={(v, name) => [`${fmt(Number(v), 3)} m`, name]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
          />
          <ReferenceLine
            y={Number(model.parameters.safety_level)}
            stroke="#f49587"
            strokeDasharray="5 5"
            label={{
              value: "SAFETY",
              fill: "#f49587",
              fontSize: 9,
              position: "insideTopRight",
            }}
          />
          <ReferenceLine
            y={Number(model.parameters.warning_level)}
            stroke="#eabd6c"
            strokeDasharray="3 6"
          />
          <Line
            type="linear"
            dataKey="h_m"
            name="Upstream level"
            stroke="#44dccb"
            dot={false}
            strokeWidth={2.5}
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="tide_m"
            name="Downstream tide"
            stroke="#728aff"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function PlasticChart({ data }: { data: CaseResult }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data.traces}
          margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
        >
          <defs>
            <linearGradient id="plasticFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#44dccb" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#44dccb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#223448" vertical={false} />
          <XAxis
            dataKey="time_s"
            tick={axis}
            tickFormatter={(v) => `${Number(v) / 60}m`}
            minTickGap={35}
          />
          <YAxis tick={axis} unit=" kg" width={58} />
          <Tooltip
            contentStyle={tip}
            formatter={(v, name) => [`${fmt(Number(v))} kg`, name]}
          />
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
          />
          <Area
            dataKey="incoming_kg"
            name="Incoming"
            stroke="#7b90a8"
            fill="transparent"
            strokeDasharray="4 4"
            isAnimationActive={false}
          />
          <Area
            dataKey="captured_kg"
            name="Captured"
            stroke="#44dccb"
            fill="url(#plasticFill)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            dataKey="escaped_kg"
            name="Escaped"
            stroke="#f49587"
            fill="transparent"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Area
            dataKey="suspended_kg"
            name="Still suspended"
            stroke="#eabd6c"
            fill="transparent"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function FlowChart({ data }: { data: CaseResult }) {
  const rows = data.traces.map((r, i) => ({
    ...r,
    plastic_in_gs:
      (1000 * (r.incoming_kg - (data.traces[i - 1]?.incoming_kg || 0))) /
      data.metrics.dt_s,
  }));
  return (
    <div className="chart short">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid stroke="#223448" vertical={false} />
          <XAxis
            dataKey="time_s"
            tick={axis}
            tickFormatter={(v) => `${Number(v) / 60}m`}
          />
          <YAxis yAxisId="water" tick={axis} unit=" m³/s" width={70} />
          <YAxis
            yAxisId="plastic"
            orientation="right"
            tick={axis}
            unit=" g/s"
            width={60}
          />
          <Tooltip
            contentStyle={tip}
            formatter={(v, name) => [fmt(Number(v), 3), name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            yAxisId="water"
            dataKey="qin_m3s"
            name="Runoff inflow (m³/s)"
            stroke="#728aff"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="water"
            dataKey="qout_m3s"
            name="Outlet flow (m³/s)"
            stroke="#44dccb"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="plastic"
            dataKey="plastic_in_gs"
            name="Plastic arrival (g/s)"
            stroke="#eabd6c"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Tradeoff({ comparison }: { comparison: Comparison }) {
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 15, right: 30, left: 10, bottom: 28 }}>
          <CartesianGrid stroke="#223448" />
          <XAxis
            type="number"
            dataKey="warning_excess_ms"
            tick={axis}
            name="Warning exceedance"
            label={{
              value: "Warning exceedance integral (m·s) →",
              fill: "#8194ac",
              position: "bottom",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="capture_fraction"
            name="Capture rate"
            tick={axis}
            tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
            domain={[0, 1]}
          />
          <ZAxis range={[90, 90]} />
          <Tooltip
            contentStyle={tip}
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const m = payload?.[0]?.payload;
              if (!active || !m) return null;
              return (
                <div className="chart-tooltip">
                  <strong>
                    {labels[m.controller as keyof typeof labels]} · seed{" "}
                    {m.seed}
                  </strong>
                  <p>{fmt(m.capture_fraction * 100, 1)}% capture</p>
                  <p>{fmt(m.warning_excess_ms, 1)} m·s warning excess</p>
                  <p
                    className={
                      m.safety_violation_duration_s ? "text-danger" : ""
                    }
                  >
                    {m.safety_violation_duration_s} s above safety limit
                  </p>
                </div>
              );
            }}
          />
          {(Object.keys(labels) as (keyof typeof labels)[]).map((c) => (
            <Scatter
              key={c}
              name={labels[c]}
              data={comparison.case_metrics.filter((m) => m.controller === c)}
              fill={colors[c]}
              isAnimationActive={false}
            />
          ))}
          <Legend
            verticalAlign="top"
            wrapperStyle={{ fontSize: 11, paddingBottom: 12 }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
