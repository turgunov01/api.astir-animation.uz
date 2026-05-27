import { Router } from "express";
import { asyncHandler } from "../lib/errors.js";
import { email, pin, requiredString } from "../lib/validation.js";
import { requireParent } from "../middleware/auth.js";
import { loginParent, registerParent, sanitizeParent, verifyParentPin } from "../services/authService.js";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  asyncHandler((request, response) => {
    const result = registerParent({
      name: requiredString(request.body, "name"),
      email: email(request.body),
      password: requiredString(request.body, "password", { minLength: 8 }),
      pin: pin(request.body)
    });

    response.status(201).json(result);
  })
);

authRoutes.post(
  "/login",
  asyncHandler((request, response) => {
    response.json(
      loginParent({
        email: email(request.body),
        password: requiredString(request.body, "password")
      })
    );
  })
);

authRoutes.get(
  "/me",
  requireParent,
  asyncHandler((request, response) => {
    response.json({ parent: sanitizeParent(request.parent) });
  })
);

authRoutes.post(
  "/pin/verify",
  requireParent,
  asyncHandler((request, response) => {
    response.json(verifyParentPin(request.parent, pin(request.body)));
  })
);
