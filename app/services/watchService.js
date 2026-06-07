import { badRequest, forbidden, notFound } from "../lib/errors.js";

const countedViewThresholdSeconds = 10;

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
  function actorForDevice(device) {
    return {
      type: "device",
      device
    };
  }

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

  async function startWatchSession(device, { contentId }) {
    const watchTarget = await contentService.findWatchContent(actorForDevice(device), contentId);
    const activeSession = watchSessions.findActiveByDeviceId(device.id);

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

    if (activeSession?.contentId === contentId) {
      return {
        ...activeSession,
        content: watchTarget.content,
        remainingSecondsToday: Math.max(0, limitSeconds - usedSeconds)
      };
    }

    if (activeSession) {
      finalizeWatchSession(activeSession, now);
    }

    if (usedSeconds >= limitSeconds) {
      throw forbidden("Daily watch limit reached", "WATCH_LIMIT_REACHED");
    }

    const session = watchSessions.create({
      parentId: device.parentId,
      childId: device.childId,
      deviceId: device.id,
      contentId,
      contentType: watchTarget.target.type,
      parentSeriesId: watchTarget.target.parentSeriesId,
      startedAt: now.toISOString(),
      endedAt: null,
      durationSeconds: null,
      positionSeconds: 0,
      watchedSeconds: 0,
      countedAsView: false,
      viewCountedAt: null
    });

    return {
      ...session,
      content: watchTarget.content,
      remainingSecondsToday: limitSeconds - usedSeconds
    };
  }

  function assertDeviceSession(device, watchSessionId) {
    const session = watchSessions.findById(watchSessionId);

    if (!session) {
      throw notFound("Watch session not found", "WATCH_SESSION_NOT_FOUND");
    }

    if (session.deviceId !== device.id) {
      throw forbidden("Watch session does not belong to this device", "WATCH_SESSION_FORBIDDEN");
    }

    return session;
  }

  function applyWatchProgress(session, { positionSeconds = null, watchedSeconds }) {
    const previousWatchedSeconds = session.watchedSeconds || 0;
    const nextWatchedSeconds = Math.max(previousWatchedSeconds, watchedSeconds);
    const watchTimeDeltaSec = nextWatchedSeconds - previousWatchedSeconds;
    const countedAsView = !session.countedAsView && nextWatchedSeconds >= countedViewThresholdSeconds;
    const updates = {
      watchedSeconds: nextWatchedSeconds,
      positionSeconds: positionSeconds ?? session.positionSeconds ?? nextWatchedSeconds,
      countedAsView: session.countedAsView || countedAsView,
      viewCountedAt: countedAsView ? new Date().toISOString() : session.viewCountedAt || null
    };

    if (session.contentType === "movie" && (watchTimeDeltaSec > 0 || countedAsView)) {
      contentService.recordWatchProgress({
        contentId: session.contentId,
        countedAsView,
        watchTimeDeltaSec
      });
    }

    return watchSessions.update(session.id, updates);
  }

  function progressWatchSession(device, watchSessionId, { positionSeconds = null, watchedSeconds }) {
    const session = assertDeviceSession(device, watchSessionId);

    if (session.endedAt) {
      throw badRequest("Watch session already stopped", "WATCH_SESSION_STOPPED");
    }

    return applyWatchProgress(session, { positionSeconds, watchedSeconds });
  }

  function finalizeWatchSession(session, endedAt = new Date()) {
    if (session.endedAt) {
      return session;
    }

    const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - new Date(session.startedAt).getTime()) / 1000));
    const progressedSession = applyWatchProgress(session, {
      positionSeconds: session.positionSeconds ?? durationSeconds,
      watchedSeconds: Math.max(session.watchedSeconds || 0, durationSeconds)
    });

    return watchSessions.update(progressedSession.id, {
      endedAt: endedAt.toISOString(),
      durationSeconds: Math.max(durationSeconds, progressedSession.watchedSeconds || 0)
    });
  }

  function stopWatchSession(device, watchSessionId) {
    const session = assertDeviceSession(device, watchSessionId);

    return finalizeWatchSession(session);
  }

  return {
    getDeviceConfig,
    progressWatchSession,
    startWatchSession,
    stopWatchSession
  };
}
