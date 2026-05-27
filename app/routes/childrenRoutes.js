import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";
import { allowedDays, requiredInteger, requiredString, timeOfDay } from "../lib/validation.js";
import { requireParent } from "../middleware/auth.js";
import { createChild, getChildForParent, getLimits, listChildren, serializeChild, updateLimits } from "../services/childService.js";

export const childrenRoutes = Router();

childrenRoutes.use(requireParent);

childrenRoutes.get(
  "/",
  asyncHandler((request, response) => {
    response.json({ children: listChildren(request.parent.id) });
  })
);

childrenRoutes.post(
  "/",
  asyncHandler((request, response) => {
    const child = createChild(request.parent.id, {
      name: requiredString(request.body, "name"),
      birthYear: requiredInteger(request.body, "birthYear", { min: 1900, max: new Date().getFullYear() })
    });

    response.status(201).json({ child });
  })
);

childrenRoutes.get(
  "/:childId",
  asyncHandler((request, response) => {
    response.json({ child: serializeChild(getChildForParent(request.parent.id, request.params.childId)) });
  })
);

childrenRoutes.get(
  "/:childId/limits",
  asyncHandler((request, response) => {
    response.json({ limit: getLimits(request.parent.id, request.params.childId) });
  })
);

childrenRoutes.put(
  "/:childId/limits",
  asyncHandler((request, response) => {
    const limit = updateLimits(request.parent.id, request.params.childId, {
      dailyMinutes: requiredInteger(request.body, "dailyMinutes", { min: 1, max: 1440 }),
      allowedFrom: timeOfDay(request.body, "allowedFrom"),
      allowedTo: timeOfDay(request.body, "allowedTo"),
      allowedDays: allowedDays(request.body)
    });

    response.json({ limit });
  })
);
