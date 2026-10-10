import {
  AlertTriangle,
  ArrowUpRight,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
export const SAFETY_WARNING =
  "TideLock is an experimental simulation and is not validated for real drainage operations. A safe-state command does not guarantee flood prevention.";
export const labels = {
  fixed: "Fixed barrier",
  threshold: "Hysteretic threshold",
  predictive: "TideLock predictive",
};
export const colors = {
  fixed: "#f49587",
  threshold: "#eabd6c",
  predictive: "#44dccb",
};
export const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n)
    ? "Unavailable"
    : new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      }).format(n);
export const timeLabel = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
export function Panel({
  title,
  eyebrow,
  children,
  action,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Loading({
  label = "Loading simulation evidence…",
}: {
  label?: string;
}) {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" size={26} />
      <p>{label}</p>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ArrowUpRight />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle size={20} />
      <div>
        <strong>Something needs attention</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <button onClick={retry} className="button secondary">
          <RefreshCw size={15} />
          Retry
        </button>
      )}
    </div>
  );
}
export function SafetyWarning() {
  return (
    <div className="safety-warning">
      <AlertTriangle size={16} />
      <p>{SAFETY_WARNING}</p>
    </div>
  );
}
export function Metric({
  label,
  value,
  unit,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  unit?: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{detail}</p>
    </div>
  );
}
