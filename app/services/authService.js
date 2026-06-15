import nodemailer from "nodemailer";
import { conflict, serviceUnavailable, unauthorized } from "../lib/errors.js";
import { hashSecret, randomCode, verifySecret } from "../lib/security.js";
import { signParentToken } from "../lib/tokens.js";

const registrationOtpPurpose = "registration";

function serializeParent(parent) {
  return {
    id: parent.id,
    name: parent.name,
    email: parent.email,
    role: parent.role || "parent",
    tariff: parent.tariff || "free",
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt
  };
}

function addMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function hasSmtpConfig(config) {
  const smtp = config.smtp || {};

  return Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.from);
}

async function sendOtpEmail(config, email, code) {
  if (!hasSmtpConfig(config)) {
    throw serviceUnavailable("SMTP configuration is required", "SMTP_UNAVAILABLE");
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: email,
    subject: "Astir verification code",
    text: `Your Astir verification code is ${code}. It expires in ${config.otpTtlMinutes} minutes.`
  });
}

export function createAuthService({ config, otpCodes, parents }) {
  async function emailStatus(email) {
    const existingParent = await parents.findByEmail(email);

    return {
      email,
      emailExists: Boolean(existingParent),
      user_exists: Boolean(existingParent),
      can_register: !existingParent,
      auth_flow: existingParent ? "login" : "register"
    };
  }

  async function requestRegistrationOtp({ email }) {
    const status = await emailStatus(email);

    if (status.emailExists) {
      return {
        ...status,
        otpSent: false,
        otp_sent: false,
        expiresAt: null,
        debugCode: ""
      };
    }

    const code = config.otpDefaultCode || randomCode(6);
    const expiresAt = addMinutes(config.otpTtlMinutes);

    otpCodes.create({
      email,
      codeHash: hashSecret(code),
      purpose: registrationOtpPurpose,
      expiresAt
    });

    if (!config.otpDefaultCode) {
      await sendOtpEmail(config, email, code);
    }

    return {
      ...status,
      expiresAt,
      otpSent: true,
      otp_sent: true,
      debugCode: (config.otpDefaultCode || config.otpDebug) ? code : ""
    };
  }

  async function verifyRegistrationOtp({ email, code }) {
    const recentOtpCodes = otpCodes.findRecentUnverified(email, registrationOtpPurpose);
    const matchingOtpCode = recentOtpCodes.find((otp) => verifySecret(code, otp.codeHash));

    if (!matchingOtpCode) {
      throw unauthorized("Invalid OTP code", "INVALID_OTP");
    }

    otpCodes.markVerified(matchingOtpCode.id);

    return {
      email,
      verified: true,
      ...await emailStatus(email)
    };
  }

  async function registerParent({ name, email, password, pin }) {
    const existingParent = await parents.findByEmail(email);

    if (existingParent) {
      throw conflict("A parent account already exists for this email", "EMAIL_EXISTS");
    }

    const verifiedOtpCode = otpCodes.findLatestVerified(email, registrationOtpPurpose);

    if (!verifiedOtpCode) {
      throw unauthorized("OTP verification is required", "OTP_REQUIRED");
    }

    const parent = await parents.create({
      name,
      email,
      passwordHash: hashSecret(password),
      pinHash: hashSecret(pin),
      tariff: "free"
    });

    otpCodes.markUsed(verifiedOtpCode.id);

    return {
      parent: serializeParent(parent),
      token: signParentToken(parent)
    };
  }

  async function loginParent({ email, password }) {
    const parent = await parents.findByEmail(email);

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

  async function changeParentPin(parent, { currentPin, newPin }) {
    verifyParentPin(parent, currentPin);

    const pinHash = hashSecret(newPin);
    const updatedParent = await parents.update(parent.id, {
      pinHash
    });

    return {
      changed: true,
      parent: serializeParent(updatedParent || {
        ...parent,
        pinHash
      })
    };
  }

  return {
    changeParentPin,
    checkEmail: emailStatus,
    loginParent,
    requestRegistrationOtp,
    registerParent,
    sanitizeParent: serializeParent,
    verifyRegistrationOtp,
    verifyParentPin
  };
}
