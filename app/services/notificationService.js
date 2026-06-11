import nodemailer from "nodemailer";
import { badRequest, serviceUnavailable } from "../lib/errors.js";

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

function parentIdForActor(actor) {
  if (actor?.type === "parent") {
    return firstValue(actor.parent?.id, actor.parentId, actor.parent_id);
  }

  if (actor?.type === "device") {
    return firstValue(actor.device?.parentId, actor.device?.parent_id);
  }

  return null;
}

function childIdForActor(actor) {
  return actor?.type === "device"
    ? firstValue(actor.device?.childId, actor.device?.child_id, actor.device?.currentChildId, actor.device?.current_child_id)
    : null;
}

function hasSmtpConfig(config) {
  const smtp = config.smtp || {};

  return Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.from);
}

function serializeToken(token) {
  return {
    id: token.id,
    parentId: token.parentId,
    childId: token.childId || null,
    token: token.token,
    platform: token.platform || "",
    enabled: token.enabled !== false,
    createdAt: token.createdAt || null,
    updatedAt: token.updatedAt || null
  };
}

function serializeNotification(notification) {
  return {
    id: notification.id,
    parentId: notification.parentId,
    childId: notification.childId || null,
    channel: notification.channel,
    title: notification.title || "",
    body: notification.body || "",
    data: notification.data || {},
    status: notification.status,
    providerResponse: notification.providerResponse || null,
    createdAt: notification.createdAt || null,
    updatedAt: notification.updatedAt || null
  };
}

export function createNotificationService({ config, notifications }) {
  async function sendFcm(tokens, { title, body, data = {} }) {
    const firebase = config.firebase || {};

    if (!firebase.serverKey) {
      return {
        sent: false,
        skipped: true,
        reason: "FIREBASE_SERVER_KEY is not configured"
      };
    }

    const response = await fetch(firebase.apiUrl || "https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        authorization: `key=${firebase.serverKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registration_ids: tokens,
        notification: { title, body },
        data
      })
    });
    const providerResponse = await response.json().catch(() => ({ status: response.status }));

    return {
      sent: response.ok,
      skipped: false,
      status: response.status,
      providerResponse
    };
  }

  return {
    registerToken(actor, { token, platform = "", enabled = true }) {
      const parentId = parentIdForActor(actor);

      if (!parentId) {
        throw badRequest("Parent id was not found for notification token", "VALIDATION_ERROR");
      }

      const existing = notifications.findToken(parentId, token);
      const attributes = {
        parentId,
        childId: childIdForActor(actor),
        token,
        platform,
        enabled
      };
      const saved = existing
        ? notifications.updateToken(existing.id, attributes)
        : notifications.createToken(attributes);

      return {
        token: serializeToken(saved)
      };
    },

    list(actor) {
      const parentId = parentIdForActor(actor);

      if (!parentId) {
        throw badRequest("Parent id was not found", "VALIDATION_ERROR");
      }

      return {
        notifications: notifications.listNotificationsByParentId(parentId).map(serializeNotification)
      };
    },

    async sendPush(actor, { title, body, data = {}, childId = "" }) {
      const parentId = parentIdForActor(actor);

      if (!parentId) {
        throw badRequest("Parent id was not found", "VALIDATION_ERROR");
      }

      const targetTokens = notifications
        .listTokensByParentId(parentId)
        .filter((item) => !childId || item.childId === childId);
      const tokenValues = targetTokens.map((item) => item.token);
      const result = tokenValues.length > 0
        ? await sendFcm(tokenValues, { title, body, data })
        : { sent: false, skipped: true, reason: "No notification tokens registered" };
      const saved = notifications.createNotification({
        parentId,
        childId: childId || null,
        channel: "push",
        title,
        body,
        data,
        status: result.sent ? "sent" : "stored",
        providerResponse: result
      });

      return {
        notification: serializeNotification(saved),
        result
      };
    },

    async sendEmail({ to, subject, text = "", html = "" }) {
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
      const result = await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        text,
        html
      });

      return {
        sent: true,
        messageId: result.messageId
      };
    }
  };
}
