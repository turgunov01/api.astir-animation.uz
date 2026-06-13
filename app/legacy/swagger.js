import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const legacyDir = path.dirname(fileURLToPath(import.meta.url));
const rawDocumentPath = path.join(legacyDir, "legacy-doc.raw.json");

export function readLegacySwaggerRaw() {
  return JSON.parse(fs.readFileSync(rawDocumentPath, "utf8"));
}

function normalizeApiPrefix(value) {
  if (typeof value === "string") {
    return value.replaceAll("/api/v1", "/v1");
  }

  if (Array.isArray(value)) {
    return value.map(normalizeApiPrefix);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, normalizeApiPrefix(childValue)])
    );
  }

  return value;
}

export function createLegacySwaggerForRequest(request) {
  const document = normalizeApiPrefix(readLegacySwaggerRaw());

  return {
    ...document,
    host: request.get("host"),
    schemes: [request.protocol],
    basePath: "/v1"
  };
}
