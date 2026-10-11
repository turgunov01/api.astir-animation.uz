import assert from "node:assert/strict";
import { normalizeTariffAccess, tariffUnlocksMovie } from "../app/services/tariffService.js";

const free = { id: "f", is_premium: false, category_id: "cartoons" };
const kidsPremium = { id: "k", is_premium: true, category_id: "cartoons", tag_ids: ["history"], age_rating: 3 };
const teenPremium = { id: "t", is_premium: true, category_id: "series", tag_ids: ["space"], age_rating: 12, content_type: "series" };
const episode = { id: "e", is_premium: true, series_id: "s1", age_rating: 0 };

const freeTariff = { can_watch_premium: false };
const allPremium = { can_watch_premium: true };
const kids = { can_watch_premium: true, access: { category_ids: ["cartoons"], max_age_rating: 6 } };
const historyOnly = { can_watch_premium: true, access: { tag_ids: ["history"] } };
const seriesOnly = { can_watch_premium: true, access: { content_types: ["series", "episode"] } };
const gift = { can_watch_premium: false, access: { include_ids: ["t"] } };
const blocked = { can_watch_premium: true, access: { exclude_ids: ["k"] } };

assert.equal(tariffUnlocksMovie(freeTariff, free), true, "free content is open to everyone");
assert.equal(tariffUnlocksMovie(null, free), true);
assert.equal(tariffUnlocksMovie(freeTariff, kidsPremium), false);
assert.equal(tariffUnlocksMovie(allPremium, teenPremium), true, "no rules = all premium");
assert.equal(tariffUnlocksMovie(kids, kidsPremium), true);
assert.equal(tariffUnlocksMovie(kids, teenPremium), false, "wrong category and too old");
assert.equal(tariffUnlocksMovie(historyOnly, kidsPremium), true);
assert.equal(tariffUnlocksMovie(historyOnly, teenPremium), false);
assert.equal(tariffUnlocksMovie(seriesOnly, teenPremium), true);
assert.equal(tariffUnlocksMovie(seriesOnly, episode), true);
assert.equal(tariffUnlocksMovie(seriesOnly, kidsPremium), false);
assert.equal(tariffUnlocksMovie(gift, teenPremium), true, "include works even without premium");
assert.equal(tariffUnlocksMovie(gift, kidsPremium), false);
assert.equal(tariffUnlocksMovie(blocked, kidsPremium), false);
assert.equal(tariffUnlocksMovie(blocked, teenPremium), true);

assert.deepEqual(normalizeTariffAccess({ content_types: ["movie", "bogus"], max_age_rating: "6", tag_ids: ["a", ""] }), {
  category_ids: [], tag_ids: ["a"], content_types: ["movie"], max_age_rating: 6, include_ids: [], exclude_ids: []
});
assert.equal(normalizeTariffAccess(null).max_age_rating, null);

console.log("tariff access tests passed");
