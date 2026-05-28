import { conflict, unauthorized } from "../lib/errors.js";
import { hashSecret, verifySecret } from "../lib/security.js";
import { signParentToken } from "../lib/tokens.js";

function serializeParent(parent) {
  return {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    tariff: parent.tariff || "free",
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt
  };
}

export function createAuthService({ parents }) {
  function registerParent({ name, email, password, pin }) {
    const existingParent = parents.findByEmail(email);

    if (existingParent) {
      throw conflict("A parent account already exists for this email", "EMAIL_EXISTS");
    }

    const parent = parents.create({
      name,
      email,
      passwordHash: hashSecret(password),
      pinHash: hashSecret(pin),
      tariff: "free"
    });

    return {
      parent: serializeParent(parent),
      token: signParentToken(parent)
    };
  }

  function loginParent({ email, password }) {
    const parent = parents.findByEmail(email);

    if (!parent || !verifySecret(password, parent.passwordHash)) {
      throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
    }

    return {
      parent: serializeParent(parent),
      token: signParentToken(parent)
    };
  }

  function verifyParentPin(parent, pin) {
    if (!verifySecret(pin, parent.pinHash)) {
      throw unauthorized("Invalid PIN", "INVALID_PIN");
    }

    return { verified: true };
  }

  return {
    loginParent,
    registerParent,
    sanitizeParent: serializeParent,
    verifyParentPin
  };
}
