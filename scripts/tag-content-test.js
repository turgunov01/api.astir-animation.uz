import assert from "node:assert/strict";
import { createContentService } from "../app/services/contentService.js";

const movies = [
  { id: "m1", title: { ru: "Один" }, category_id: "c1", content_type: "movie", tag_ids: ["t1"] },
  { id: "m2", title: { ru: "Два" }, content_type: "series", is_premium: true, tag_ids: ["t1", "t2"] }
];
const tags = [{ id: "t1", name: "Дружба" }, { id: "t2", name: "Море" }, { id: "t3", name: "Пусто" }];
const links = [["m2", "t1"], ["m1", "t1"], ["m2", "t2"], ["gone", "t1"]];

const service = createContentService({
  contentCategories: { list: () => [], findById: (id) => (id === "c1" ? { id: "c1", title: { ru: "Мультфильмы" } } : null) },
  contentMovies: { list: () => movies, findById: (id) => movies.find((movie) => movie.id === id) || null },
  contentTags: { list: async () => tags, findById: async (id) => tags.find((tag) => tag.id === id) || null },
  contentMovieTags: {
    countByTag: async () => links.reduce((counts, [, tagId]) => counts.set(tagId, (counts.get(tagId) || 0) + 1), new Map()),
    listMovieIdsByTag: async (tagId) => links.filter(([, id]) => id === tagId).map(([movieId]) => movieId)
  }
});

const { tags: listed } = await service.listTags();
assert.deepEqual(listed.map((tag) => tag.content_count), [3, 1, 0]);

const result = await service.listTagContent("t1");
assert.deepEqual(result.items.map((item) => item.id), ["m2", "m1"], "missing movies are skipped, order kept");
assert.equal(result.total, 2);
assert.equal(result.items[1].category.title.ru, "Мультфильмы");
assert.equal(result.items[0].is_premium, true);
await assert.rejects(service.listTagContent("nope"), (error) => error.statusCode === 404);

console.log("tag content tests passed");
