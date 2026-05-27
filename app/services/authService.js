import { conflict, unauthorized } from "../lib/errors.js";
import { hashSecret, verifySecret } from "../lib/security.js";
import { signParentToken } from "../lib/tokens.js";
import { store } from "../store/jsonStore.js";

function serializeParent(parent) {
  return {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt
  };
}

export function registerParent({ name, email, password, pin }) {
  const existingParent = store.findOne("parents", (parent) => parent.email === email);

  if (existingParent) {
    throw conflict("A parent account already exists for this email", "EMAIL_EXISTS");
  }

  const parent = store.insert("parents", {
    name,
    email,
    passwordHash: hashSecret(password),
    pinHash: hashSecret(pin)
  });

  return {
    parent: serializeParent(parent),
    token: signParentToken(parent)
  };
}

export function loginParent({ email, password }) {
  const parent = store.findOne("parents", (record) => record.email === email);

  if (!parent || !verifySecret(password, parent.passwordHash)) {
    throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  return {
    parent: serializeParent(parent),
    token: signParentToken(parent)
  };
}

export function verifyParentPin(parent, pin) {
  if (!verifySecret(pin, parent.pinHash)) {
    throw unauthorized("Invalid PIN", "INVALID_PIN");
  }

  return { verified: true };
}

export function sanitizeParent(parent) {
  return serializeParent(parent);
}
