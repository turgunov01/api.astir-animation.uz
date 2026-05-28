import {
  optionalBoolean,
  optionalString,
  requiredLocalizedText,
  requiredString
} from "../lib/validation.js";
import { badRequest } from "../lib/errors.js";

export function createTariffController({ tariffService }) {
  return {
    create(request, response) {
      const attributes = {
        title: requiredLocalizedText(request.body, "title"),
        description: requiredLocalizedText(request.body, "description"),
        is_default: optionalBoolean(request.body, "is_default", false),
        can_watch_premium: optionalBoolean(request.body, "can_watch_premium", false)
      };
      const id = optionalString(request.body, "id");

      if (id) {
        attributes.id = id;
      }

      response.status(201).json({
        tariff: tariffService.createTariff(attributes)
      });
    },

    current(request, response) {
      response.json(tariffService.currentForActor(request.actor));
    },

    delete(request, response) {
      response.json(tariffService.deleteTariff(request.params.tariff_id));
    },

    get(request, response) {
      response.json({
        tariff: tariffService.getTariff(request.params.tariff_id)
      });
    },

    list(request, response) {
      response.json({
        tariffs: tariffService.listTariffs()
      });
    },

    update(request, response) {
      const attributes = {};

      if (Object.hasOwn(request.body, "title")) {
        attributes.title = requiredLocalizedText(request.body, "title");
      }

      if (Object.hasOwn(request.body, "description")) {
        attributes.description = requiredLocalizedText(request.body, "description");
      }

      if (Object.hasOwn(request.body, "is_default")) {
        attributes.is_default = optionalBoolean(request.body, "is_default");
      }

      if (Object.hasOwn(request.body, "can_watch_premium")) {
        attributes.can_watch_premium = optionalBoolean(request.body, "can_watch_premium");
      }

      if (Object.keys(attributes).length === 0) {
        throw badRequest("At least one field is required", "VALIDATION_ERROR");
      }

      response.json({
        tariff: tariffService.updateTariff(request.params.tariff_id, attributes)
      });
    },

    updateCurrent(request, response) {
      response.json(tariffService.updateParentTariff(
        request.parent,
        requiredString(request.body, "tariff")
      ));
    }
  };
}
