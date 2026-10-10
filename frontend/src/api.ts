import type {
  Run,
  RunConfig,
  CaseResult,
  Comparison,
  Model,
  Scenario,
  EvidenceFile,
  EvidenceData,
  Controller,
} from "./types";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error?.message || `Request failed (${response.status})`,
      response.status,
      body.error?.code || "request_failed",
    );
  }
  return response.json() as Promise<T>;
}
export const api = {
  health: () => request<{ status: string; active_jobs: number }>("/health"),
  scenarios: () =>
    request<{
      scenarios: Scenario[];
      durations_s: number[];
      integration_steps_s: number[];
      max_seeds: number;
    }>("/scenarios"),
  controllers: () =>
    request<{ id: Controller; label: string; description: string }[]>(
      "/controllers",
    ),
  model: () => request<Model>("/model"),
  runs: () => request<Run[]>("/runs"),
  run: (id: string) => request<Run>(`/runs/${id}`),
  submit: (config: RunConfig, key: string) =>
    request<Run>("/runs", {
      method: "POST",
      body: JSON.stringify(config),
      headers: { "Idempotency-Key": key },
    }),
  case: (id: string, key: string) =>
    request<CaseResult>(`/runs/${id}/cases/${key}`),
  compare: (id: string) => request<Comparison>(`/runs/${id}/comparison`),
  manifest: (id: string) =>
    request<Record<string, unknown>>(`/runs/${id}/manifest`),
  pilot: (scenario: string, controller: Controller) =>
    request<CaseResult>(
      `/evidence/pilot/case?scenario=${encodeURIComponent(scenario)}&controller=${controller}`,
    ),
  pilotComparison: (scenario: string, multi: boolean) =>
    request<Comparison>(
      `/evidence/pilot/comparison?scenario=${encodeURIComponent(scenario)}&multi_seed=${multi}`,
    ),
  files: () => request<{ files: EvidenceFile[] }>("/evidence/pilot"),
  file: (name: string, offset = 0) =>
    request<EvidenceData>(
      `/evidence/pilot/files/${encodeURIComponent(name)}?offset=${offset}&limit=50`,
    ),
};
export const downloadUrl = (id: string, kind = "metrics", format = "csv") =>
  `/api/runs/${id}/export?kind=${kind}&format=${format}`;
export const pilotDownload = (name: string) =>
  `/api/evidence/pilot/download/${encodeURIComponent(name)}`;
