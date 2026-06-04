import { openApiDocument } from "../openapi.js";

const defaultTags = ["Health"];

const scopes = [
  {
    key: "parent",
    docsPath: "/parent-docs",
    jsonPath: "/parent-openapi.json",
    title: "Astir Parent API",
    description: "Parent account, child profiles, limits, and pairing approval.",
    operations: [
      "GET /health",
      "POST /v1/auth/login",
      "POST /api/v1/auth/register",
      "POST /api/v1/auth/login",
      "POST /api/v1/auth/otp/login",
      "POST /api/v1/auth/google",
      "POST /api/v1/auth/apple",
      "POST /api/v1/auth/logout",
      "POST /api/v1/auth/refresh",
      "POST /api/v1/auth/otp/request",
      "POST /api/v1/auth/otp/verify",
      "POST /api/v1/auth/forgot-password",
      "POST /api/v1/auth/reset-password",
      "POST /api/v1/auth/me/avatar",
      "GET /api/v1/auth/me",
      "PUT /api/v1/auth/me",
      "POST /api/v1/auth/child/init",
      "GET /api/v1/auth/child/{device_id}/status",
      "POST /api/v1/auth/child/confirm",
      "POST /api/v1/auth/tv/init",
      "POST /api/v1/auth/tv/profile",
      "GET /api/v1/auth/tv/profiles",
      "GET /api/v1/auth/tv/{device_id}/status",
      "POST /api/v1/auth/tv/confirm",
      "GET /api/v1/children",
      "POST /api/v1/children",
      "PUT /api/v1/children/{id}",
      "DELETE /api/v1/children/{id}",
      "PUT /api/v1/children/{id}/pin",
      "GET /api/v1/children/{id}/devices",
      "DELETE /api/v1/children/{id}/devices/{device_id}",
      "POST /api/v1/children/{id}/extend/init",
      "POST /api/v1/children/{id}/extend/pin",
      "GET /api/v1/children/{id}/extend/{ticket_id}/status",
      "GET /api/v1/children/{id}/permissions",
      "POST /api/v1/children/{id}/permissions",
      "PUT /api/v1/children/{id}/permissions/{rule_id}",
      "GET /api/v1/tv-devices",
      "DELETE /api/v1/tv-devices/{id}",
      "GET /v1/tariffs",
      "GET /v1/tariffs/{tariff_id}",
      "POST /v1/tariffs/create",
      "GET /v1/tariffs/current",
      "PATCH /v1/tariffs/current",
      "PATCH /v1/tariffs/{tariff_id}",
      "DELETE /v1/tariffs/{tariff_id}",
      "GET /v1/billing/subscription/current",
      "POST /v1/billing/apple/verify",
      "POST /v1/billing/google/verify",
      "POST /v1/pairing/sessions/{sessionId}/approve"
    ]
  },
  {
    key: "admin",
    docsPath: "/admin-docs",
    jsonPath: "/admin-openapi.json",
    title: "Astir Admin API",
    description: "Admin user, parent-account, card, and child management.",
    operations: [
      "GET /health",
      "POST /api/v1/auth/login",
      "GET /api/v1/users",
      "POST /api/v1/users",
      "GET /api/v1/users/{id}",
      "PUT /api/v1/users/{id}",
      "DELETE /api/v1/users/{id}",
      "PATCH /api/v1/users/{id}/active",
      "POST /api/v1/users/{id}/plan",
      "GET /api/v1/users/{id}/subscriptions",
      "GET /api/v1/users/{id}/cards",
      "GET /api/v1/users/{id}/children",
      "DELETE /api/v1/users/{user_id}/children/{child_id}",
      "PATCH /api/v1/users/{user_id}/children/{child_id}/active",
      "GET /api/v1/admin/logs",
      "GET /api/v1/admin/cards"
    ]
  },
  {
    key: "support",
    docsPath: "/support-docs",
    jsonPath: "/support-openapi.json",
    title: "Astir Support API",
    description: "Public support chat, FAQs, and admin support desk routes.",
    operations: [
      "GET /health",
      "GET /api/v1/support/attachments/{path}",
      "GET /api/v1/support/chat",
      "GET /api/v1/support/chat/messages",
      "POST /api/v1/support/chat/messages",
      "POST /api/v1/support/chat/read",
      "GET /api/v1/faqs",
      "GET /api/v1/admin/faqs",
      "POST /api/v1/admin/faqs",
      "PUT /api/v1/admin/faqs/{id}",
      "DELETE /api/v1/admin/faqs/{id}",
      "GET /api/v1/admin/support/chats",
      "GET /api/v1/admin/support/chats/{id}",
      "GET /api/v1/admin/support/chats/{id}/messages",
      "POST /api/v1/admin/support/chats/{id}/messages",
      "POST /api/v1/admin/support/chats/{id}/read"
    ]
  },
  {
    key: "billing",
    docsPath: "/billing-docs",
    jsonPath: "/billing-openapi.json",
    title: "Astir Billing API",
    description: "Cards, subscriptions, checkout, and Click payment routes.",
    operations: [
      "GET /health",
      "GET /api/v1/cards",
      "POST /api/v1/cards",
      "DELETE /api/v1/cards/{id}",
      "POST /api/v1/cards/{id}/default",
      "GET /api/v1/billing/subscriptions",
      "GET /api/v1/billing/transactions",
      "POST /api/v1/billing/checkout",
      "POST /api/v1/billing/checkout/deeplink",
      "POST /api/v1/billing/charge/recurring",
      "POST /api/v1/payments/click/card/request",
      "POST /api/v1/payments/click/card/verify",
      "GET /api/v1/payments/click/mock-pay",
      "DELETE /api/v1/payments/click/payment/{payment_id}/reversal",
      "GET /api/v1/payments/click/payment/{payment_id}/status"
    ]
  },
  {
    key: "device",
    docsPath: "/device-docs",
    jsonPath: "/device-openapi.json",
    title: "Astir Device API",
    description: "Child and TV device setup, config, content, and watch sessions.",
    operations: [
      "GET /health",
      "POST /api/v1/auth/child/init",
      "GET /api/v1/auth/child/{device_id}/status",
      "POST /api/v1/auth/tv/init",
      "POST /api/v1/auth/tv/profile",
      "GET /api/v1/auth/tv/profiles",
      "GET /api/v1/auth/tv/{device_id}/status",
      "POST /v1/pairing/sessions",
      "GET /v1/pairing/sessions/{sessionId}",
      "GET /v1/device/config",
      "GET /v1/tariffs",
      "GET /v1/tariffs/{tariff_id}",
      "GET /v1/tariffs/current",
      "GET /v1/billing/subscription/current",
      "GET /v1/content/movies",
      "GET /v1/content/movies/{movie_id}",
      "GET /v1/content/movies/{movie_id}/series",
      "GET /v1/content/categories",
      "GET /v1/content/categories/{category_id}",
      "POST /v1/watch-sessions/start",
      "PATCH /v1/watch-sessions/{watchSessionId}/stop"
    ]
  },
  {
    key: "tariffs",
    docsPath: "/tariffs-docs",
    jsonPath: "/tariffs-openapi.json",
    title: "Astir Tariffs API",
    description: "Tariff plans and access rules for free and premium content.",
    operations: [
      "GET /health",
      "GET /v1/tariffs",
      "GET /v1/tariffs/{tariff_id}",
      "POST /v1/tariffs/create",
      "GET /v1/tariffs/current",
      "PATCH /v1/tariffs/current",
      "PATCH /v1/tariffs/{tariff_id}",
      "DELETE /v1/tariffs/{tariff_id}",
      "GET /v1/billing/subscription/current",
      "POST /v1/billing/apple/verify",
      "POST /v1/billing/google/verify",
      "POST /v1/billing/webhook/apple",
      "POST /v1/billing/webhook/google"
    ]
  },
  {
    key: "content",
    docsPath: "/content-docs",
    jsonPath: "/content-openapi.json",
    title: "Astir Content API",
    description: "Content endpoints for parent and paired device clients.",
    operations: [
      "GET /health",
      "GET /v1/content/movies",
      "GET /v1/content/movies/{movie_id}",
      "GET /v1/content/movies/{movie_id}/series",
      "POST /v1/content/movies/create",
      "PATCH /v1/content/movies/{movie_id}",
      "POST /v1/content/movies/{movie_id}/poster",
      "PUT /v1/content/movies/{movie_id}/tags",
      "POST /v1/content/movies/{movie_id}/series",
      "DELETE /v1/content/movies/{movie_id}",
      "GET /api/v1/series",
      "POST /api/v1/series",
      "GET /api/v1/series/{id}",
      "PUT /api/v1/series/{id}",
      "DELETE /api/v1/series/{id}",
      "GET /api/v1/series/{id}/episodes",
      "GET /api/v1/series/{id}/poster",
      "POST /api/v1/series/{id}/poster",
      "GET /v1/content/categories",
      "GET /v1/content/categories/{category_id}",
      "POST /v1/content/categories/create",
      "PATCH /v1/content/categories/{category_id}",
      "DELETE /v1/content/categories/{category_id}",
      "GET /v1/content/tags",
      "GET /v1/content/tags/{tag_id}",
      "POST /v1/content/tags/create",
      "PATCH /v1/content/tags/{tag_id}",
      "DELETE /v1/content/tags/{tag_id}"
    ]
  },
  {
    key: "pairing",
    docsPath: "/pairing-docs",
    jsonPath: "/pairing-openapi.json",
    title: "Astir Pairing API",
    description: "Pairing flow between parent app and child or TV app.",
    operations: [
      "GET /health",
      "POST /api/v1/auth/child/init",
      "GET /api/v1/auth/child/{device_id}/status",
      "POST /api/v1/auth/child/confirm",
      "POST /api/v1/auth/tv/confirm",
      "POST /v1/pairing/sessions",
      "GET /v1/pairing/sessions/{sessionId}",
      "POST /v1/pairing/sessions/{sessionId}/approve"
    ]
  },
  {
    key: "watch",
    docsPath: "/watch-docs",
    jsonPath: "/watch-openapi.json",
    title: "Astir Watch Session API",
    description: "Watch session start and stop endpoints for paired devices.",
    operations: [
      "GET /health",
      "POST /v1/watch-sessions/start",
      "PATCH /v1/watch-sessions/{watchSessionId}/stop"
    ]
  }
];

function operationKey(method, path) {
  return `${method.toUpperCase()} ${path}`;
}

function filterPathsByOperations(paths, operations) {
  const filteredPaths = {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const filteredPathItem = {};

    for (const [method, operation] of Object.entries(pathItem)) {
      if (operations.has(operationKey(method, path))) {
        filteredPathItem[method] = operation;
      }
    }

    if (Object.keys(filteredPathItem).length > 0) {
      filteredPaths[path] = filteredPathItem;
    }
  }

  return filteredPaths;
}

function collectTags(paths) {
  const tags = new Set(defaultTags);

  for (const pathItem of Object.values(paths)) {
    for (const operation of Object.values(pathItem)) {
      for (const tag of operation.tags || []) {
        tags.add(tag);
      }
    }
  }

  return tags;
}

function createScopedDocument(scope) {
  const paths = filterPathsByOperations(openApiDocument.paths, new Set(scope.operations));
  const tags = collectTags(paths);

  return {
    ...openApiDocument,
    info: {
      ...openApiDocument.info,
      title: scope.title,
      description: scope.description
    },
    tags: openApiDocument.tags.filter((tag) => tags.has(tag.name)),
    paths
  };
}

export const swaggerScopes = scopes.map((scope) => ({
  ...scope,
  document: createScopedDocument(scope)
}));
