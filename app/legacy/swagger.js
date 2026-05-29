import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const legacyDir = path.dirname(fileURLToPath(import.meta.url));
const rawDocumentPath = path.join(legacyDir, "legacy-doc.raw.json");

export function readLegacySwaggerRaw() {
  return JSON.parse(fs.readFileSync(rawDocumentPath, "utf8"));
}

export function createLegacySwaggerForRequest(request) {
  const document = readLegacySwaggerRaw();

  return {
    ...document,
    host: request.get("host"),
    schemes: [request.protocol],
    basePath: "/api/v1"
  };
}
