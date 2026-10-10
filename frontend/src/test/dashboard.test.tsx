import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Laboratory, parseSeeds } from "../components/Laboratory";
import { Events } from "../components/Events";
import { SAFETY_WARNING, SafetyWarning } from "../components/Common";
import { request, api } from "../api";
import type { Event } from "../types";
const scenarios = [
  {
    id: "compound",
    label: "Compound",
    description: "Coincident surge and tide.",
  },
];
const controllers = [
  { id: "predictive" as const, description: "Finite horizon" },
];
const laboratory = (
  onRun = vi.fn().mockResolvedValue(undefined),
  busy = false,
  error = "",
) =>
  render(
    <Laboratory
      scenarios={scenarios}
      durations={[300, 1800]}
      onRun={onRun}
      busy={busy}
      run={null}
      error={error}
      controllerInfo={controllers}
    />,
  );
describe("simulation laboratory", () => {
  it("rejects duplicate, malformed, excessive and out-of-range seeds", () => {
    for (const invalid of [
      "",
      "1,1",
      "1.5",
      "-1",
      "4294967296",
      Array.from({ length: 11 }, (_, i) => i).join(","),
    ])
      expect(() => parseSeeds(invalid)).toThrow();
    expect(parseSeeds("0, 11, 4294967295")).toEqual([0, 11, 4294967295]);
  });
  it("submits actual selected configuration", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    laboratory(run);
    fireEvent.change(screen.getByLabelText("Random seeds"), {
      target: { value: "23,37" },
    });
    fireEvent.change(screen.getByLabelText("Duration"), {
      target: { value: "300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        seeds: [23, 37],
        duration_s: 300,
        controllers: ["predictive"],
      }),
    );
  });
  it("shows validation and does not submit invalid input", () => {
    const run = vi.fn();
    laboratory(run);
    fireEvent.change(screen.getByLabelText("Random seeds"), {
      target: { value: "11,11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run simulation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("unique integers");
    expect(run).not.toHaveBeenCalled();
  });
  it("disables duplicate submission and surfaces worker errors", () => {
    laboratory(undefined, true, "Worker queue is full");
    expect(
      screen.getByRole("button", { name: "Simulation running…" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Worker queue is full");
  });
});
describe("safety and event visibility", () => {
  it("always displays the complete safety warning", () => {
    render(<SafetyWarning />);
    expect(screen.getByText(SAFETY_WARNING)).toBeVisible();
  });
  it("filters injected faults separately from measured conditions", () => {
    const events: Event[] = [
      {
        time_s: 600,
        severity: "warning",
        category: "injected",
        event: "fault_start",
        detail: "Sensor bias",
        measurements: {},
      },
      {
        time_s: 610,
        severity: "critical",
        category: "condition",
        event: "safety_limit_exceeded",
        detail: "True virtual level",
        measurements: { level_m: 1.7 },
      },
    ];
    render(<Events events={events} />);
    fireEvent.change(screen.getByLabelText("Event category"), {
      target: { value: "condition" },
    });
    expect(screen.getByText("safety limit exceeded")).toBeVisible();
    expect(screen.queryByText("fault start")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search events"), {
      target: { value: "missing" },
    });
    expect(screen.getByText("No matching events")).toBeVisible();
  });
});
describe("typed API client", () => {
  it("preserves structured failure messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "queue_full", message: "Worker queue is full" },
          }),
          { status: 429 },
        ),
      ),
    );
    await expect(request("/runs")).rejects.toMatchObject({
      status: 429,
      code: "queue_full",
      message: "Worker queue is full",
    });
  });
  it("handles a non-JSON failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })),
    );
    await expect(request("/runs")).rejects.toMatchObject({
      status: 503,
      message: "Request failed (503)",
    });
  });
  it("encodes nested evidence paths and comparison scope", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    await api.file("traces/compound_predictive.csv", 50);
    expect(fetchMock.mock.calls[0][0]).toContain(
      "traces%2Fcompound_predictive.csv?offset=50",
    );
    await api.pilotComparison("compound", true);
    expect(fetchMock.mock.calls[1][0]).toContain("multi_seed=true");
  });
});
