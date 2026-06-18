import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

const dataFile = path.join(os.tmpdir(), `astir-smoke-${Date.now()}.json`);
process.env.DATA_FILE = dataFile;
process.env.CONTENT_STORAGE = "json";
process.env.JWT_SECRET = "astir-smoke-test-secret";
process.env.REQUIRE_AUTH = "true";
process.env.OTP_DEFAULT_CODE = "123456";
process.env.CLICK_PAYMENT_URL = "https://my.click.uz/services/pay";
process.env.CLICK_MERCHANT_ID = "123";
process.env.CLICK_MERCHANT_USER_ID = "456";
process.env.CLICK_SERVICE_ID = "789";
process.env.CLICK_SECRET_KEY = "click-smoke-secret";
process.env.CLICK_RETURN_URL = "https://astir.example/payments/return";

const { createServer } = await import("../app/server.js");
const { createTariffService } = await import("../app/services/tariffService.js");
const { createPostgresParentRepository } = await import("../app/repositories/postgresParentRepository.js");
const { store } = await import("../app/store/jsonStore.js");

const server = createServer();

function listen() {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function requestForm(baseUrl, pathName, formBody, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    ...options,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(options.headers || {})
    },
    body: new URLSearchParams(Object.entries(formBody).map(([key, value]) => [key, String(value)]))
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function requestWithStatus(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = await response.json();

  return {
    body,
    status: response.status
  };
}

const port = await listen();
const baseUrl = `http://127.0.0.1:${port}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function md5(value) {
  return createHash("md5").update(String(value)).digest("hex");
}

function localDateString(offsetDays = 0) {
  const date = new Date();

  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createMemoryTariffRepository() {
  const rows = [];

  return {
    list() {
      return rows;
    },

    findById(id) {
      return rows.find((row) => row.id === id) || null;
    },

    findDefault() {
      return rows.find((row) => row.is_default === true) || null;
    },

    create(attributes) {
      const now = new Date().toISOString();
      const row = {
        id: attributes.id || `tariff-${rows.length + 1}`,
        ...attributes,
        createdAt: now,
        updatedAt: now
      };

      rows.push(row);

      return row;
    },

    update(id, attributes) {
      const index = rows.findIndex((row) => row.id === id);

      if (index === -1) {
        return null;
      }

      rows[index] = { ...rows[index], ...attributes, updatedAt: new Date().toISOString() };

      return rows[index];
    },

    delete(id) {
      const index = rows.findIndex((row) => row.id === id);

      if (index === -1) {
        return null;
      }

      const [deleted] = rows.splice(index, 1);

      return deleted;
    }
  };
}

async function assertAsyncParentTariffDelete() {
  const parentUpdates = [];
  const tariffService = createTariffService({
    parents: {
      async list() {
        return [{ id: "async-parent-id", tariff: "async-custom" }];
      },
      async update(id, attributes) {
        parentUpdates.push({ id, attributes });
        return { id, ...attributes };
      }
    },
    subscriptions: {
      activeForParent() {
        return null;
      },
      serializeSubscription(subscription) {
        return subscription;
      },
      async listByTariffId() {
        return [];
      },
      async update() {
        throw new Error("subscription update should not be called");
      }
    },
    tariffs: createMemoryTariffRepository()
  });

  tariffService.createTariff({
    id: "async-custom",
    title: { en: "Async Custom", ru: "Async Custom", uz: "Async Custom" },
    description: { en: "Async Custom", ru: "Async Custom", uz: "Async Custom" },
    is_default: false,
    can_watch_premium: true,
    price_cents: 100000,
    currency: "UZS"
  });

  const deleted = await tariffService.deleteTariff("async-custom");

  assert.equal(deleted.deleted, true);
  assert.equal(deleted.affected.parentsUpdated, 1);
  assert.deepEqual(parentUpdates, [{
    id: "async-parent-id",
    attributes: { tariff: "free" }
  }]);
}

async function assertPostgresParentRepositoryPersistsTariff() {
  const storedParent = {
    id: "pg-parent-id",
    email: "pg-parent@example.com",
    password_hash: "password-hash",
    pin_hash: "pin-hash",
    name: "Postgres Parent",
    role: "parent",
    active: true,
    avatar_url: null,
    tariff: "free",
    created_at: "2026-06-12T00:00:00.000Z",
    updated_at: "2026-06-12T00:00:00.000Z"
  };
  const resultRow = () => ({
    id: storedParent.id,
    email: storedParent.email,
    passwordHash: storedParent.password_hash,
    pinHash: storedParent.pin_hash,
    name: storedParent.name,
    role: storedParent.role,
    active: storedParent.active,
    avatarUrl: storedParent.avatar_url,
    tariff: storedParent.tariff,
    createdAt: storedParent.created_at,
    updatedAt: storedParent.updated_at
  });
  const parents = createPostgresParentRepository({
    async query(sql, values = []) {
      if (sql.includes("SELECT")) {
        assert.match(sql, /\btariff\b/);
        assert.match(sql, /'super_admin'/);
        return { rows: [resultRow()] };
      }

      if (sql.includes("UPDATE users")) {
        assert.match(sql, /\btariff = \$/);
        assert.match(sql, /'super_admin'/);
        storedParent.tariff = values[0];
        return { rows: [resultRow()] };
      }

      throw new Error(`Unexpected SQL in fake Postgres parent repository: ${sql}`);
    }
  });

  const updated = await parents.update(storedParent.id, { tariff: "premium" });

  assert.equal(updated.tariff, "premium");
  assert.equal((await parents.findById(storedParent.id)).tariff, "premium");

  storedParent.role = "super_admin";
  assert.equal((await parents.findById(storedParent.id)).role, "super_admin");
}

try {
  await assertAsyncParentTariffDelete();
  await assertPostgresParentRepositoryPersistsTariff();

  const parentEmail = `smoke-${Date.now()}@example.com`;
  const unverifiedRegistration = await requestWithStatus(baseUrl, "/v1/auth/register", {
    method: "POST",
    body: {
      name: "Smoke Parent",
      email: parentEmail,
      password: "password123",
      pin: "1234"
    }
  });

  assert.equal(unverifiedRegistration.status, 401);
  assert.equal(unverifiedRegistration.body.error.code, "OTP_REQUIRED");

  const otpRequest = await request(baseUrl, "/v1/auth/otp/request", {
    method: "POST",
    body: {
      email: parentEmail
    }
  });

  assert.equal(otpRequest.email, parentEmail);
  assert.equal(otpRequest.emailExists, false);
  assert.equal(otpRequest.debugCode, "123456");

  const otpVerification = await request(baseUrl, "/v1/auth/otp/verify", {
    method: "POST",
    body: {
      email: parentEmail,
      code: "123456"
    }
  });

  assert.equal(otpVerification.verified, true);
  assert.equal(otpVerification.emailExists, false);

  const registration = await request(baseUrl, "/v1/auth/register", {
    method: "POST",
    body: {
      name: "Smoke Parent",
      email: parentEmail,
      password: "password123",
      pin: "1234"
    }
  });

  assert.equal(typeof registration.token, "string");
  assert.equal(registration.parent.tariff, "free");
  const parentToken = registration.token;
  const parentId = registration.parent.id;
  const superAdminToken = jwt.sign(
    {
      sub: "cc799db4-ebef-46b1-ac4e-c5b22c04daf5",
      user_id: "cc799db4-ebef-46b1-ac4e-c5b22c04daf5",
      kind: "user",
      role: "super_admin"
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const superAdminMe = await request(baseUrl, "/v1/auth/me", {
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(superAdminMe.parent.role, "super_admin");
  assert.equal(superAdminMe.parent.tariff, "premium");

  const pinVerification = await request(baseUrl, "/v1/auth/pin/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { pin: "1234" }
  });

  assert.equal(pinVerification.verified, true);

  const tariffs = await request(baseUrl, "/v1/tariffs");
  const premiumTariff = tariffs.tariffs.find((tariff) => tariff.code === "premium");

  assert.equal(tariffs.tariffs.some((tariff) => tariff.code === "free"), true);
  assert.equal(tariffs.tariffs.some((tariff) => tariff.code === "premium"), true);
  assert.equal(premiumTariff.price, "49000.00");
  assert.equal(premiumTariff.price_cents, 4900000);
  assert.equal(premiumTariff.currency, "UZS");

  const defaultTariff = await request(baseUrl, "/v1/tariffs/current", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(defaultTariff.tariff.code, "free");
  assert.equal(defaultTariff.access.can_watch_premium, false);

  const superAdminTariff = await request(baseUrl, "/v1/tariffs/current", {
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(superAdminTariff.tariff.code, "premium");
  assert.equal(superAdminTariff.access.can_watch_premium, true);

  const categoryResponse = await request(baseUrl, "/v1/content/categories/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      title: {
        en: `Smoke Category ${Date.now()}`,
        ru: `Тестовая категория ${Date.now()}`,
        uz: `Test kategoriyasi ${Date.now()}`
      },
      description: {
        en: "Category created by smoke test",
        ru: "Категория создана smoke test",
        uz: "Smoke test yaratgan kategoriya"
      },
      type: "cartoon",
      slug: `smoke-category-${Date.now()}`,
      active: true
    }
  });

  const categoryId = categoryResponse.category.id;
  assert.equal(typeof categoryId, "string");
  assert.equal(typeof categoryResponse.category.title.en, "string");
  assert.equal(typeof categoryResponse.category.title.ru, "string");
  assert.equal(typeof categoryResponse.category.title.uz, "string");
  assert.equal(categoryResponse.category.type, "cartoon");
  assert.equal(categoryResponse.category.active, true);
  assert.match(categoryResponse.category.slug, /^smoke-category-/);

  const listedCategories = await request(baseUrl, "/v1/content/categories", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    listedCategories.categories.some((category) => category.id === categoryId),
    true
  );

  const categoryById = await request(baseUrl, `/v1/content/categories/${categoryId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(categoryById.category.id, categoryId);

  const updatedCategory = await request(baseUrl, `/v1/content/categories/${categoryId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      title: {
        en: `Updated Smoke Category ${Date.now()}`,
        ru: `Обновленная тестовая категория ${Date.now()}`,
        uz: `Yangilangan test kategoriyasi ${Date.now()}`
      },
      type: "educational",
      slug: `updated-smoke-category-${Date.now()}`,
      active: false
    }
  });

  assert.equal(updatedCategory.category.id, categoryId);
  assert.equal(updatedCategory.category.type, "educational");
  assert.equal(updatedCategory.category.active, false);
  assert.match(updatedCategory.category.slug, /^updated-smoke-category-/);

  const tagResponse = await request(baseUrl, "/v1/content/tags/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      name: `Smoke Tag ${Date.now()}`,
      slug: `smoke-tag-${Date.now()}`,
      active: true
    }
  });

  const tagId = tagResponse.tag.id;
  assert.equal(typeof tagId, "string");
  assert.equal(tagResponse.tag.active, true);

  const movieResponse = await request(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      id: "client-selected-movie-id",
      title: {
        en: `Smoke Movie ${Date.now()}`,
        ru: `Smoke Movie RU ${Date.now()}`,
        uz: `Smoke Movie UZ ${Date.now()}`
      },
      description: {
        en: "Movie created by smoke test",
        ru: "Movie created by smoke test RU",
        uz: "Movie created by smoke test UZ"
      },
      series: [],
      category_id: categoryId,
      series_id: "legacy-series-id",
      year: 2026,
      age_rating: 6,
      duration_sec: 1234,
      published: true,
      tag_ids: [tagId],
      tags: [`Auto Smoke Tag ${Date.now()}`],
      is_premium: false
    }
  });

  const movieId = movieResponse.movie.id;
  assert.equal(typeof movieId, "string");
  assert.match(movieId, uuidPattern);
  assert.notEqual(movieId, "client-selected-movie-id");
  assert.equal(movieResponse.movie.is_premium, false);
  assert.equal(movieResponse.movie.category_id, categoryId);
  assert.equal(movieResponse.movie.series_id, "legacy-series-id");
  assert.equal(movieResponse.movie.year, 2026);
  assert.equal(movieResponse.movie.age_rating, 6);
  assert.equal(movieResponse.movie.duration_sec, 1234);
  assert.equal(movieResponse.movie.duration, 1234);
  assert.equal(movieResponse.movie.published, true);
  assert.equal(typeof movieResponse.movie.published_at, "string");
  assert.equal(movieResponse.movie.tag_ids.includes(tagId), true);
  assert.equal(
    movieResponse.movie.tags.some((tag) => tag.name.startsWith("Auto Smoke Tag")),
    true
  );

  const moviesByCategory = await request(baseUrl, `/v1/content/movies?category=${encodeURIComponent(updatedCategory.category.slug)}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    moviesByCategory.movies.some((movie) => movie.id === movieId),
    false
  );

  const moviesByTag = await request(baseUrl, `/v1/content/movies?tags=${encodeURIComponent(tagResponse.tag.slug)}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    moviesByTag.movies.some((movie) => movie.id === movieId),
    false
  );

  const moviesByCategoryAndTag = await request(
    baseUrl,
    `/v1/content/movies?category=${encodeURIComponent(categoryId)}&tags=${encodeURIComponent(tagId)}`,
    {
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(
    moviesByCategoryAndTag.movies.some((movie) => movie.id === movieId),
    false
  );

  const initialLikeStatus = await request(baseUrl, `/v1/content/${movieId}/like`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(initialLikeStatus.liked, false);
  assert.equal(initialLikeStatus.likes_count, 0);

  const likedMovie = await requestWithStatus(baseUrl, `/v1/content/${movieId}/like`, {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(likedMovie.status, 201);
  assert.equal(likedMovie.body.liked, true);
  assert.equal(likedMovie.body.likes_count, 1);

  const likedStatus = await request(baseUrl, `/v1/content/${movieId}/like`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(likedStatus.liked, true);
  assert.equal(likedStatus.likes_count, 1);

  const likedMovies = await request(baseUrl, "/v1/content/movies?liked=true", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    likedMovies.movies.some((movie) => movie.id === movieId && movie.is_liked === true),
    false
  );

  const likedContent = await request(baseUrl, "/v1/content/likes", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    likedContent.data.some((item) => item.id === movieId && item.is_liked === true),
    true
  );

  const unlikedMovie = await request(baseUrl, `/v1/content/${movieId}/like`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(unlikedMovie.liked, false);
  assert.equal(unlikedMovie.likes_count, 0);

  const premiumMovieResponse = await request(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      title: {
        en: `Premium Smoke Movie ${Date.now()}`,
        ru: `Premium Smoke Movie RU ${Date.now()}`,
        uz: `Premium Smoke Movie UZ ${Date.now()}`
      },
      description: {
        en: "Premium movie created by smoke test",
        ru: "Premium movie created by smoke test RU",
        uz: "Premium movie created by smoke test UZ"
      },
      series: [],
      is_premium: true
    }
  });

  const premiumMovieId = premiumMovieResponse.movie.id;
  assert.match(premiumMovieId, uuidPattern);
  assert.equal(premiumMovieResponse.movie.is_premium, true);

  const blockedPremiumMovie = await requestWithStatus(baseUrl, `/v1/content/movies/${premiumMovieId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(blockedPremiumMovie.status, 403);
  assert.equal(blockedPremiumMovie.body.error.code, "PREMIUM_TARIFF_REQUIRED");

  const superAdminPremiumMovie = await request(baseUrl, `/v1/content/movies/${premiumMovieId}`, {
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(superAdminPremiumMovie.movie.id, premiumMovieId);

  const superAdminMovies = await request(baseUrl, "/v1/content/movies", {
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(
    superAdminMovies.movies.some((movie) => movie.id === premiumMovieId),
    true
  );

  const movies = await request(baseUrl, "/v1/content/movies", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    movies.movies.some((movie) => movie.id === movieId),
    false
  );
  assert.equal(
    movies.movies.some((movie) => movie.id === premiumMovieId),
    false
  );

  const customTariffId = `smoke-tariff-${Date.now()}`;
  const customTariff = await request(baseUrl, "/v1/tariffs/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      id: customTariffId,
      title: {
        en: "Smoke Tariff",
        ru: "Smoke Tariff RU",
        uz: "Smoke Tariff UZ"
      },
      description: {
        en: "Created by smoke test",
        ru: "Created by smoke test RU",
        uz: "Created by smoke test UZ"
      },
      is_default: false,
      can_watch_premium: false,
      price: 99000,
      currency: "UZS"
    }
  });

  assert.equal(customTariff.tariff.id, customTariffId);
  assert.equal(customTariff.tariff.can_watch_premium, false);
  assert.equal(customTariff.tariff.price, "99000.00");
  assert.equal(customTariff.tariff.price_cents, 9900000);

  const customTariffById = await request(baseUrl, `/v1/tariffs/${customTariffId}`);

  assert.equal(customTariffById.tariff.id, customTariffId);

  const updatedCustomTariff = await request(baseUrl, `/v1/tariffs/${customTariffId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      can_watch_premium: true,
      price: 129000
    }
  });

  assert.equal(updatedCustomTariff.tariff.can_watch_premium, true);
  assert.equal(updatedCustomTariff.tariff.price, "129000.00");
  assert.equal(updatedCustomTariff.tariff.price_cents, 12900000);

  const customCurrentTariff = await request(baseUrl, "/v1/tariffs/current", {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { tariff: customTariffId }
  });

  assert.equal(customCurrentTariff.tariff.id, customTariffId);
  assert.equal(customCurrentTariff.access.can_watch_premium, true);

  const customTariffPremiumMovie = await request(baseUrl, `/v1/content/movies/${premiumMovieId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(customTariffPremiumMovie.movie.id, premiumMovieId);

  const usedTariffDelete = await requestWithStatus(baseUrl, `/v1/tariffs/${customTariffId}?hard=false`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(usedTariffDelete.status, 200);
  assert.equal(usedTariffDelete.body.deleted, true);
  assert.equal(usedTariffDelete.body.affected.subscriptionsUpdated, 0);
  assert.equal(usedTariffDelete.body.affected.parentsUpdated, 1);

  const freeTariff = await request(baseUrl, "/v1/tariffs/current", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(freeTariff.tariff.code, "free");
  assert.equal(freeTariff.access.can_watch_premium, false);

  const hardDeleteTariffId = `hard-delete-tariff-${Date.now()}`;
  await request(baseUrl, "/v1/tariffs/create", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      id: hardDeleteTariffId,
      title: {
        en: "Hard Delete Tariff",
        ru: "Hard Delete Tariff RU",
        uz: "Hard Delete Tariff UZ"
      },
      description: {
        en: "Hard delete tariff",
        ru: "Hard delete tariff RU",
        uz: "Hard delete tariff UZ"
      },
      can_watch_premium: true,
      price: 1000
    }
  });

  await request(baseUrl, "/v1/tariffs/current", {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { tariff: hardDeleteTariffId }
  });

  const hardDeletedTariff = await request(baseUrl, `/v1/tariffs/${hardDeleteTariffId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(hardDeletedTariff.deleted, true);
  assert.equal(hardDeletedTariff.hard_deleted, true);
  assert.equal(hardDeletedTariff.mode, "hard");
  assert.equal(hardDeletedTariff.affected.parentsLinked, 1);
  assert.equal(hardDeletedTariff.affected.parentsUpdated, 0);

  const afterHardDeleteTariffs = await request(baseUrl, "/v1/tariffs");

  assert.equal(
    afterHardDeleteTariffs.tariffs.some((tariff) => tariff.id === hardDeleteTariffId),
    false
  );

  const clickAmount = "49000.00";
  const mismatchedClickCheckout = await requestWithStatus(baseUrl, "/v1/billing/click/checkout", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      tariff_id: "premium",
      amount: 1
    }
  });

  assert.equal(mismatchedClickCheckout.status, 400);
  assert.equal(mismatchedClickCheckout.body.error.code, "CLICK_AMOUNT_MISMATCH");

  const clickCheckout = await request(baseUrl, "/v1/billing/click/checkout", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      tariff_id: "premium",
      return_url: "https://app.example/payments/return",
      card_type: "uzcard"
    }
  });
  const clickPaymentUrl = new URL(clickCheckout.payment_url);

  assert.equal(clickCheckout.transaction.status, "pending");
  assert.equal(clickCheckout.transaction.provider, "click");
  assert.equal(clickCheckout.transaction.amount, clickAmount);
  assert.equal(clickPaymentUrl.searchParams.get("service_id"), process.env.CLICK_SERVICE_ID);
  assert.equal(clickPaymentUrl.searchParams.get("merchant_id"), process.env.CLICK_MERCHANT_ID);
  assert.equal(clickPaymentUrl.searchParams.get("merchant_user_id"), process.env.CLICK_MERCHANT_USER_ID);
  assert.equal(clickPaymentUrl.searchParams.get("amount"), clickAmount);
  assert.equal(clickPaymentUrl.searchParams.get("transaction_param"), clickCheckout.transaction.id);
  assert.equal(clickPaymentUrl.searchParams.get("return_url"), "https://app.example/payments/return");

  const clickTransId = "987654321";
  const clickPaydocId = "555333";
  const clickPrepareSignTime = "2026-06-09 12:00:00";
  const clickPrepareBody = {
    click_trans_id: clickTransId,
    service_id: process.env.CLICK_SERVICE_ID,
    click_paydoc_id: clickPaydocId,
    merchant_trans_id: clickCheckout.transaction.id,
    amount: clickAmount,
    action: 0,
    sign_time: clickPrepareSignTime
  };
  clickPrepareBody.sign_string = md5(
    `${clickPrepareBody.click_trans_id}`
    + `${clickPrepareBody.service_id}`
    + `${process.env.CLICK_SECRET_KEY}`
    + `${clickPrepareBody.merchant_trans_id}`
    + `${clickPrepareBody.amount}`
    + `${clickPrepareBody.action}`
    + `${clickPrepareBody.sign_time}`
  );

  const clickPrepare = await requestForm(baseUrl, "/v1/billing/click/prepare", clickPrepareBody);

  assert.equal(clickPrepare.error, 0);
  assert.equal(clickPrepare.merchant_trans_id, clickCheckout.transaction.id);
  assert.ok(clickPrepare.merchant_prepare_id);

  const clickCompleteSignTime = "2026-06-09 12:01:00";
  const clickCompleteBody = {
    click_trans_id: clickTransId,
    service_id: process.env.CLICK_SERVICE_ID,
    click_paydoc_id: clickPaydocId,
    merchant_trans_id: clickCheckout.transaction.id,
    merchant_prepare_id: clickPrepare.merchant_prepare_id,
    amount: clickAmount,
    action: 1,
    error: 0,
    sign_time: clickCompleteSignTime
  };
  clickCompleteBody.sign_string = md5(
    `${clickCompleteBody.click_trans_id}`
    + `${clickCompleteBody.service_id}`
    + `${process.env.CLICK_SECRET_KEY}`
    + `${clickCompleteBody.merchant_trans_id}`
    + `${clickCompleteBody.merchant_prepare_id}`
    + `${clickCompleteBody.amount}`
    + `${clickCompleteBody.action}`
    + `${clickCompleteBody.sign_time}`
  );

  const clickComplete = await requestForm(baseUrl, "/v1/billing/click/complete", clickCompleteBody);

  assert.equal(clickComplete.error, 0);
  assert.equal(clickComplete.subscription.provider, "click");
  assert.equal(clickComplete.subscription.tariffId, "premium");
  assert.equal(clickComplete.transaction.status, "succeeded");
  assert.ok(clickComplete.merchant_confirm_id);

  const clickTransaction = await request(baseUrl, `/v1/billing/click/transactions/${clickCheckout.transaction.id}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(clickTransaction.transaction.status, "succeeded");
  assert.equal(clickTransaction.transaction.subscription_id, clickComplete.subscription.id);

  const clickCurrentSubscription = await request(baseUrl, "/v1/billing/subscription/current", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(clickCurrentSubscription.subscription.id, clickComplete.subscription.id);

  const appleSubscriptionId = `apple-sub-${Date.now()}`;
  const applePurchase = await request(baseUrl, "/v1/billing/apple/verify", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      tariff_id: "premium",
      receipt: "local-apple-receipt",
      provider_subscription_id: appleSubscriptionId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  });

  assert.equal(applePurchase.subscription.provider, "apple");
  assert.equal(applePurchase.subscription.providerSubscriptionId, appleSubscriptionId);
  assert.equal(applePurchase.subscription.status, "active");
  assert.equal(applePurchase.tariff.id, "premium");
  assert.equal(applePurchase.access.can_watch_premium, true);

  const currentSubscription = await request(baseUrl, "/v1/billing/subscription/current", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(currentSubscription.subscription.id, applePurchase.subscription.id);

  const billingTariff = await request(baseUrl, "/v1/tariffs/current", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(billingTariff.tariff.id, "premium");
  assert.equal(billingTariff.subscription.id, applePurchase.subscription.id);
  assert.equal(billingTariff.access.can_watch_premium, true);

  const appleWebhook = await request(baseUrl, "/v1/billing/webhook/apple", {
    method: "POST",
    body: {
      provider_subscription_id: appleSubscriptionId,
      status: "active",
      expires_at: applePurchase.subscription.expiresAt
    }
  });

  assert.equal(appleWebhook.accepted, true);
  assert.equal(appleWebhook.subscription.id, applePurchase.subscription.id);

  const premiumMovie = await request(baseUrl, `/v1/content/movies/${premiumMovieId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(premiumMovie.movie.id, premiumMovieId);

  const premiumMovies = await request(baseUrl, "/v1/content/movies", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    premiumMovies.movies.some((movie) => movie.id === premiumMovieId),
    true
  );

  const singleMovie = await request(baseUrl, `/v1/content/movies/${movieId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(singleMovie.movie.id, movieId);
  assert.equal(singleMovie.movie.category_id, categoryId);
  assert.equal(singleMovie.movie.series_id, "legacy-series-id");
  assert.equal(singleMovie.movie.year, 2026);
  assert.equal(singleMovie.movie.age_rating, 6);
  assert.equal(singleMovie.movie.duration_sec, 1234);
  assert.equal(singleMovie.movie.published, true);
  assert.equal(singleMovie.movie.playback.status, "missing_source");

  const updatedMovie = await request(baseUrl, `/v1/content/movies/${movieId}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      title: {
        en: `Updated Smoke Movie ${Date.now()}`,
        ru: `Updated Smoke Movie RU ${Date.now()}`,
        uz: `Updated Smoke Movie UZ ${Date.now()}`
      },
      is_premium: false,
      category_id: null,
      series_id: null,
      year: 2027,
      age_rating: 12,
      duration_sec: 2345,
      published: false,
      tags: [`Updated Auto Smoke Tag ${Date.now()}`]
    }
  });

  assert.equal(updatedMovie.movie.id, movieId);
  assert.equal(updatedMovie.movie.is_premium, false);
  assert.equal(updatedMovie.movie.category_id, null);
  assert.equal(updatedMovie.movie.series_id, null);
  assert.equal(updatedMovie.movie.year, 2027);
  assert.equal(updatedMovie.movie.age_rating, 12);
  assert.equal(updatedMovie.movie.duration_sec, 2345);
  assert.equal(updatedMovie.movie.duration, 2345);
  assert.equal(updatedMovie.movie.published, false);
  assert.equal(updatedMovie.movie.published_at, null);
  assert.equal(updatedMovie.movie.tags.some((tag) => tag.name.startsWith("Updated Auto Smoke Tag")), true);

  const replacedMovieTags = await request(baseUrl, `/v1/content/movies/${movieId}/tags`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      tag_ids: [tagId]
    }
  });

  assert.equal(replacedMovieTags.movie.id, movieId);
  assert.deepEqual(replacedMovieTags.movie.tag_ids, [tagId]);

  const parentWatchStarted = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { contentId: movieId }
  });

  await request(baseUrl, `/v1/watch-sessions/${parentWatchStarted.watchSession.id}/progress`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      watchedSec: 15,
      positionSec: 15
    }
  });

  await request(baseUrl, `/v1/watch-sessions/${parentWatchStarted.watchSession.id}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  const parentHistory = await request(baseUrl, "/v1/watch-sessions/history", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(parentHistory.history.some((item) => item.contentId === movieId), true);

  const seriesResponse = await request(baseUrl, `/v1/content/movies/${movieId}/series`, {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      id: "client-selected-series-id",
      title: {
        en: `Smoke Series ${Date.now()}`,
        ru: `Smoke Series RU ${Date.now()}`,
        uz: `Smoke Series UZ ${Date.now()}`
      },
      description: {
        en: "Series item created by smoke test",
        ru: "Series item created by smoke test RU",
        uz: "Series item created by smoke test UZ"
      },
      is_premium: false
    }
  });

  const seriesItemId = seriesResponse.series_item.id;
  assert.equal(typeof seriesItemId, "string");
  assert.match(seriesItemId, uuidPattern);
  assert.notEqual(seriesItemId, "client-selected-series-id");

  const series = await request(baseUrl, `/v1/content/movies/${movieId}/series`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    series.series.some((movie) => movie.id === seriesItemId),
    true
  );

  const moviesWithoutSeriesItems = await request(baseUrl, "/v1/content/movies", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    moviesWithoutSeriesItems.movies.some((movie) => movie.id === seriesItemId),
    false
  );

  const createdFaq = await request(baseUrl, "/v1/faqs", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      question: {
        en: "How do I watch offline?",
        ru: "How do I watch offline RU",
        uz: "How do I watch offline UZ"
      },
      answer: {
        en: "Download from the mobile app.",
        ru: "Download from the mobile app RU",
        uz: "Download from the mobile app UZ"
      },
      sortOrder: 1
    }
  });

  assert.equal(typeof createdFaq.faq.id, "string");

  const faqs = await request(baseUrl, "/v1/faqs");
  assert.equal(faqs.faqs.some((faq) => faq.id === createdFaq.faq.id), true);

  const createdRecommendation = await request(baseUrl, "/v1/recommendations", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      type: "content",
      referenceId: movieId,
      sortOrder: 1
    }
  });

  assert.equal(createdRecommendation.recommendation.referenceId, movieId);

  const recommendations = await request(baseUrl, "/v1/recommendations", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(recommendations.recommendations.some((item) => item.referenceId === movieId), true);

  const childResponse = await request(baseUrl, "/v1/children", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      name: "Smoke Child",
      birthYear: 2018
    }
  });

  const childId = childResponse.child.id;
  assert.equal(typeof childId, "string");

  await request(baseUrl, `/v1/children/${childId}/limits`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      dailyMinutes: 60,
      allowedFrom: "00:00",
      allowedTo: "23:59",
      allowedDays: [1, 2, 3, 4, 5, 6, 7]
    }
  });

  const pairing = await request(baseUrl, "/v1/pairing/sessions", {
    method: "POST",
    body: {
      deviceName: "Smoke TV",
      platform: "tv"
    }
  });

  const pairingSession = pairing.pairingSession;
  assert.equal(typeof pairingSession.setupToken, "string");

  await request(baseUrl, `/v1/pairing/sessions/${pairingSession.id}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { childId }
  });

  const paired = await request(baseUrl, `/v1/pairing/sessions/${pairingSession.id}`, {
    headers: { "x-setup-token": pairingSession.setupToken }
  });

  const deviceToken = paired.pairingSession.deviceToken;
  assert.equal(typeof deviceToken, "string");

  const config = await request(baseUrl, "/v1/device/config", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(config.child.id, childId);
  const childDevices = await request(baseUrl, `/v1/children/${childId}/devices`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(childDevices.devices.some((device) => device.id === config.device.id), true);

  const revokePairing = await request(baseUrl, "/v1/pairing/sessions", {
    method: "POST",
    body: {
      deviceName: "Smoke Revoked TV",
      platform: "tv"
    }
  });

  await request(baseUrl, `/v1/pairing/sessions/${revokePairing.pairingSession.id}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: { childId }
  });

  const revokedPairing = await request(baseUrl, `/v1/pairing/sessions/${revokePairing.pairingSession.id}`, {
    headers: { "x-setup-token": revokePairing.pairingSession.setupToken }
  });
  const revokedDeviceId = revokedPairing.pairingSession.deviceId;
  const revokedDeviceToken = revokedPairing.pairingSession.deviceToken;

  const revokedDevice = await request(baseUrl, `/v1/children/${childId}/devices/${revokedDeviceId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(revokedDevice.revoked, true);
  assert.equal(revokedDevice.device.id, revokedDeviceId);
  assert.equal(typeof revokedDevice.device.revokedAt, "string");

  const childDevicesAfterRevoke = await request(baseUrl, `/v1/children/${childId}/devices`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(childDevicesAfterRevoke.devices.some((device) => device.id === revokedDeviceId), false);
  assert.equal(childDevicesAfterRevoke.devices.some((device) => device.id === config.device.id), true);

  const revokedDeviceConfig = await requestWithStatus(baseUrl, "/v1/device/config", {
    headers: { authorization: `Bearer ${revokedDeviceToken}` }
  });

  assert.equal(revokedDeviceConfig.status, 401);
  assert.deepEqual(config.limit.allowedDates, []);

  const tomorrowOnlyLimit = await request(baseUrl, `/v1/children/${childId}/limits`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      dailyMinutes: 60,
      allowedFrom: "00:00",
      allowedTo: "23:59",
      allowedDays: [1, 2, 3, 4, 5, 6, 7],
      allowedDates: [localDateString(1)]
    }
  });

  assert.deepEqual(tomorrowOnlyLimit.limit.allowedDates, [localDateString(1)]);

  const dateBlockedWatch = await requestWithStatus(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: movieId }
  });

  assert.equal(dateBlockedWatch.status, 403);
  assert.equal(dateBlockedWatch.body.code, "WATCH_DATE_BLOCKED");

  const restoredWeeklyLimit = await request(baseUrl, `/v1/children/${childId}/limits`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      dailyMinutes: 60,
      allowedFrom: "00:00",
      allowedTo: "23:59",
      allowedDays: [1, 2, 3, 4, 5, 6, 7]
    }
  });

  assert.deepEqual(restoredWeeklyLimit.limit.allowedDates, []);

  await request(baseUrl, `/v1/children/${childId}/limits`, {
    method: "PUT",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      dailyMinutes: 1,
      allowedFrom: "00:00",
      allowedTo: "23:59",
      allowedDays: [1, 2, 3, 4, 5, 6, 7]
    }
  });

  store.insert("watchSessions", {
    actorType: "device",
    parentId,
    childId,
    deviceId: config.device.id,
    contentId: movieId,
    contentType: "movie",
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 61,
    positionSeconds: 61,
    watchedSeconds: 61
  });

  const extendedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  store.update("children", childId, {
    extendeduntil: extendedUntil
  });

  const extendedDeviceWatch = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: movieId }
  });

  assert.equal(extendedDeviceWatch.watchSession.childId, childId);
  assert.equal(extendedDeviceWatch.watchSession.remainingSecondsToday > 0, true);

  await request(baseUrl, `/v1/watch-sessions/${extendedDeviceWatch.watchSession.id}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  const notificationToken = await request(baseUrl, "/v1/notifications/device-token", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: {
      token: "smoke-fcm-token",
      platform: "ios"
    }
  });

  assert.equal(notificationToken.token.parentId, config.limit.parentId);

  const pushNotification = await request(baseUrl, "/v1/notifications/push", {
    method: "POST",
    headers: { authorization: `Bearer ${parentToken}` },
    body: {
      title: "Smoke push",
      body: "Smoke notification",
      childId
    }
  });

  assert.equal(pushNotification.notification.channel, "push");

  const deviceTariff = await request(baseUrl, "/v1/tariffs/current", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceTariff.tariff.code, "premium");
  assert.equal(deviceTariff.access.can_watch_premium, true);

  const parentBlacklistedSeriesItem = await requestWithStatus(
    baseUrl,
    `/v1/content/${seriesItemId}/blacklist?childId=${encodeURIComponent(childId)}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(parentBlacklistedSeriesItem.status, 201);
  assert.equal(parentBlacklistedSeriesItem.body.blacklisted, true);
  assert.equal(parentBlacklistedSeriesItem.body.child_id, childId);

  const parentSeriesWithoutChildFilter = await request(baseUrl, `/v1/content/movies/${movieId}/series`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    parentSeriesWithoutChildFilter.series.some((movie) => movie.id === seriesItemId),
    true
  );

  const parentSeriesWithChildFilter = await request(
    baseUrl,
    `/v1/content/movies/${movieId}/series?childId=${encodeURIComponent(childId)}`,
    {
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(
    parentSeriesWithChildFilter.series.some((movie) => movie.id === seriesItemId),
    false
  );

  const superAdminSeriesWithChildFilter = await request(
    baseUrl,
    `/v1/content/movies/${movieId}/series?childId=${encodeURIComponent(childId)}`,
    {
      headers: { authorization: `Bearer ${superAdminToken}` }
    }
  );

  assert.equal(
    superAdminSeriesWithChildFilter.series.some((movie) => movie.id === seriesItemId),
    true
  );

  const deviceSeriesWithBlacklist = await request(baseUrl, `/v1/content/movies/${movieId}/series`, {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(
    deviceSeriesWithBlacklist.series.some((movie) => movie.id === seriesItemId),
    false
  );

  await request(
    baseUrl,
    `/v1/content/${seriesItemId}/blacklist?childId=${encodeURIComponent(childId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  const parentBlacklistedMovie = await requestWithStatus(
    baseUrl,
    `/v1/content/${movieId}/blacklist?childId=${encodeURIComponent(childId)}`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(parentBlacklistedMovie.status, 201);
  assert.equal(parentBlacklistedMovie.body.blacklisted, true);
  assert.equal(parentBlacklistedMovie.body.child_id, childId);

  const childBlacklist = await request(baseUrl, `/v1/children/${childId}/blacklist?lang=ru`, {
    headers: {
      authorization: `Bearer ${parentToken}`,
      "accept-language": "ru"
    }
  });
  const childBlacklistMovie = childBlacklist.blacklist.find((item) => item.content_id === movieId);

  assert.ok(childBlacklistMovie);
  assert.equal(childBlacklistMovie.title_ru, updatedMovie.movie.title.ru);
  assert.equal(Object.hasOwn(childBlacklistMovie, "poster"), true);
  assert.equal(Object.hasOwn(childBlacklistMovie, "views"), true);
  assert.equal(Object.hasOwn(childBlacklistMovie, "likes"), true);
  assert.equal(childBlacklistMovie.views, childBlacklistMovie.views_count);
  assert.equal(childBlacklistMovie.likes, childBlacklistMovie.likes_count);

  const staleBlacklistContentId = randomUUID();
  store.insert("childContentBlacklist", {
    parentId,
    childId,
    contentId: staleBlacklistContentId
  });

  const staleUnblacklistedMovie = await request(baseUrl, `/v1/content/${staleBlacklistContentId}/blacklist?childId=${encodeURIComponent(childId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${superAdminToken}` }
  });

  assert.equal(staleUnblacklistedMovie.blacklisted, false);
  assert.equal(staleUnblacklistedMovie.deleted, true);
  assert.equal(staleUnblacklistedMovie.content_id, staleBlacklistContentId);
  assert.equal(
    store.findOne("childContentBlacklist", (item) => item.childId === childId && item.contentId === staleBlacklistContentId),
    null
  );

  const parentMoviesWithoutChildFilter = await request(baseUrl, "/v1/content/movies?limit=100", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(
    parentMoviesWithoutChildFilter.movies.some((movie) => movie.id === movieId),
    true
  );

  const parentMoviesWithChildFilter = await request(
    baseUrl,
    `/v1/content/movies?limit=100&childId=${encodeURIComponent(childId)}`,
    {
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(
    parentMoviesWithChildFilter.movies.some((movie) => movie.id === movieId),
    false
  );

  const deviceMoviesWithBlacklist = await request(baseUrl, "/v1/content/movies?limit=100", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(
    deviceMoviesWithBlacklist.movies.some((movie) => movie.id === movieId),
    false
  );

  const deviceBlacklistStatus = await request(baseUrl, `/v1/content/${movieId}/blacklist`, {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceBlacklistStatus.blacklisted, true);
  assert.equal(deviceBlacklistStatus.child_id, childId);

  const deviceUnblacklistedMovie = await request(baseUrl, `/v1/content/${movieId}/blacklist`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceUnblacklistedMovie.blacklisted, false);
  assert.equal(deviceUnblacklistedMovie.child_id, childId);

  const parentBlacklistStatus = await request(
    baseUrl,
    `/v1/content/${movieId}/blacklist?childId=${encodeURIComponent(childId)}`,
    {
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(parentBlacklistStatus.blacklisted, false);
  assert.equal(parentBlacklistStatus.child_id, childId);

  const deviceBlacklistedMovie = await requestWithStatus(baseUrl, `/v1/content/${movieId}/blacklist`, {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceBlacklistedMovie.status, 201);
  assert.equal(deviceBlacklistedMovie.body.blacklisted, true);
  assert.equal(deviceBlacklistedMovie.body.child_id, childId);

  const parentUnblacklistedMovie = await request(
    baseUrl,
    `/v1/content/${movieId}/blacklist?childId=${encodeURIComponent(childId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${parentToken}` }
    }
  );

  assert.equal(parentUnblacklistedMovie.blacklisted, false);
  assert.equal(parentUnblacklistedMovie.child_id, childId);

  const deviceInitialLikeStatus = await request(baseUrl, `/v1/content/${movieId}/like`, {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceInitialLikeStatus.liked, false);
  assert.equal(deviceInitialLikeStatus.likes_count, 0);

  const deviceLikedMovie = await requestWithStatus(baseUrl, `/v1/content/${movieId}/like`, {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceLikedMovie.status, 201);
  assert.equal(deviceLikedMovie.body.liked, true);
  assert.equal(deviceLikedMovie.body.likes_count, 1);

  const parentDeviceLikeStatus = await request(baseUrl, `/v1/content/${movieId}/like`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(parentDeviceLikeStatus.liked, true);
  assert.equal(parentDeviceLikeStatus.likes_count, 1);

  const deviceUnlikedMovie = await request(baseUrl, `/v1/content/${movieId}/like`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceUnlikedMovie.liked, false);
  assert.equal(deviceUnlikedMovie.likes_count, 0);

  const legacyDeviceId = `legacy-device-${Date.now()}`;
  const legacyDeviceToken = jwt.sign(
    {
      sub: legacyDeviceId,
      kind: "child_device",
      device_id: legacyDeviceId,
      child_id: childId,
      parent_id: parentId
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const legacyDeviceLikeStatus = await request(baseUrl, `/v1/content/${movieId}/like`, {
    headers: { authorization: `Bearer ${legacyDeviceToken}` }
  });

  assert.equal(legacyDeviceLikeStatus.liked, false);
  assert.equal(legacyDeviceLikeStatus.likes_count, 0);

  const legacyDeviceLikedMovie = await requestWithStatus(baseUrl, `/v1/content/${movieId}/like`, {
    method: "POST",
    headers: { authorization: `Bearer ${legacyDeviceToken}` }
  });

  assert.equal(legacyDeviceLikedMovie.status, 201);
  assert.equal(legacyDeviceLikedMovie.body.liked, true);
  assert.equal(legacyDeviceLikedMovie.body.likes_count, 1);

  const legacyDeviceUnlikedMovie = await request(baseUrl, `/v1/content/${movieId}/like`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${legacyDeviceToken}` }
  });

  assert.equal(legacyDeviceUnlikedMovie.liked, false);
  assert.equal(legacyDeviceUnlikedMovie.likes_count, 0);

  const content = await request(baseUrl, "/v1/content", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(content.content.length > 0, true);
  assert.equal(typeof content.content[0].title.en, "string");
  assert.equal(typeof content.content[0].title.ru, "string");
  assert.equal(typeof content.content[0].title.uz, "string");

  const deviceCategories = await request(baseUrl, "/v1/content/categories", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(
    deviceCategories.categories.some((category) => category.id === categoryId),
    true
  );

  const started = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: content.content[0].id }
  });

  const watchSessionId = started.watchSession.id;
  assert.equal(typeof watchSessionId, "string");

  const duplicateStarted = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: content.content[0].id }
  });

  assert.equal(duplicateStarted.watchSession.id, watchSessionId);

  const stopped = await request(baseUrl, `/v1/watch-sessions/${watchSessionId}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(stopped.watchSession.id, watchSessionId);

  const danglingStarted = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: content.content[0].id }
  });

  const seriesWatchStarted = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: seriesItemId }
  });
  const seriesWatchSessionId = seriesWatchStarted.watchSession.id;
  assert.notEqual(seriesWatchSessionId, danglingStarted.watchSession.id);

  const seriesProgress = await request(baseUrl, `/v1/watch-sessions/${seriesWatchSessionId}/progress`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: {
      watchedSec: 12,
      positionSec: 12
    }
  });

  assert.equal(seriesProgress.watchSession.countedAsView, true);
  assert.equal(seriesProgress.watchSession.watchedSeconds, 12);

  const seriesWatchStopped = await request(baseUrl, `/v1/watch-sessions/${seriesWatchSessionId}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(seriesWatchStopped.watchSession.id, seriesWatchSessionId);
  assert.equal(seriesWatchStopped.watchSession.durationSeconds, 12);

  const deviceProgress = await request(baseUrl, `/v1/watch-sessions/progress/${seriesItemId}`, {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceProgress.progress.positionSeconds, 12);

  const deviceHistory = await request(baseUrl, "/v1/watch-sessions/history", {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(deviceHistory.history.some((item) => item.contentId === seriesItemId), true);

  const resumedSeriesWatch = await request(baseUrl, "/v1/watch-sessions/start", {
    method: "POST",
    headers: { authorization: `Bearer ${deviceToken}` },
    body: { contentId: seriesItemId }
  });

  assert.equal(resumedSeriesWatch.watchSession.resumePositionSeconds, 12);

  await request(baseUrl, `/v1/watch-sessions/${resumedSeriesWatch.watchSession.id}/stop`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  const watchedSeriesItem = await request(baseUrl, `/v1/content/movies/${seriesItemId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(watchedSeriesItem.movie.views_count, 1);
  assert.equal(watchedSeriesItem.movie.watch_time_sec, 12);

  const watchedParentSeries = await request(baseUrl, `/v1/content/movies/${movieId}`, {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(watchedParentSeries.movie.series_views_count, 1);
  assert.equal(watchedParentSeries.movie.series_watch_time_sec, 12);

  const popularMovies = await request(baseUrl, "/v1/content/movies/popular", {
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(popularMovies.popular.some((movie) => movie.id === movieId), true);

  const offlineSeriesItem = await request(baseUrl, `/v1/content/movies/${seriesItemId}/offline`, {
    headers: { authorization: `Bearer ${deviceToken}` }
  });

  assert.equal(offlineSeriesItem.offline.contentId, seriesItemId);
  assert.equal(offlineSeriesItem.offline.views_count, 1);

  const deletedCategory = await request(baseUrl, `/v1/content/categories/${categoryId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(deletedCategory.deleted, true);

  const deletedPremiumMovie = await request(baseUrl, `/v1/content/movies/${premiumMovieId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(deletedPremiumMovie.deleted, true);

  const deletedMovie = await request(baseUrl, `/v1/content/movies/${movieId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${parentToken}` }
  });

  assert.equal(deletedMovie.deleted, true);
  console.log("Smoke test passed");
} finally {
  await close();
  fs.rmSync(dataFile, { force: true });
}
