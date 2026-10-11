// Aggregated numbers for the admin dashboard home page, computed in SQL so the
// dashboard does not download whole tables to count rows.
//
// Every KPI is returned for the selected period and for the period before it,
// so the UI can show "+12 % к прошлому периоду".

const ALLOWED_DAYS = new Set([7, 30, 90, 365]);
const SUCCEEDED_PAYMENT = "('succeeded', 'success', 'paid', 'completed')";

function periodDays(value) {
  const days = Number(value);
  return ALLOWED_DAYS.has(days) ? days : 30;
}

async function count(db, sql, params) {
  const row = await db.one(sql, params);
  return Number(row?.count || 0);
}

function kpi(current, previous) {
  return {
    value: current,
    previous,
    delta: current - previous,
    delta_percent: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null
  };
}

async function periodPair(db, sqlForRange, days) {
  const [current, previous] = await Promise.all([
    count(db, sqlForRange, [`${days} days`, "0 days"]),
    count(db, sqlForRange, [`${days * 2} days`, `${days} days`])
  ]);

  return kpi(current, previous);
}

export async function buildAdminOverview(db, query = {}) {
  const days = periodDays(query.days);
  // $1 = start offset, $2 = end offset, both relative to now().
  const range = (column) => `${column} >= now() - $1::interval AND ${column} < now() - $2::interval`;

  const [
    parentsTotal,
    newParents,
    childrenTotal,
    newChildren,
    activeSubscriptions,
    newSubscriptions,
    revenue,
    unreadSupport,
    dailyRows,
    subscriptionStatusRows,
    recentParents,
    topContent,
    supportChats
  ] = await Promise.all([
    count(db, "SELECT COUNT(*)::integer AS count FROM users WHERE role = 'parent'"),
    periodPair(db, `SELECT COUNT(*)::integer AS count FROM users WHERE role = 'parent' AND ${range("created_at")}`, days),
    count(db, "SELECT COUNT(*)::integer AS count FROM children WHERE active = true"),
    periodPair(db, `SELECT COUNT(*)::integer AS count FROM children WHERE ${range("created_at")}`, days),
    count(db, "SELECT COUNT(*)::integer AS count FROM subscriptions WHERE status = 'active' AND ends_at > now()"),
    periodPair(db, `SELECT COUNT(*)::integer AS count FROM subscriptions WHERE ${range("created_at")}`, days),
    periodPair(
      db,
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS count FROM v1_transactions
       WHERE status IN ${SUCCEEDED_PAYMENT} AND ${range("COALESCE(processed_at, created_at)")}`,
      days
    ),
    count(db, "SELECT COUNT(*)::integer AS count FROM support_chats WHERE admin_unread_count > 0"),
    db.many(
      `
        WITH day AS (
          SELECT generate_series(date_trunc('day', now()) - ($1::integer - 1) * interval '1 day', date_trunc('day', now()), interval '1 day') AS day
        )
        SELECT
          to_char(day.day, 'YYYY-MM-DD') AS date,
          (SELECT COUNT(*) FROM users u WHERE u.role = 'parent' AND date_trunc('day', u.created_at) = day.day)::integer AS parents,
          (SELECT COUNT(*) FROM children c WHERE date_trunc('day', c.created_at) = day.day)::integer AS children,
          (SELECT COALESCE(SUM(t.amount_cents), 0) FROM v1_transactions t
            WHERE t.status IN ${SUCCEEDED_PAYMENT} AND date_trunc('day', COALESCE(t.processed_at, t.created_at)) = day.day)::bigint AS revenue_cents
        FROM day
        ORDER BY day.day
      `,
      [days]
    ),
    db.many(
      `
        SELECT
          CASE
            WHEN status = 'active' AND ends_at > now() THEN 'active'
            WHEN status = 'active' THEN 'expired'
            ELSE status
          END AS status,
          COUNT(*)::integer AS count
        FROM subscriptions
        GROUP BY 1
      `
    ),
    db.many(
      `
        SELECT u.id, u.name, u.last_name, u.email, u.created_at,
          EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = u.id AND s.status = 'active' AND s.ends_at > now()) AS premium
        FROM users u
        WHERE u.role = 'parent'
        ORDER BY u.created_at DESC
        LIMIT 6
      `
    ),
    db.many(
      `
        SELECT id, title, poster_url, poster_path, COALESCE(views_count, 0)::integer AS views
        FROM content
        WHERE series_id IS NULL
        ORDER BY COALESCE(views_count, 0) DESC, created_at DESC
        LIMIT 5
      `
    ),
    db.many(
      `
        SELECT sc.id, sc.admin_unread_count, sc.last_message_preview, sc.last_message_at, u.name, u.email
        FROM support_chats sc
        JOIN users u ON u.id = sc.user_id
        ORDER BY sc.admin_unread_count DESC, sc.last_message_at DESC NULLS LAST
        LIMIT 5
      `
    )
  ]);

  const subscriptionStatuses = Object.fromEntries(subscriptionStatusRows.map((row) => [row.status, Number(row.count)]));
  const freeParents = Math.max(parentsTotal - activeSubscriptions, 0);

  return {
    days,
    generated_at: new Date().toISOString(),
    kpis: {
      parents: { total: parentsTotal, ...newParents },
      children: { total: childrenTotal, ...newChildren },
      subscriptions: { total: activeSubscriptions, ...newSubscriptions },
      revenue: { currency: "UZS", ...revenue },
      support_unread: unreadSupport
    },
    daily: dailyRows.map((row) => ({
      date: row.date,
      parents: Number(row.parents),
      children: Number(row.children),
      revenue_cents: Number(row.revenue_cents)
    })),
    subscription_statuses: subscriptionStatuses,
    audience: {
      premium: activeSubscriptions,
      free: freeParents,
      premium_share: parentsTotal ? Math.round((activeSubscriptions / parentsTotal) * 1000) / 10 : 0
    },
    recent_parents: recentParents,
    top_content: topContent,
    support_chats: supportChats
  };
}
