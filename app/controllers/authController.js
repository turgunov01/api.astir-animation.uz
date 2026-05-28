import { email, pin, requiredString } from "../lib/validation.js";

export function createAuthController({ authService }) {
  return {
    register(request, response) {
      const result = authService.registerParent({
        name: requiredString(request.body, "name"),
        email: email(request.body),
        password: requiredString(request.body, "password", { minLength: 8 }),
        pin: pin(request.body)
      });

      response.status(201).json(result);
    },

    login(request, response) {
      const result = authService.loginParent({
        email: email(request.body),
        password: requiredString(request.body, "password")
      });

      response.json(result);
    },

    me(request, response) {
      response.json({ parent: authService.sanitizeParent(request.parent) });
    },

    verifyPin(request, response) {
      response.json(authService.verifyParentPin(request.parent, pin(request.body)));
    }
  };
}
