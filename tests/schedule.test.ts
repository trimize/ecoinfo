import assert from "node:assert/strict";
import { test } from "node:test";
import { planReports } from "../src/lib/schedule";

const ids = (now: string, reports: { id: string; createdAt: string }[] = [], max?: number) =>
  planReports(new Date(now), reports, max).map((t) => `${t.period}:${t.key}`);

test("ordinary night: yesterday first, then catch-up", () => {
  const plan = ids("2026-11-05T00:10:00Z");
  assert.equal(plan[0], "day:2026-11-04");
  assert.deepEqual(plan.slice(1), ["day:2026-11-03", "day:2026-11-02", "day:2026-11-01"]);
});

test("end of month: day then month report", () => {
  assert.deepEqual(ids("2026-12-01T00:10:00Z").slice(0, 2), ["day:2026-11-30", "month:2026-11"]);
});

test("end of year: day, month and year reports", () => {
  assert.deepEqual(ids("2027-01-01T00:10:00Z").slice(0, 3), ["day:2026-12-31", "month:2026-12", "year:2026"]);
});

test("a provisional report (made during the period) is regenerated once the period ends", () => {
  const plan = ids("2026-12-01T00:10:00Z", [{ id: "month:2026-11", createdAt: "2026-11-02T16:00:00Z" }]);
  assert.ok(plan.includes("month:2026-11"));
});

test("final reports are not regenerated (idempotent re-runs)", () => {
  const done = [
    { id: "day:2026-11-30", createdAt: "2026-12-01T00:11:00Z" },
    { id: "month:2026-11", createdAt: "2026-12-01T00:12:00Z" },
  ];
  const plan = ids("2026-12-01T00:40:00Z", done);
  assert.ok(!plan.includes("day:2026-11-30"));
  assert.ok(!plan.includes("month:2026-11"));
});

test("a missed night is caught up, last completed month and year included", () => {
  const all = ids("2026-11-05T00:10:00Z", [], 20);
  assert.ok(all.includes("day:2026-10-30"));
  assert.ok(all.includes("month:2026-10"));
  assert.ok(all.includes("year:2025"));
});

test("the number of generations per run is capped", () => {
  assert.equal(ids("2027-01-01T00:10:00Z").length, 4);
});
