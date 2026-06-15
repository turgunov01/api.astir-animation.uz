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

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function allowedDates(limit) {
  return Array.isArray(limit.allowedDates) ? limit.allowedDates : [];
}

function allowedWeekdays(limit) {
  return Array.isArray(limit.allowedDays) ? limit.allowedDays : [];
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

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || null;
}

function normalizeDevice(device) {
  if (!device) {
    return device;
  }

  return {
    ...device,
    parentId: firstValue(device.parentId, device.parent_id),
    childId: firstValue(device.childId, device.child_id, device.currentChildId, device.current_child_id),
    pairedAt: firstValue(device.pairedAt, device.paired_at)
  };
}

function normalizeParent(parent) {
  if (!parent) {
    return parent;
  }

  return {
    ...parent,
    id: firstValue(parent.id, parent.user_id, parent.parentId, parent.parent_id)
  };
}

function normalizeActor(actor) {
  if (actor?.type === "device") {
    return {
      ...actor,
      device: normalizeDevice(actor.device)
    };
  }

  if (actor?.type === "parent") {
    return {
      ...actor,
      parent: normalizeParent(actor.parent)
    };
  }

  return actor;
}

function sessionSortTime(session) {
  return new Date(
    session.endedAt
    || session.updatedAt
    || session.startedAt
    || session.createdAt
    || 0
  ).getTime();
}

export function createWatchService({ childService, children, contentService, watchSessions }) {
  function actorForDevice(device) {
    return {
      type: "device",
      device: normalizeDevice(device)
    };
  }

  function actorForParent(parent) {
    return {
      type: "parent",
      parent: normalizeParent(parent)
    };
  }

  async function limitStatusForDevice(device, now = new Date()) {
    device = normalizeDevice(device);

    const limit = await childService.getLimitsAsync(device.parentId, device.childId);
    const sessions = watchSessions.listByChildId(device.childId);
    const usedSeconds = usedSecondsToday(sessions, now);

    return {
      day: isoDay(now),
      date: localDateKey(now),
      limit,
      limitSeconds: limit.dailyMinutes * 60,
      usedSeconds
    };
  }

  async function assertDeviceCanWatchNow(device, now = new Date()) {
    const status = await limitStatusForDevice(device, now);
    const exactAllowedDates = allowedDates(status.limit);

    if (exactAllowedDates.length > 0 && !exactAllowedDates.includes(status.date)) {
      throw forbidden("Watching is not allowed on this date", "WATCH_DATE_BLOCKED");
    }

    if (exactAllowedDates.length === 0 && !allowedWeekdays(status.limit).includes(status.day)) {
      throw forbidden("Watching is not allowed today", "WATCH_DAY_BLOCKED");
    }

    if (!isWithinWindow(status.limit, now)) {
      throw forbidden("Watching is outside the allowed time window", "WATCH_TIME_BLOCKED");
    }

    if (status.usedSeconds >= status.limitSeconds) {
      throw forbidden("Daily watch limit reached", "WATCH_LIMIT_REACHED");
    }

    return status;
  }

  function isSessionBlacklisted(device, session) {
    device = normalizeDevice(device);

    const contentIds = [
      session.contentId,
      session.parentSeriesId
    ].filter(Boolean);

    return childService.isAnyContentBlacklisted?.(device.parentId, device.childId, contentIds) || false;
  }

  async function assertSessionCanContinue(device, session, now = new Date()) {
    try {
      if (isSessionBlacklisted(device, session)) {
        throw forbidden("Content is blocked for this child", "CONTENT_BLACKLISTED");
      }

      return await assertDeviceCanWatchNow(device, now);
    } catch (error) {
      finalizeWatchSession(session, now);
      throw error;
    }
  }

  async function getDeviceConfig(device) {
    device = normalizeDevice(device);

    const child = await children.findById(device.childId);

    if (!child) {
      throw notFound("Child not found", "CHILD_NOT_FOUND");
    }

    const limit = await childService.getLimitsAsync(device.parentId, device.childId);
    const blacklist = await childService.listBlacklistAsync(device.parentId, device.childId);

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
        birthYear: child.birthYear ?? child.birth_year ?? child.age
      },
      limit,
      blacklist
    };
  }

  function contentActorFor(actor) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return actorForDevice(actor.device);
    }

    if (actor?.type === "parent") {
      return actorForParent(actor.parent);
    }

    return actor;
  }

  function activeSessionForActor(actor) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return watchSessions.findActiveByDeviceId(actor.device.id);
    }

    if (actor?.type === "parent") {
      return watchSessions.findActiveByParentId(actor.parent.id);
    }

    return null;
  }

  async function sessionsForActor(actor, { childId = "" } = {}) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return watchSessions.listByChildId(actor.device.childId);
    }

    if (actor?.type === "parent") {
      const parentId = actor.parent.id;
      const normalizedChildId = String(childId || "").trim();

      if (normalizedChildId) {
        await childService.getChildForParentAsync(parentId, normalizedChildId);
        return watchSessions.listByChildId(normalizedChildId);
      }

      return watchSessions.listByParentActorId(parentId);
    }

    return [];
  }

  async function latestSessionForActorContent(actor, contentId, options = {}) {
    const sessions = await sessionsForActor(actor, options);

    return sessions
      .filter((session) => session.contentId === contentId)
      .sort((left, right) => sessionSortTime(right) - sessionSortTime(left))[0] || null;
  }

  async function serializeWatchSession(actor, session, extra = {}) {
    let content = null;

    try {
      content = (await contentService.findWatchContent(contentActorFor(actor), session.contentId)).content;
    } catch {
      content = null;
    }

    return {
      ...session,
      content,
      lastPositionSeconds: session.positionSeconds || 0,
      last_position_sec: session.positionSeconds || 0,
      resumePositionSeconds: session.positionSeconds || 0,
      resume_position_sec: session.positionSeconds || 0,
      ...extra
    };
  }

  async function listHistory(actor, { childId = "", limit = 20, unique = true } = {}) {
    const maxItems = Math.max(Number(limit) || 20, 1);
    const seenContentIds = new Set();
    const normalizedActor = normalizeActor(actor);
    const parentChildId = normalizedActor?.type === "parent" ? String(childId || "").trim() : "";
    const sessions = (await sessionsForActor(actor, { childId }))
      .sort((left, right) => sessionSortTime(right) - sessionSortTime(left));
    const filteredSessions = [];

    for (const session of sessions) {
      if (normalizedActor?.type === "device" && isSessionBlacklisted(normalizedActor.device, session)) {
        continue;
      }

      if (
        normalizedActor?.type === "parent"
        && parentChildId
        && childService.isAnyContentBlacklisted?.(
          normalizedActor.parent.id,
          parentChildId,
          [session.contentId, session.parentSeriesId].filter(Boolean)
        )
      ) {
        continue;
      }

      if (unique && seenContentIds.has(session.contentId)) {
        continue;
      }

      seenContentIds.add(session.contentId);
      filteredSessions.push(session);

      if (filteredSessions.length >= maxItems) {
        break;
      }
    }

    const history = await Promise.all(filteredSessions.map((session) => serializeWatchSession(actor, session)));

    return {
      history,
      recentlyViewed: history,
      recently_viewed: history
    };
  }

  async function getProgress(actor, contentId, { childId = "" } = {}) {
    const session = await latestSessionForActorContent(actor, contentId, { childId });
    const positionSeconds = session?.positionSeconds || 0;

    return {
      contentId,
      content_id: contentId,
      positionSeconds,
      position_sec: positionSeconds,
      watchedSeconds: session?.watchedSeconds || 0,
      watched_sec: session?.watchedSeconds || 0,
      watchSessionId: session?.id || null,
      watch_session_id: session?.id || null,
      updatedAt: session?.updatedAt || session?.endedAt || session?.startedAt || null
    };
  }

  async function startWatchSession(device, { contentId }) {
    device = normalizeDevice(device);

    const activeSession = watchSessions.findActiveByDeviceId(device.id);
    let watchTarget;

    try {
      watchTarget = await contentService.findWatchContent(actorForDevice(device), contentId);
    } catch (error) {
      if (activeSession?.contentId === contentId) {
        finalizeWatchSession(activeSession);
      }

      throw error;
    }

    const now = new Date();
    let limitStatus;

    try {
      limitStatus = await assertDeviceCanWatchNow(device, now);
    } catch (error) {
      if (activeSession) {
        finalizeWatchSession(activeSession, now);
      }

      throw error;
    }

    if (activeSession?.contentId === contentId) {
      return {
        ...activeSession,
        content: watchTarget.content,
        lastPositionSeconds: activeSession.positionSeconds || 0,
        last_position_sec: activeSession.positionSeconds || 0,
        resumePositionSeconds: activeSession.positionSeconds || 0,
        resume_position_sec: activeSession.positionSeconds || 0,
        remainingSecondsToday: Math.max(0, limitStatus.limitSeconds - limitStatus.usedSeconds)
      };
    }

    if (activeSession) {
      finalizeWatchSession(activeSession, now);
    }

    const latestSession = await latestSessionForActorContent(actorForDevice(device), contentId);
    const resumePositionSeconds = latestSession?.positionSeconds || 0;
    const session = watchSessions.create({
      actorType: "device",
      parentId: device.parentId,
      childId: device.childId,
      deviceId: device.id,
      contentId,
      contentType: watchTarget.target.type,
      parentSeriesId: watchTarget.target.parentSeriesId,
      startedAt: now.toISOString(),
      endedAt: null,
      durationSeconds: null,
      positionSeconds: resumePositionSeconds,
      watchedSeconds: 0,
      countedAsView: false,
      viewCountedAt: null
    });

    return {
      ...session,
      content: watchTarget.content,
      lastPositionSeconds: resumePositionSeconds,
      last_position_sec: resumePositionSeconds,
      resumePositionSeconds,
      resume_position_sec: resumePositionSeconds,
      remainingSecondsToday: limitStatus.limitSeconds - limitStatus.usedSeconds
    };
  }

  async function startParentWatchSession(parent, { contentId }) {
    parent = normalizeParent(parent);

    const actor = actorForParent(parent);
    const activeSession = activeSessionForActor(actor);
    const watchTarget = await contentService.findWatchContent(actor, contentId);
    const now = new Date();

    if (activeSession?.contentId === contentId) {
      return {
        ...activeSession,
        content: watchTarget.content,
        lastPositionSeconds: activeSession.positionSeconds || 0,
        last_position_sec: activeSession.positionSeconds || 0,
        resumePositionSeconds: activeSession.positionSeconds || 0,
        resume_position_sec: activeSession.positionSeconds || 0,
        remainingSecondsToday: null
      };
    }

    if (activeSession) {
      finalizeWatchSession(activeSession, now);
    }

    const latestSession = await latestSessionForActorContent(actor, contentId);
    const resumePositionSeconds = latestSession?.positionSeconds || 0;
    const session = watchSessions.create({
      actorType: "parent",
      parentId: parent.id,
      childId: null,
      deviceId: null,
      contentId,
      contentType: watchTarget.target.type,
      parentSeriesId: watchTarget.target.parentSeriesId,
      startedAt: now.toISOString(),
      endedAt: null,
      durationSeconds: null,
      positionSeconds: resumePositionSeconds,
      watchedSeconds: 0,
      countedAsView: false,
      viewCountedAt: null
    });

    return {
      ...session,
      content: watchTarget.content,
      lastPositionSeconds: resumePositionSeconds,
      last_position_sec: resumePositionSeconds,
      resumePositionSeconds,
      resume_position_sec: resumePositionSeconds,
      remainingSecondsToday: null
    };
  }

  async function startWatchSessionForActor(actor, { contentId }) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return startWatchSession(actor.device, { contentId });
    }

    if (actor?.type === "parent") {
      return startParentWatchSession(actor.parent, { contentId });
    }

    throw forbidden("Unsupported watch actor", "WATCH_ACTOR_UNSUPPORTED");
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

  function assertParentSession(parent, watchSessionId) {
    parent = normalizeParent(parent);

    const session = watchSessions.findById(watchSessionId);

    if (!session) {
      throw notFound("Watch session not found", "WATCH_SESSION_NOT_FOUND");
    }

    if (session.actorType !== "parent" || session.parentId !== parent.id) {
      throw forbidden("Watch session does not belong to this parent", "WATCH_SESSION_FORBIDDEN");
    }

    return session;
  }

  function assertActorSession(actor, watchSessionId) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return assertDeviceSession(actor.device, watchSessionId);
    }

    if (actor?.type === "parent") {
      return assertParentSession(actor.parent, watchSessionId);
    }

    throw forbidden("Unsupported watch actor", "WATCH_ACTOR_UNSUPPORTED");
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

  async function progressWatchSession(device, watchSessionId, { positionSeconds = null, watchedSeconds }) {
    device = normalizeDevice(device);

    const session = assertDeviceSession(device, watchSessionId);

    if (session.endedAt) {
      throw badRequest("Watch session already stopped", "WATCH_SESSION_STOPPED");
    }

    await assertSessionCanContinue(device, session);

    return applyWatchProgress(session, { positionSeconds, watchedSeconds });
  }

  async function progressWatchSessionForActor(actor, watchSessionId, { positionSeconds = null, watchedSeconds }) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return progressWatchSession(actor.device, watchSessionId, { positionSeconds, watchedSeconds });
    }

    const session = assertActorSession(actor, watchSessionId);

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
    device = normalizeDevice(device);

    const session = assertDeviceSession(device, watchSessionId);

    return finalizeWatchSession(session);
  }

  function stopWatchSessionForActor(actor, watchSessionId) {
    actor = normalizeActor(actor);

    if (actor?.type === "device") {
      return stopWatchSession(actor.device, watchSessionId);
    }

    const session = assertActorSession(actor, watchSessionId);

    return finalizeWatchSession(session);
  }

  return {
    getDeviceConfig,
    getProgress,
    listHistory,
    progressWatchSession,
    progressWatchSessionForActor,
    startWatchSession,
    startWatchSessionForActor,
    stopWatchSessionForActor,
    stopWatchSession
  };
}
