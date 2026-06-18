import assert from "node:assert/strict";
import { createPostgresContentSearchRepository } from "../app/repositories/postgresContentSearchRepository.js";
import { createRepositories } from "../app/repositories/index.js";
import { createContentService } from "../app/services/contentService.js";

const calls = [];
const db = {
  async many(sql, params) {
    calls.push({ sql, params });

    return [
      {
        id: "10000000-0000-4000-8000-000000000001",
        title: { en: "Search Movie", ru: "Поисковый фильм", uz: "Qidiruv filmi" },
        poster_path: "content/movie.jpg",
        poster_url: "",
        status: "ready",
        age_rating: 12,
        duration_sec: 5400,
        item_type: "movie"
      },
      {
        id: "20000000-0000-4000-8000-000000000002",
        title: {
          en: "Solo Leveling",
          ru: "Поднятие уровня в одиночку",
          uz: "Yolg'iz daraja ko'tarish"
        },
        poster_path: "series/solo.jpg",
        poster_url: "",
        status: null,
        age_rating: 16,
        duration_sec: 7200,
        item_type: "series"
      }
    ];
  }
};

const repository = createPostgresContentSearchRepository(db);
const repositories = createRepositories({}, {
  contentDb: null,
  searchDb: db
});

assert.ok(repositories.contentSearch);

const results = await repository.search("Поднятие", {
  includeUnpublished: true
});

assert.equal(calls.length, 1);
assert.match(calls[0].sql, /FROM content c/);
assert.match(calls[0].sql, /FROM series s/);
assert.match(calls[0].sql, /c\.series_id = s\.id/);
assert.deepEqual(calls[0].params, ["Поднятие", true, null, null, "%поднятие%"]);

assert.equal(results[0].resultType, "movies");
assert.equal(results[0].targetType, "content");
assert.equal(results[0].movie.poster_url, "/api/v1/content/10000000-0000-4000-8000-000000000001/poster");

assert.equal(results[1].resultType, "series");
assert.equal(results[1].targetType, "series");
assert.equal(results[1].movie.title.ru, "Поднятие уровня в одиночку");
assert.equal(results[1].movie.poster_url, "/api/v1/series/20000000-0000-4000-8000-000000000002/poster");
assert.equal(results[1].movie.duration_sec, 7200);

calls.splice(0, calls.length);
const filteredResults = await repository.filter({
  categoryIds: ["anime"],
  tagIds: ["adventure"],
  includeUnpublished: false,
  ownerId: "30000000-0000-4000-8000-000000000003",
  childId: "40000000-0000-4000-8000-000000000004"
});

assert.equal(calls.length, 1);
assert.match(calls[0].sql, /FROM content c/);
assert.match(calls[0].sql, /FROM series s/);
assert.match(calls[0].sql, /content_tags ct/);
assert.match(calls[0].sql, /child_permissions p/);
assert.deepEqual(calls[0].params, [
  false,
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
  ["anime"],
  ["adventure"]
]);
assert.equal(filteredResults[1].resultType, "series");
assert.equal(filteredResults[1].targetType, "series");

let filterOptions = null;
const contentService = createContentService({
  childService: {
    isAnyContentBlacklisted() {
      return false;
    }
  },
  contentCategories: {
    list() {
      return [];
    }
  },
  contentLikes: {},
  contentMovieTags: {
    async listByMovieId() {
      return [];
    }
  },
  contentMovies: {
    list() {
      return [];
    },
    findById() {
      return null;
    }
  },
  contentSearch: {
    async search() {
      return [results[1]];
    },
    async filter(options) {
      filterOptions = options;
      return [results[1]];
    }
  },
  contentTags: {},
  tariffService: {
    canWatchMovie() {
      return true;
    }
  },
  transcoder: {}
});
const response = await contentService.searchContent({
  type: "parent",
  parent: {
    id: "30000000-0000-4000-8000-000000000003",
    role: "parent"
  }
}, {
  q: "Поднятие"
});

assert.equal(response.data.length, 1);
assert.equal(response.data[0].item_type, "series");
assert.equal(response.data[0].target_type, "series");
assert.equal(response.data[0].target_id, results[1].movie.id);
assert.equal(response.data[0].type, "series");
assert.equal(response.data[0].title.ru, "Поднятие уровня в одиночку");

const filterResponse = await contentService.filterContent({
  type: "parent",
  parent: {
    id: "30000000-0000-4000-8000-000000000003",
    role: "parent"
  }
}, {
  categoryIds: ["anime"],
  tagIds: ["adventure"]
});

assert.deepEqual(filterOptions, {
  categoryIds: ["anime"],
  tagIds: ["adventure"],
  includeUnpublished: false,
  ownerId: "30000000-0000-4000-8000-000000000003",
  childId: null
});
assert.equal(filterResponse.data.length, 1);
assert.equal(filterResponse.data[0].item_type, "series");
assert.equal(filterResponse.data[0].target_type, "series");
assert.equal(filterResponse.data[0].target_id, results[1].movie.id);
assert.equal(filterResponse.data[0].type, "series");

console.log("PostgreSQL movie and series search/filter test passed");
