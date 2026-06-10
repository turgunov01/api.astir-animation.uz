export function createDeviceController({ watchService }) {
  return {
    async getConfig(request, response) {
      response.json(await watchService.getDeviceConfig(request.device));
    }
  };
}
