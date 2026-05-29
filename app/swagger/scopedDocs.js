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
      "POST /v1/auth/otp/request",
      "POST /v1/auth/otp/verify",
      "POST /v1/auth/register",
      "POST /v1/auth/login",
      "GET /v1/auth/me",
      "POST /v1/auth/pin/verify",
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
      "GET /v1/children",
      "POST /v1/children",
      "GET /v1/children/{childId}",
      "GET /v1/children/{childId}/limits",
      "PUT /v1/children/{childId}/limits",
      "POST /v1/pairing/sessions/{sessionId}/approve"
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
      "POST /v1/content/movies/{movie_id}/series",
      "DELETE /v1/content/movies/{movie_id}",
      "GET /v1/content/categories",
      "GET /v1/content/categories/{category_id}",
      "POST /v1/content/categories/create",
      "PATCH /v1/content/categories/{category_id}",
      "DELETE /v1/content/categories/{category_id}"
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
