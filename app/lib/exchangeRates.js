// UZS per unit of a foreign currency, from the Central Bank of Uzbekistan
// (cbu.uz), cached for 12 h. Used to show store payments (USD) in the admin
// revenue, which is kept in UZS. Falls back to USD_UZS_RATE / the last rate.

const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map();

export async function uzsPerUnit(currency, { fetchImpl = fetch, now = Date.now(), fallback = Number(process.env.USD_UZS_RATE) || 12800 } = {}) {
  const code = String(currency || "UZS").toUpperCase();
  if (code === "UZS") return 1;

  const cached = cache.get(code);
  if (cached && now - cached.at < CACHE_MS) return cached.rate;

  try {
    const response = await fetchImpl(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/${encodeURIComponent(code)}/`, {
      signal: AbortSignal.timeout(5000)
    });
    const rows = await response.json();
    const rate = Number(String(rows?.[0]?.Rate || "").replace(",", "."));
    if (Number.isFinite(rate) && rate > 0) {
      cache.set(code, { rate, at: now });
      return rate;
    }
  } catch {
    // keep the last known or the fallback rate
  }
  return cached?.rate || (code === "USD" ? fallback : 0);
}
