export type Controller = "fixed" | "threshold" | "predictive";
export type Tab =
  | "overview"
  | "laboratory"
  | "comparison"
  | "twin"
  | "events"
  | "evidence"
  | "health";
export type Scalar = string | number | boolean | null;
export interface Scenario {
  id: string;
  label: string;
  description: string;
}
export interface RunConfig {
  scenario: string;
  controllers: Controller[];
  seeds: number[];
  duration_s: number;
  dt_s: number;
  threshold_open_m: number;
  threshold_close_m: number;
  predictive_cap_m: number;
}
export interface CaseIndex {
  case_id: string;
  controller: Controller;
  seed: number;
  status: "complete" | "failed";
  error: string | null;
}
export interface Run {
  id: string;
  status: "queued" | "running" | "complete" | "partial" | "failed";
  created_at: string;
  updated_at: string;
  request: RunConfig;
  completed_cases: number;
  total_cases: number;
  cases: CaseIndex[];
  error: string | null;
  warnings: string[];
}
export interface Metrics {
  scenario: string;
  seed: number;
  controller: Controller;
  disturbance_sha256: string;
  dt_s: number;
  incoming_kg: number;
  captured_kg: number;
  escaped_kg: number;
  suspended_final_kg: number;
  initial_basket_kg: number;
  basket_final_kg: number;
  removed_kg: number;
  capture_fraction: number;
  escape_fraction: number;
  max_level_m: number;
  warning_duration_s: number;
  warning_excess_ms: number;
  safety_violation_episodes: number;
  safety_violation_duration_s: number;
  basket_overflow_events: number;
  basket_rejected_capture_episodes: number;
  spill_m3: number;
  actuator_command_changes: number;
  actuator_total_travel: number;
  recovery_after_fault_s: number | null;
  fallback_updates: number;
  compute_median_ms: number;
  compute_p95_ms: number;
  water_residual_relative: number;
  plastic_residual_relative: number;
}
export interface Trace {
  time_s: number;
  h_m: number;
  tide_m: number;
  qin_m3s: number;
  qout_m3s: number;
  basket_kg: number;
  suspended_kg: number;
  captured_kg: number;
  escaped_kg: number;
  incoming_kg: number;
  removed_kg: number;
  actuator: number;
  target: number;
  mode: string;
  spill_m3: number;
  rejected_kg: number;
  water_error_m3: number;
  plastic_error_kg: number;
  travel: number;
}
export interface Event {
  time_s: number;
  severity: "info" | "warning" | "critical";
  category:
    | "injected"
    | "detected"
    | "command"
    | "condition"
    | "maintenance"
    | "controller";
  event: string;
  detail: string;
  measurements: Record<string, Scalar>;
}
export interface Update {
  time_s: number;
  mode: string;
  seconds: number;
  feasible_plans: number;
  reliable: boolean;
  reason: string;
  target: number;
}
export interface CaseResult {
  case_id: string;
  parameters: Record<string, number | boolean>;
  metrics: Metrics;
  traces: Trace[];
  events: Event[];
  updates: Update[];
}
export interface Comparison {
  kind: "single-seed" | "multi-seed";
  expected_cases: number;
  successful_cases: number;
  paired_inputs_verified: boolean;
  complete_pairs: boolean;
  case_metrics: Metrics[];
  aggregates: Record<string, Scalar>[];
  failed_cases: CaseIndex[];
  note: string;
}
export interface Model {
  warning: string;
  parameters: Record<string, number | boolean>;
  assumptions: string[];
  unavailable: string[];
  metrics: Record<string, string>;
}
export interface EvidenceFile {
  path: string;
  bytes: number;
  kind: string;
}
export interface EvidenceData {
  kind: "table" | "json" | "text" | "image";
  path: string;
  total?: number;
  offset?: number;
  rows?: Record<string, Scalar>[];
  data?: unknown;
  text?: string;
}
