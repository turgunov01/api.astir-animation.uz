export function createDeviceController({ watchService }) {
  return {
    getConfig(request, response) {
      response.json(watchService.getDeviceConfig(request.device));
    }
  };
}
