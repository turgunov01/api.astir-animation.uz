import nodemailer from "nodemailer";

// Outgoing email (OTP codes, test letters) with the live SMTP settings —
// they can be edited in the admin panel and apply without a restart.

const DEFAULT_SUBJECT = "Код подтверждения Astir";
const DEFAULT_TEXT = "Ваш код подтверждения Astir: {code}\nКод действует {minutes} минут.\n\nЕсли вы не запрашивали код, просто проигнорируйте это письмо.";

export function smtpConfigured(smtp = {}) {
  return Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.from);
}

export function otpMessage(smtp = {}, code, minutes = 10) {
  const fill = (template) => String(template).replace(/\{code\}/g, code).replace(/\{minutes\}/g, String(minutes));
  return { subject: fill(smtp.otp_subject || DEFAULT_SUBJECT), text: fill(smtp.otp_text || DEFAULT_TEXT) };
}

export async function sendMail(smtp = {}, { to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: smtp.secure === true || smtp.secure === "true",
    auth: { user: smtp.user, pass: smtp.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000
  });
  return await transporter.sendMail({ from: smtp.from, to, subject, text });
}
