import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataFile = path.join(os.tmpdir(), `astir-auth-toggle-${Date.now()}.json`);
process.env.DATA_FILE = dataFile;
process.env.CONTENT_STORAGE = "json";
process.env.JWT_SECRET = "astir-auth-toggle-secret";
process.env.REQUIRE_AUTH = "false";

const { createServer } = await import("../app/server.js");

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

  assert.notEqual(response.status, 401);

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

  assert.notEqual(response.status, 401);

  return {
    body,
    status: response.status
  };
}

const port = await listen();
const baseUrl = `http://127.0.0.1:${port}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

try {
  const me = await request(baseUrl, "/v1/auth/me");

  assert.equal(me.parent.email, "local-parent@astir.dev");
  assert.equal(me.parent.tariff, "free");

  const tariffs = await request(baseUrl, "/v1/tariffs");

  assert.equal(tariffs.tariffs.some((tariff) => tariff.code === "free"), true);
  assert.equal(tariffs.tariffs.some((tariff) => tariff.code === "premium"), true);

  const currentTariff = await request(baseUrl, "/v1/tariffs/current");

  assert.equal(currentTariff.tariff.code, "free");

  const updatedTariff = await request(baseUrl, "/v1/tariffs/current", {
    method: "PATCH",
    body: { tariff: "premium" }
  });

  assert.equal(updatedTariff.tariff.code, "premium");
  assert.equal(updatedTariff.access.can_watch_premium, true);

  const googlePurchase = await request(baseUrl, "/v1/billing/google/verify", {
    method: "POST",
    body: {
      tariff_id: "premium",
      purchase_token: `google-token-${Date.now()}`,
      product_id: "astir_premium_monthly",
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  });

  assert.equal(googlePurchase.subscription.provider, "google");
  assert.equal(googlePurchase.subscription.status, "active");

  const googleCamelCasePurchase = await request(baseUrl, "/v1/billing/google/verify", {
    method: "POST",
    body: {
      tariffId: "premium",
      purchaseToken: `google-camel-token-${Date.now()}`,
      productId: "astir_premium_monthly",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  });

  assert.equal(googleCamelCasePurchase.subscription.provider, "google");
  assert.equal(googleCamelCasePurchase.subscription.status, "active");

  const appleCamelCasePurchase = await request(baseUrl, "/v1/billing/apple/verify", {
    method: "POST",
    body: {
      tariffId: "premium",
      receiptData: `apple-camel-receipt-${Date.now()}`,
      providerSubscriptionId: `apple-camel-sub-${Date.now()}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  });

  assert.equal(appleCamelCasePurchase.subscription.provider, "apple");
  assert.equal(appleCamelCasePurchase.subscription.status, "active");

  const currentSubscription = await request(baseUrl, "/v1/billing/subscription/current");

  assert.equal(currentSubscription.subscription.id, appleCamelCasePurchase.subscription.id);

  const customTariffId = `auth-toggle-tariff-${Date.now()}`;
  const customTariff = await request(baseUrl, "/v1/tariffs/create", {
    method: "POST",
    body: {
      id: customTariffId,
      title: {
        en: "Auth Toggle Tariff",
        ru: "Auth Toggle Tariff RU",
        uz: "Auth Toggle Tariff UZ"
      },
      description: {
        en: "Created without auth headers",
        ru: "Created without auth headers RU",
        uz: "Created without auth headers UZ"
      },
      can_watch_premium: false
    }
  });

  assert.equal(customTariff.tariff.id, customTariffId);

  const tariffById = await request(baseUrl, `/v1/tariffs/${customTariffId}`);

  assert.equal(tariffById.tariff.id, customTariffId);

  const patchedTariff = await request(baseUrl, `/v1/tariffs/${customTariffId}`, {
    method: "PATCH",
    body: { can_watch_premium: true }
  });

  assert.equal(patchedTariff.tariff.can_watch_premium, true);

  const deletedTariff = await request(baseUrl, `/v1/tariffs/${customTariffId}`, {
    method: "DELETE"
  });

  assert.equal(deletedTariff.deleted, true);

  const child = await request(baseUrl, "/v1/children", {
    method: "POST",
    body: {
      name: "Auth Toggle Child",
      birthYear: 2018
    }
  });

  assert.equal(typeof child.child.id, "string");

  const category = await request(baseUrl, "/v1/content/categories/create", {
    method: "POST",
    body: {
      title: {
        en: "Auth Toggle Category",
        ru: "Категория без авторизации",
        uz: "Avtorizatsiyasiz kategoriya"
      },
      description: {
        en: "Created without auth headers",
        ru: "Создано без auth headers",
        uz: "Auth headerssiz yaratildi"
      }
    }
  });

  assert.equal(typeof category.category.id, "string");
  assert.equal(typeof category.category.title.en, "string");
  assert.equal(category.category.type, "other");
  assert.equal(category.category.active, true);
  assert.equal(typeof category.category.slug, "string");

  const tag = await request(baseUrl, "/v1/content/tags/create", {
    method: "POST",
    body: {
      name: "Auth Toggle Tag",
      active: true
    }
  });

  assert.equal(typeof tag.tag.id, "string");
  assert.equal(tag.tag.name, "Auth Toggle Tag");
  assert.equal(tag.tag.active, true);

  const movie = await request(baseUrl, "/v1/content/movies/create", {
    method: "POST",
    body: {
      title: {
        en: "Auth Toggle Movie",
        ru: "Auth Toggle Movie RU",
        uz: "Auth Toggle Movie UZ"
      },
      description: {
        en: "Created without auth headers",
        ru: "Created without auth headers RU",
        uz: "Created without auth headers UZ"
      },
      category_id: category.category.id,
      tag_ids: [tag.tag.id],
      is_premium: false
    }
  });

  assert.equal(typeof movie.movie.id, "string");
  assert.equal(movie.movie.category_id, category.category.id);
  assert.deepEqual(movie.movie.tag_ids, [tag.tag.id]);
  assert.match(movie.movie.id, uuidPattern);

  const missingFilterQuery = await requestWithStatus(baseUrl, "/v1/filter");
  assert.equal(missingFilterQuery.status, 400);
  assert.equal(missingFilterQuery.body.error, "request requires category or tag id/ids for endpoint");

  const filteredByTag = await request(baseUrl, `/v1/filter?tag=${encodeURIComponent(tag.tag.id)}`);
  assert.equal(
    filteredByTag.data.some((item) => item.id === movie.movie.id && item.type === "movies"),
    true
  );

  const filteredByCategoryAndTag = await request(
    baseUrl,
    `/v1/filter?tag=${encodeURIComponent(tag.tag.id)}&category=${encodeURIComponent(category.category.id)}`
  );
  assert.equal(
    filteredByCategoryAndTag.data.some((item) => item.id === movie.movie.id && item.type === "movies"),
    true
  );

  const filteredByWrongCategory = await request(
    baseUrl,
    `/v1/filter?tag=${encodeURIComponent(tag.tag.id)}&category=missing-category-id`
  );
  assert.equal(
    filteredByWrongCategory.data.some((item) => item.id === movie.movie.id),
    false
  );

  const seriesItem = await request(baseUrl, `/v1/content/movies/${movie.movie.id}/series`, {
    method: "POST",
    body: {
      title: {
        en: "Auth Toggle Series Item",
        ru: "Auth Toggle Series Item RU",
        uz: "Auth Toggle Series Item UZ"
      },
      description: {
        en: "Series item created without auth headers",
        ru: "Series item created without auth headers RU",
        uz: "Series item created without auth headers UZ"
      },
      category_id: category.category.id,
      tag_ids: [tag.tag.id],
      is_premium: false
    }
  });

  const filteredSeriesItem = await request(baseUrl, `/v1/filter?tag=${encodeURIComponent(tag.tag.id)}`);
  assert.equal(
    filteredSeriesItem.data.some((item) => item.id === seriesItem.series_item.id && item.type === "series"),
    true
  );

  const categories = await request(baseUrl, "/v1/content/categories");

  assert.equal(categories.categories.length > 0, true);

  const deviceConfig = await request(baseUrl, "/v1/device/config");

  assert.equal(deviceConfig.child.name, "Local Child");
  console.log("Auth toggle test passed");
} finally {
  await close();
  fs.rmSync(dataFile, { force: true });
}
