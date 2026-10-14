// Worker liveness decision (K-14). Pure function over Orca's worker-list
// projection plus coordinator-known timing. No heartbeats are assumed: the
// spike showed none are sent. A pending ask pauses the clock.

export const DEFAULT_INTERVALS_MIN = { implementer: 20, researcher: 15, advisor: 15, reviewer: 15, debugger: 15 };

export function decideLiveness({ projection, role, now, lastProgressAt, pendingQuestionCreatedAt = null, intervalsMin = DEFAULT_INTERVALS_MIN }) {
  const interval = (intervalsMin[role] ?? 15) * 60 * 1000;
  const verdict = projection?.liveness?.verdict || 'unverifiable';
  const reason = projection?.liveness?.reason || null;
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const progressMs = lastProgressAt ? (typeof lastProgressAt === 'number' ? lastProgressAt : Date.parse(lastProgressAt)) : null;

  if (pendingQuestionCreatedAt) {
    const askAge = nowMs - Date.parse(pendingQuestionCreatedAt);
    return { action: 'wait', reason: 'question pending; liveness clock paused (K-14)', ask_age_seconds: Math.round(askAge / 1000) };
  }
  if (verdict === 'exited') return { action: 'stop', reason: 'worker exited without worker_done' };
  const silence = progressMs != null ? nowMs - progressMs : null;
  if (verdict === 'live') {
    if (silence != null && silence > interval) return { action: 'inspect', reason: `live but silent for ${Math.round(silence / 60000)} min, over the ${interval / 60000} min interval` };
    return { action: 'wait', reason: 'live' };
  }
  // unverifiable
  if (silence != null && silence > interval) return { action: 'inspect', reason: `unverifiable (${reason}) for longer than the interval; inspect with worker-read, then stop per K-15 if no progress` };
  return { action: 'wait', reason: `unverifiable (${reason}) but within the interval` };
}
