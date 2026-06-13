import jwt from "jsonwebtoken";
import { config } from "../config.js";

export function signParentToken(parent) {
  return jwt.sign(
    {
      sub: parent.id,
      type: "parent",
      parentId: parent.id
    },
    config.jwtSecret,
    { expiresIn: config.parentTokenTtl }
  );
}

export function signDeviceToken(device) {
  const parentId = device.parentId || device.parent_id;
  const childId = device.childId || device.child_id;

  return jwt.sign(
    {
      sub: device.id,
      type: "device",
      deviceId: device.id,
      parentId,
      childId
    },
    config.jwtSecret,
    { expiresIn: config.deviceTokenTtl }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
