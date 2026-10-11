import assert from "node:assert/strict";
import { computeSalesStats } from "../app/legacy/adminSalesStats.js";

const now = Date.parse("2026-10-11T12:00:00Z");
const at = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();
const tariffs = [
  { id: "basic", title: { ru: "Базовый" }, price_cents: 100000, duration_days: 30 },
  { id: "year", title: { ru: "Год" }, price_cents: 1200000, duration_days: 360 }
];
const transactions = [
  { id: "t1", parent_id: "p1", tariff_id: "basic", amount_cents: 100000, status: "succeeded", provider: "click", created_at: at(2) },
  { id: "t2", parent_id: "p1", tariff_id: "basic", amount_cents: 100000, status: "succeeded", provider: "click", created_at: at(40) },
  { id: "t3", parent_id: "p2", tariff_id: "year", amount_cents: 1200000, status: "succeeded", provider: "payme", created_at: at(5) },
  { id: "t4", parent_id: "p3", tariff_id: "basic", amount_cents: 100000, status: "pending", provider: "click", created_at: at(3) },
  { id: "t5", parent_id: "p4", tariff_id: "basic", amount_cents: 100000, status: "succeeded", provider: "click", created_at: at(45) }
];
const subscriptions = [
  { id: "s1", parent_id: "p1", tariff_id: "basic", status: "active", started_at: at(2), expires_at: at(-28) },
  { id: "s2", parent_id: "p2", tariff_id: "year", status: "active", started_at: at(5), expires_at: at(-3) },
  // p4 was active at the period start and lapsed during it -> churned
  { id: "s3", parent_id: "p4", tariff_id: "basic", status: "active", started_at: at(45), expires_at: at(15) },
  // p1's previous month, ended right before the renewal
  { id: "s4", parent_id: "p1", tariff_id: "basic", status: "active", started_at: at(40), expires_at: at(10) }
];

const stats = computeSalesStats({ transactions, subscriptions, parentsTotal: 10, tariffs, days: 30, now });

assert.equal(stats.kpis.revenue_cents.value, 1300000);
assert.equal(stats.kpis.revenue_cents.previous, 200000);
assert.equal(stats.kpis.payments.value, 2);
assert.equal(stats.kpis.arppu_cents.value, 650000, "1 300 000 over 2 payers");
assert.equal(stats.kpis.arpu_cents.value, 130000, "over all 10 parents");
assert.equal(stats.kpis.payment_success_rate.value, 66.7, "2 of 3 attempts in the period");
assert.equal(stats.current.active_subscriptions, 2);
assert.equal(stats.current.paid_conversion, 20);
assert.equal(stats.current.mrr_cents, 100000 + 100000, "yearly 1 200 000 counts as 100 000 a month");
assert.equal(stats.current.renewal_rate, 33.3, "p1 paid twice out of 3 payers");
assert.equal(stats.kpis.churn_rate.value, 50, "p1 renewed, p4 lapsed");
assert.equal(stats.daily.length, 30);
assert.equal(stats.daily.at(-3).revenue_cents, 100000);
assert.deepEqual(stats.expiring_soon.map((row) => row.id), ["s2"]);
assert.equal(stats.by_tariff[0].title, "Год");
assert.deepEqual(stats.by_provider.sort((a, b) => a.provider.localeCompare(b.provider)), [
  { provider: "click", revenue_cents: 100000 },
  { provider: "payme", revenue_cents: 1200000 }
]);
assert.equal(stats.recent_payments.find((row) => row.id === "t4").status, "pending");

console.log("sales stats tests passed");
