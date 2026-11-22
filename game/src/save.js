// save.js — persistence in a single localStorage blob.
//
// The blob records cash, story progress (mission + step), where the player
// stood, their health, and the side-activity ledger produced by
// activities.js (shells taken, fares completed, race best). It is versioned
// (`v: 1`); a blob from an older build simply lacks the activities field,
// which readers treat as an empty ledger rather than as corruption. Every
// access is wrapped so private-mode browsers and full quotas degrade to
// "no save" instead of crashing the game.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.v === 1 ? parsed : null;
  } catch {
    return null;
  }
}

const round1 = (n) => Math.round(n * 10) / 10;

export function writeSave(state) {
  try {
    const blob = {
      v: 1,
      cash: Math.round(state.cash),
      missionIndex: state.missionIndex,
      stepIdx: state.stepIdx ?? 0,
      pos: [round1(state.pos.x), round1(state.pos.z)],
      health: Math.round(state.health),
      activities: state.activities ?? null,
      photos: state.photos ?? null,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    return blob;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // storage unavailable: clearing is best-effort by design
  }
}
