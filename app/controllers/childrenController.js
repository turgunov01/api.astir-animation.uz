import { allowedDates, allowedDays, requiredInteger, requiredString, timeOfDay } from "../lib/validation.js";

function requiredContentId(body) {
  return requiredString({
    contentId: body?.contentId || body?.content_id
  }, "contentId");
}

function requestLocale(request) {
  const queryLocale = request.query?.lang;

  if (["uz", "ru", "en"].includes(queryLocale)) {
    return queryLocale;
  }

  const headerLocale = request.get?.("accept-language")?.split(",")[0]?.trim()?.slice(0, 2);

  return ["uz", "ru", "en"].includes(headerLocale) ? headerLocale : "en";
}

export function createChildrenController({ childService }) {
  return {
    async list(request, response) {
      response.json({ children: await childService.listChildrenAsync(request.parent.id) });
    },

    async create(request, response) {
      const child = await childService.createChildAsync(request.parent.id, {
        name: requiredString(request.body, "name"),
        birthYear: requiredInteger(request.body, "birthYear", { min: 1900, max: new Date().getFullYear() })
      });

      response.status(201).json({ child });
    },

    async get(request, response) {
      const child = await childService.getChildForParentAsync(request.parent.id, request.params.childId);

      response.json({ child: childService.serializeChild(child) });
    },

    async getLimits(request, response) {
      response.json({ limit: await childService.getLimitsAsync(request.parent.id, request.params.childId) });
    },

    async listDevices(request, response) {
      response.json({ devices: await childService.listDevicesAsync(request.parent.id, request.params.childId) });
    },

    async updateLimits(request, response) {
      const limit = await childService.updateLimitsAsync(request.parent.id, request.params.childId, {
        dailyMinutes: requiredInteger(request.body, "dailyMinutes", { min: 1, max: 1440 }),
        allowedFrom: timeOfDay(request.body, "allowedFrom"),
        allowedTo: timeOfDay(request.body, "allowedTo"),
        allowedDays: allowedDays(request.body),
        allowedDates: allowedDates(request.body)
      });

      response.json({ limit });
    },

    async listBlacklist(request, response) {
      response.json({
        blacklist: await childService.listBlacklistAsync(request.parent.id, request.params.childId, {
          locale: requestLocale(request)
        })
      });
    },

    async addToBlacklist(request, response) {
      const blacklistItem = await childService.addToBlacklistAsync(
        request.parent.id,
        request.params.childId,
        requiredContentId(request.body)
      );

      response.status(201).json({
        blacklist_item: blacklistItem,
        item: blacklistItem
      });
    },

    async removeFromBlacklist(request, response) {
      response.json(await childService.removeFromBlacklistAsync(
        request.parent.id,
        request.params.childId,
        request.params.contentId
      ));
    }
  };
}
