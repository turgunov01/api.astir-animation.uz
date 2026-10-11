export function createAdminDeviceController({ adminDeviceService }) {
  return {
    async list(request, response) {
      response.json(await adminDeviceService.list(request.parent));
    },

    async revoke(request, response) {
      response.json(adminDeviceService.revoke(request.parent, request.params.deviceId));
    }
  };
}
