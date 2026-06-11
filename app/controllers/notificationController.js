import { optionalBoolean, optionalString, requiredString } from "../lib/validation.js";

function jsonObject(value) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  return {};
}

function actorForRequest(request) {
  return request.actor || (request.parent ? { type: "parent", parent: request.parent } : null);
}

export function createNotificationController({ notificationService }) {
  return {
    registerToken(request, response) {
      response.status(201).json(notificationService.registerToken(actorForRequest(request), {
        token: requiredString(request.body, "token"),
        platform: optionalString(request.body, "platform") || "",
        enabled: optionalBoolean(request.body, "enabled", true)
      }));
    },

    list(request, response) {
      response.json(notificationService.list(actorForRequest(request)));
    },

    async sendPush(request, response) {
      response.status(201).json(await notificationService.sendPush(actorForRequest(request), {
        title: requiredString(request.body, "title"),
        body: requiredString(request.body, "body"),
        data: jsonObject(request.body?.data),
        childId: optionalString({
          childId: request.body?.childId || request.body?.child_id
        }, "childId") || ""
      }));
    },

    async sendEmail(request, response) {
      response.status(201).json(await notificationService.sendEmail({
        to: requiredString(request.body, "to"),
        subject: requiredString(request.body, "subject"),
        text: optionalString(request.body, "text") || "",
        html: optionalString(request.body, "html") || ""
      }));
    }
  };
}
