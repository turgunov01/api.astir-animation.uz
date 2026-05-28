import { badRequest, forbidden, notFound } from "../lib/errors.js";

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isoDay(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function sameLocalDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isWithinWindow(limit, now) {
  const current = minutesSinceMidnight(now);
  const from = parseTime(limit.allowedFrom);
  const to = parseTime(limit.allowedTo);

  if (from <= to) {
    return current >= from && current <= to;
  }

  return current >= from || current <= to;
}

function usedSecondsToday(sessions, now) {
  return sessions
    .filter((session) => sameLocalDay(new Date(session.startedAt), now))
    .reduce((total, session) => {
      if (session.durationSeconds) {
        return total + session.durationSeconds;
      }

      if (!session.endedAt) {
        return total + Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000);
      }

      return total;
    }, 0);
}

export function createWatchService({ childService, children, contentService, watchSessions }) {
  function getDeviceConfig(device) {
    const child = children.findById(device.childId);

    if (!child) {
      throw notFound("Child not found", "CHILD_NOT_FOUND");
    }

    const limit = childService.getLimits(device.parentId, device.childId);

    return {
      device: {
        id: device.id,
        name: device.name,
        platform: device.platform,
        pairedAt: device.pairedAt
      },
      child: {
        id: child.id,
        name: child.name,
        birthYear: child.birthYear
      },
      limit
    };
  }

  function startWatchSession(device, { contentId }) {
    const content = contentService.findContent(contentId);

    if (!content) {
      throw notFound("Content item not found", "CONTENT_NOT_FOUND");
    }

    const activeSession = watchSessions.findActiveByDeviceId(device.id);

    if (activeSession) {
      throw badRequest("Device already has an active watch session", "WATCH_SESSION_ACTIVE");
    }

    const limit = childService.getLimits(device.parentId, device.childId);
    const now = new Date();
    const day = isoDay(now);

    if (!limit.allowedDays.includes(day)) {
      throw forbidden("Watching is not allowed today", "WATCH_DAY_BLOCKED");
    }

    if (!isWithinWindow(limit, now)) {
      throw forbidden("Watching is outside the allowed time window", "WATCH_TIME_BLOCKED");
    }

    const sessions = watchSessions.listByChildId(device.childId);
    const usedSeconds = usedSecondsToday(sessions, now);
    const limitSeconds = limit.dailyMinutes * 60;

    if (usedSeconds >= limitSeconds) {
      throw forbidden("Daily watch limit reached", "WATCH_LIMIT_REACHED");
    }

    const session = watchSessions.create({
      parentId: device.parentId,
      childId: device.childId,
      deviceId: device.id,
      contentId,
      startedAt: now.toISOString(),
      endedAt: null,
      durationSeconds: null
    });

    return {
      ...session,
      content,
      remainingSecondsToday: limitSeconds - usedSeconds
    };
  }

  function stopWatchSession(device, watchSessionId) {
    const session = watchSessions.findById(watchSessionId);

    if (!session) {
      throw notFound("Watch session not found", "WATCH_SESSION_NOT_FOUND");
    }

    if (session.deviceId !== device.id) {
      throw forbidden("Watch session does not belong to this device", "WATCH_SESSION_FORBIDDEN");
    }

    if (session.endedAt) {
      return session;
    }

    const endedAt = new Date();
    const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000));

    return watchSessions.update(session.id, {
      endedAt: endedAt.toISOString(),
      durationSeconds
    });
  }

  return {
    getDeviceConfig,
    startWatchSession,
    stopWatchSession
  };
}
