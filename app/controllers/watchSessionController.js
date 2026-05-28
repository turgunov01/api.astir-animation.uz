import { requiredString } from "../lib/validation.js";

export function createWatchSessionController({ watchService }) {
  return {
    start(request, response) {
      const watchSession = watchService.startWatchSession(request.device, {
        contentId: requiredString(request.body, "contentId")
      });

      response.status(201).json({ watchSession });
    },

    stop(request, response) {
      response.json({
        watchSession: watchService.stopWatchSession(request.device, request.params.watchSessionId)
      });
    }
  };
}
