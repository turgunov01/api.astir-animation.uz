import { uzsPerUnit } from "../lib/exchangeRates.js";
import { localDayKey, localDayStart } from "../lib/localDay.js";
// Sales report for the admin "Подписки" page, from the live v1 billing
// tables: revenue and payments by day, MRR, ARPU/ARPPU, conversion to paid,
// churn, renewals, payment success, splits by tariff and provider, plus
// subscriptions about to expire and the latest payments.

const DAY_MS = 86_400_000;
const SUCCEEDED = new Set(["succeeded", "success", "paid", "completed"]);
const FAILED = new Set(["failed", "canceled", "cancelled", "error", "rejected"]);

const dayKey = localDayKey;

function ratio(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : null;
}

function kpi(current, previous) {
  return {
    value: current,
    previous,
    delta_percent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null
  };
}

function localizedTitle(value) {
  if (!value || typeof value !== "object") return String(value || "");
  return value.ru || value.uz || value.en || "";
}

export function computeSalesStats({ transactions, subscriptions, parentsTotal, newParents = { current: 0, previous: 0 }, tariffs = [], days = 30, now = Date.now() }) {
  const todayStart = localDayStart(now);
  const from = todayStart - (days - 1) * DAY_MS;
  const previousFrom = from - days * DAY_MS;
  const inRange = (time, start, end) => time >= start && time < end;
  const end = todayStart + DAY_MS;
  const tariffById = new Map(tariffs.map((tariff) => [String(tariff.id), tariff]));

  const paidAt = (tx) => new Date(tx.processed_at || tx.created_at).getTime();
  const succeeded = transactions.filter((tx) => SUCCEEDED.has(String(tx.status)));
  const periodTx = (start, stop) => transactions.filter((tx) => inRange(new Date(tx.created_at).getTime(), start, stop));
  const periodPaid = (start, stop) => succeeded.filter((tx) => inRange(paidAt(tx), start, stop));

  const paidNow = periodPaid(from, end);
  const paidBefore = periodPaid(previousFrom, from);
  const sum = (rows) => rows.reduce((total, tx) => total + (Number(tx.amount_cents) || 0), 0);
  const payers = (rows) => new Set(rows.map((tx) => String(tx.parent_id))).size;

  // Payment success: share of checkout attempts that ended paid.
  const attemptsNow = periodTx(from, end);
  const attemptsBefore = periodTx(previousFrom, from);
  const successRate = (attempts) => ratio(attempts.filter((tx) => SUCCEEDED.has(String(tx.status))).length, attempts.length);

  // Subscriptions
  const isActiveAt = (sub, time) => new Date(sub.started_at || sub.created_at).getTime() <= time && new Date(sub.expires_at).getTime() > time && String(sub.status) !== "canceled";
  const activeNow = subscriptions.filter((sub) => isActiveAt(sub, now));
  const activeParentsNow = new Set(activeNow.map((sub) => String(sub.parent_id)));
  const newSubs = (start, stop) => subscriptions.filter((sub) => inRange(new Date(sub.started_at || sub.created_at).getTime(), start, stop)).length;

  // Churn: families active at the period start who have no active
  // subscription at its end.
  const churnFor = (start, stop) => {
    const startParents = new Set(subscriptions.filter((sub) => isActiveAt(sub, start)).map((sub) => String(sub.parent_id)));
    const endParents = new Set(subscriptions.filter((sub) => isActiveAt(sub, Math.min(stop, now))).map((sub) => String(sub.parent_id)));
    const lost = [...startParents].filter((parent) => !endParents.has(parent)).length;
    return { lost, base: startParents.size, rate: ratio(lost, startParents.size) };
  };
  const churnNow = churnFor(from, end);
  const churnBefore = churnFor(previousFrom, from);

  // Renewals: paying families who paid more than once.
  const paymentsByParent = new Map();
  for (const tx of succeeded) paymentsByParent.set(String(tx.parent_id), (paymentsByParent.get(String(tx.parent_id)) || 0) + 1);
  const repeatPayers = [...paymentsByParent.values()].filter((count) => count > 1).length;

  // MRR: active subscriptions normalised to a 30-day price.
  const monthlyCents = (sub) => {
    const tariff = tariffById.get(String(sub.tariff_id));
    const price = Number(tariff?.price_cents) || 0;
    const period = Number(tariff?.duration_days) || 30;
    return Math.round((price * 30) / period);
  };
  const mrr = activeNow.reduce((total, sub) => total + monthlyCents(sub), 0);

  // Daily series for the period.
  const daily = [];
  for (let time = from; time < end; time += DAY_MS) {
    const key = dayKey(time);
    const paid = paidNow.filter((tx) => dayKey(paidAt(tx)) === key);
    daily.push({
      day: key,
      revenue_cents: sum(paid),
      payments: paid.length,
      attempts: attemptsNow.filter((tx) => dayKey(new Date(tx.created_at).getTime()) === key).length,
      new_subscriptions: subscriptions.filter((sub) => dayKey(new Date(sub.started_at || sub.created_at).getTime()) === key).length
    });
  }

  const byTariff = new Map();
  for (const sub of activeNow) {
    const entry = byTariff.get(String(sub.tariff_id)) || { tariff_id: String(sub.tariff_id), active: 0, revenue_cents: 0 };
    entry.active += 1;
    byTariff.set(entry.tariff_id, entry);
  }
  for (const tx of paidNow) {
    const entry = byTariff.get(String(tx.tariff_id)) || { tariff_id: String(tx.tariff_id), active: 0, revenue_cents: 0 };
    entry.revenue_cents += Number(tx.amount_cents) || 0;
    byTariff.set(entry.tariff_id, entry);
  }

  const byProvider = new Map();
  for (const tx of paidNow) {
    const key = String(tx.provider || "other");
    byProvider.set(key, (byProvider.get(key) || 0) + (Number(tx.amount_cents) || 0));
  }

  const revenueNow = sum(paidNow);
  const revenueBefore = sum(paidBefore);
  const payersNow = payers(paidNow);
  const payersBefore = payers(paidBefore);
  const lifetimeRevenue = sum(succeeded);
  const lifetimePayers = paymentsByParent.size;

  return {
    range_days: days,
    currency: "UZS",
    kpis: {
      revenue_cents: kpi(revenueNow, revenueBefore),
      payments: kpi(paidNow.length, paidBefore.length),
      new_subscriptions: kpi(newSubs(from, end), newSubs(previousFrom, from)),
      new_parents: kpi(newParents.current, newParents.previous),
      arppu_cents: kpi(payersNow ? Math.round(revenueNow / payersNow) : 0, payersBefore ? Math.round(revenueBefore / payersBefore) : 0),
      arpu_cents: kpi(parentsTotal ? Math.round(revenueNow / parentsTotal) : 0, parentsTotal ? Math.round(revenueBefore / parentsTotal) : 0),
      payment_success_rate: kpi(successRate(attemptsNow) ?? 0, successRate(attemptsBefore) ?? 0),
      churn_rate: kpi(churnNow.rate ?? 0, churnBefore.rate ?? 0)
    },
    current: {
      active_subscriptions: activeNow.length,
      paying_parents: activeParentsNow.size,
      parents_total: parentsTotal,
      paid_conversion: ratio(activeParentsNow.size, parentsTotal),
      mrr_cents: mrr,
      arr_cents: mrr * 12,
      renewal_rate: ratio(repeatPayers, lifetimePayers),
      ltv_cents: lifetimePayers ? Math.round(lifetimeRevenue / lifetimePayers) : 0,
      lifetime_revenue_cents: lifetimeRevenue,
      churned_in_period: churnNow.lost
    },
    daily,
    by_tariff: [...byTariff.values()]
      .map((row) => ({ ...row, title: localizedTitle(tariffById.get(row.tariff_id)?.title) || row.tariff_id }))
      .sort((left, right) => right.revenue_cents - left.revenue_cents),
    by_provider: [...byProvider.entries()].map(([provider, revenue_cents]) => ({ provider, revenue_cents })),
    expiring_soon: activeNow
      .filter((sub) => new Date(sub.expires_at).getTime() - now < 7 * DAY_MS)
      .sort((left, right) => new Date(left.expires_at) - new Date(right.expires_at))
      .map((sub) => ({
        id: sub.id,
        parent_id: sub.parent_id,
        parent_name: sub.parent_name || null,
        tariff: localizedTitle(tariffById.get(String(sub.tariff_id))?.title) || sub.tariff_id,
        expires_at: sub.expires_at
      })),
    recent_payments: transactions.slice(0, 20).map((tx) => ({
      id: tx.id,
      parent_id: tx.parent_id,
      parent_name: tx.parent_name || null,
      tariff: localizedTitle(tariffById.get(String(tx.tariff_id))?.title) || tx.tariff_id,
      amount_cents: Number(tx.amount_cents) || 0,
      currency: tx.currency || "UZS",
      original_amount_cents: tx.original_amount_cents ?? null,
      original_currency: tx.original_currency ?? null,
      provider: tx.provider,
      status: SUCCEEDED.has(String(tx.status)) ? "succeeded" : FAILED.has(String(tx.status)) ? "failed" : String(tx.status || "pending"),
      created_at: tx.created_at
    }))
  };
}

export async function buildSalesStats(db, { days: requestedDays, tariffs = [] } = {}) {
  const days = [7, 30, 90, 365].includes(Number(requestedDays)) ? Number(requestedDays) : 30;
  const name = "NULLIF(TRIM(CONCAT_WS(' ', u.name, u.last_name)), '')";
  // Subscriptions live in two places: v1 billing (Click checkout in the new
  // API) and the legacy table (older checkout, store purchases, grants).
  const [transactions, v1Subscriptions, legacySubscriptions, plans, parents, newParents] = await Promise.all([
    db.many(`
      SELECT t.id, t.parent_id, t.tariff_id, t.amount_cents, t.currency, t.provider, t.status, t.created_at, t.processed_at,
        COALESCE(${name}, u.email) AS parent_name
      FROM v1_transactions t LEFT JOIN users u ON u.id = t.parent_id
      ORDER BY t.created_at DESC
    `),
    db.many(`
      SELECT s.id, s.parent_id, s.tariff_id, s.status, s.started_at, s.created_at, s.expires_at,
        COALESCE(${name}, u.email) AS parent_name
      FROM v1_subscriptions s LEFT JOIN users u ON u.id = s.parent_id
    `),
    db.many(`
      SELECT s.id, s.user_id AS parent_id, s.plan_id AS tariff_id, s.status, s.starts_at AS started_at, s.created_at, s.ends_at AS expires_at,
        COALESCE(${name}, u.email) AS parent_name
      FROM subscriptions s LEFT JOIN users u ON u.id = s.user_id
    `),
    db.many("SELECT id::text AS id, name AS title, price_cents, duration_days FROM plans"),
    db.one("SELECT count(*)::int AS count FROM users WHERE role = 'parent'"),
    db.one(`
      SELECT
        count(*) FILTER (WHERE created_at >= now() - $1::interval)::int AS current,
        count(*) FILTER (WHERE created_at >= now() - $2::interval AND created_at < now() - $1::interval)::int AS previous
      FROM users WHERE role = 'parent'
    `, [`${days} days`, `${days * 2} days`])
  ]);

  // Revenue is in UZS: store payments (USD) are converted at the CBU rate,
  // keeping the original amount for the payments list.
  const rates = new Map();
  for (const currency of new Set(transactions.map((tx) => String(tx.currency || "UZS").toUpperCase()))) {
    rates.set(currency, await uzsPerUnit(currency));
  }
  const inUzs = transactions.map((tx) => {
    const currency = String(tx.currency || "UZS").toUpperCase();
    if (currency === "UZS") return tx;
    return {
      ...tx,
      original_amount_cents: Number(tx.amount_cents) || 0,
      original_currency: currency,
      amount_cents: Math.round((Number(tx.amount_cents) || 0) * (rates.get(currency) || 0)),
      currency: "UZS"
    };
  });

  return computeSalesStats({
    transactions: inUzs,
    subscriptions: [...v1Subscriptions, ...legacySubscriptions],
    parentsTotal: parents?.count || 0,
    newParents: { current: newParents?.current || 0, previous: newParents?.previous || 0 },
    tariffs: [...tariffs, ...plans],
    days
  });
}
