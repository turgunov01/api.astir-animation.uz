import assert from "node:assert/strict";
import { createContentService } from "../app/services/contentService.js";

const categories = [
  { id: "cat-used", title: { ru: "Мультфильмы" }, type: "cartoon", slug: "cartoons" },
  { id: "cat-rules", title: { ru: "Мультсериалы" }, type: "cartoonseries", slug: "series" },
  { id: "cat-free", title: { ru: "Пустая" }, type: "other", slug: "empty" }
];
const deleted = [];
const service = createContentService({
  contentCategories: {
    list: () => categories,
    findById: (id) => categories.find((category) => category.id === id) || null,
    delete: (id) => { deleted.push(id); return categories.find((category) => category.id === id); }
  },
  contentMovies: {
    list: () => [
      { id: "m1", category_id: "cat-used", content_type: "movie" },
      { id: "m2", category_id: "cat-used", content_type: "series" }
    ]
  },
  usageDb: { many: async () => [{ id: "cat-rules", key: "rules", count: 2 }] }
});

const { categories: listed } = await service.listCategories();
const byId = Object.fromEntries(listed.map((category) => [category.id, category]));
assert.deepEqual(byId["cat-used"].usage, { movies: 1, series: 1, content: 0, subcategories: 0, rules: 0, total: 2 });
assert.equal(byId["cat-used"].can_delete, false);
assert.equal(byId["cat-rules"].usage.rules, 2);
assert.equal(byId["cat-free"].can_delete, true);

await assert.rejects(service.deleteCategory("cat-used"), (error) => error.statusCode === 409 && error.code === "CATEGORY_IN_USE");
await assert.rejects(service.deleteCategory("cat-rules"), (error) => error.statusCode === 409);
assert.deepEqual(deleted, []);

const result = await service.deleteCategory("cat-free");
assert.equal(result.deleted, true);
assert.deepEqual(deleted, ["cat-free"]);

console.log("category usage tests passed");
