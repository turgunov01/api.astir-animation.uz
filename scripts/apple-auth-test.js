import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import {
  appleClientSecret,
  appleRevocationConfigured,
  exchangeAppleAuthorizationCode,
  revokeAppleToken
} from "../app/legacy/appleAuth.js";

for (const name of ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_PRIVATE_KEY_PATH"]) {
  delete process.env[name];
}

// Without a key the Apple calls are skipped instead of failing login/deletion.
assert.equal(appleRevocationConfigured(), false);
assert.equal(await exchangeAppleAuthorizationCode("code", "uz.astir.app"), null);
assert.equal(await revokeAppleToken("token", "uz.astir.app"), false);

const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
process.env.APPLE_TEAM_ID = "TEAM123456";
process.env.APPLE_KEY_ID = "KEY1234567";
process.env.APPLE_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n");
assert.equal(appleRevocationConfigured(), true);

const secret = appleClientSecret("uz.astir.app");
const decoded = jwt.verify(secret, publicKey.export({ type: "spki", format: "pem" }), {
  algorithms: ["ES256"],
  complete: true
});
assert.equal(decoded.header.kid, "KEY1234567");
assert.equal(decoded.payload.iss, "TEAM123456");
assert.equal(decoded.payload.sub, "uz.astir.app");
assert.equal(decoded.payload.aud, "https://appleid.apple.com");
assert.ok(decoded.payload.exp - decoded.payload.iat <= 300);

console.log("apple auth test passed");
