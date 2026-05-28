import { allowedDays, requiredInteger, requiredString, timeOfDay } from "../lib/validation.js";

export function createChildrenController({ childService }) {
  return {
    list(request, response) {
      response.json({ children: childService.listChildren(request.parent.id) });
    },

    create(request, response) {
      const child = childService.createChild(request.parent.id, {
        name: requiredString(request.body, "name"),
        birthYear: requiredInteger(request.body, "birthYear", { min: 1900, max: new Date().getFullYear() })
      });

      response.status(201).json({ child });
    },

    get(request, response) {
      const child = childService.getChildForParent(request.parent.id, request.params.childId);

      response.json({ child: childService.serializeChild(child) });
    },

    getLimits(request, response) {
      response.json({ limit: childService.getLimits(request.parent.id, request.params.childId) });
    },

    updateLimits(request, response) {
      const limit = childService.updateLimits(request.parent.id, request.params.childId, {
        dailyMinutes: requiredInteger(request.body, "dailyMinutes", { min: 1, max: 1440 }),
        allowedFrom: timeOfDay(request.body, "allowedFrom"),
        allowedTo: timeOfDay(request.body, "allowedTo"),
        allowedDays: allowedDays(request.body)
      });

      response.json({ limit });
    }
  };
}
