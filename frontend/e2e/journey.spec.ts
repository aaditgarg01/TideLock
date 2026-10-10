import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("complete simulation, compare, replay, inspect faults, browse evidence and export", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByText("Every decision has a downstream effect."),
  ).toBeVisible();
  await expect(
    page.getByTestId("water-chart").locator(".recharts-line").first(),
  ).toBeVisible();
  await expect(
    page.getByText("TideLock is an experimental simulation", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Simulation lab", exact: true })
    .click();
  await page
    .getByLabel("Scenario", { exact: true })
    .selectOption("sensor_bias");
  await page.getByLabel("Random seeds").fill("11, 23");
  await page
    .getByRole("checkbox", { name: "Fixed barrier", exact: false })
    .check();
  await page
    .getByRole("checkbox", { name: "Hysteretic threshold", exact: false })
    .check();
  const posted = page.waitForResponse(
    (r) => r.url().endsWith("/api/runs") && r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Run simulation", exact: true })
    .click();
  const response = await posted;
  expect(response.status()).toBe(202);
  const submitted = await response.json();
  await expect(
    page.getByText("Experiment complete", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  const complete = await (
    await request.get("/api/runs/" + submitted.id)
  ).json();
  expect(complete.completed_cases).toBe(6);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByText("Safety limit exceeded.", { exact: true }),
  ).toBeVisible();
  const actual = await (
    await request.get(`/api/runs/${submitted.id}/cases/predictive-11`)
  ).json();
  const expected = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(actual.metrics.captured_kg);
  await expect(
    page.locator(".metric").filter({ hasText: "Plastic captured" }),
  ).toContainText(expected);
  await expect(
    page.getByTestId("water-chart").locator(".recharts-line").first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Controller comparison", exact: true })
    .click();
  await expect(
    page.getByText("Paired inputs verified", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Multi-seed comparison · means with observed ranges"),
  ).toBeVisible();
  await expect(page.getByText("6 / 6 cases", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/comparison-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Drainage twin", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset replay" }).click();
  await expect(page.locator(".replay-controls .time")).toHaveText("00:05");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.locator(".replay-controls .time")).not.toHaveText("00:05");
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.getByRole("button", { name: "10:00 · fault start" }).click();
  await expect(
    page.getByText("Injected fault active", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Event & fault log", exact: true })
    .click();
  await page.getByLabel("Event category").selectOption("injected");
  await expect(page.getByText("fault start", { exact: true })).toBeVisible();
  await page.getByLabel("Event category").selectOption("condition");
  await page.getByLabel("Event severity").selectOption("critical");
  await expect(
    page.getByText("safety limit exceeded", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Experiment evidence", exact: true })
    .click();
  await page.getByLabel("Search evidence files").fill("checks.json");
  await page
    .locator(".file-list button")
    .filter({ hasText: "checks.json" })
    .click();
  await expect(page.locator(".json-view")).not.toBeEmpty();
  await page.getByLabel("Search evidence files").fill("metrics.csv");
  await page
    .locator(".file-list button")
    .filter({ hasText: "metrics.csv" })
    .click();
  await expect(page.getByText("1–50 of 255 rows")).toBeVisible();
  await page.getByRole("button", { name: "Next evidence page" }).click();
  await expect(page.getByText("51–100 of 255 rows")).toBeVisible();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "metrics CSV", exact: true }).click();
  const csv = await csvDownload;
  expect(await csv.failure()).toBeNull();
  expect(await readFile((await csv.path())!, "utf8")).toContain(
    "disturbance_sha256",
  );
  const summaryDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "summary JSON", exact: true }).click();
  const summary = await summaryDownload;
  const body = JSON.parse(await readFile((await summary.path())!, "utf8"));
  expect(body.run.id).toBe(submitted.id);
  expect(body.comparison.case_metrics).toHaveLength(6);
  await page.getByRole("button", { name: "Model health", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unavailable measurements" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile navigation and readable layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("water-chart")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/overview-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Simulation lab", exact: true })
    .click();
  await expect(page.getByLabel("Scenario", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("API outage is visible and retry recovers", async ({ page }) => {
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "offline", message: "Simulation API unavailable" },
      }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Simulation API unavailable",
  );
  await page.unroute("**/api/health");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTestId("water-chart")).toBeVisible();
});
