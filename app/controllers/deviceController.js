function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

export function createDeviceController({ childService, notificationService, watchService }) {
  return {
    async getConfig(request, response) {
      response.json(await watchService.getDeviceConfig(request.device));
    },

    async appOpen(request, response) {
      const device = request.device;
      const parentId = firstValue(device?.parentId, device?.parent_id);
      const childId = firstValue(device?.childId, device?.child_id, device?.currentChildId, device?.current_child_id);
      const child = await childService.getChildForParentAsync(parentId, childId);

      response.status(201).json(await notificationService.notifyChildAppLogin({
        parentId,
        childId,
        childName: child.name,
        deviceId: device.id,
        deviceName: device.name || device.device_name || "",
        platform: device.platform || ""
      }));
    }
  };
}
