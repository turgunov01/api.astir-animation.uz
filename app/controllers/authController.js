import { email, otpCode, pin, requiredString } from "../lib/validation.js";

function requestEmail(request) {
  return email(Object.hasOwn(request.body || {}, "email") ? request.body : request.query);
}

export function createAuthController({ authService }) {
  return {
    async checkEmail(request, response) {
      response.json(await authService.checkEmail(requestEmail(request)));
    },

    async requestRegistrationOtp(request, response) {
      response.json(await authService.requestRegistrationOtp({
        email: requestEmail(request)
      }));
    },

    async verifyRegistrationOtp(request, response) {
      response.json(await authService.verifyRegistrationOtp({
        email: email(request.body),
        code: otpCode(request.body)
      }));
    },

    async register(request, response) {
      const result = await authService.registerParent({
        name: requiredString(request.body, "name"),
        email: email(request.body),
        password: requiredString(request.body, "password", { minLength: 8 }),
        pin: pin(request.body)
      });

      response.status(201).json(result);
    },

    async login(request, response) {
      const result = await authService.loginParent({
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
    },

    async changePin(request, response) {
      response.json(await authService.changeParentPin(request.parent, {
        currentPin: pin({
          pin: request.body?.currentPin || request.body?.current_pin || request.body?.oldPin || request.body?.old_pin
        }),
        newPin: pin({
          pin: request.body?.newPin || request.body?.new_pin || request.body?.pin
        })
      }));
    }
  };
}
