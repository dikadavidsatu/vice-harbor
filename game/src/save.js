// One JSON blob in localStorage: cash, mission progress, position, health.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (_) {
    return null;
  }
}

export function writeSave(state) {
  try {
    const blob = {
      v: 1,
      cash: Math.round(state.cash),
      missionIndex: state.missionIndex,
      stepIdx: state.stepIdx || 0,
      pos: [Math.round(state.pos.x * 10) / 10, Math.round(state.pos.z * 10) / 10],
      health: Math.round(state.health),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    return blob;
  } catch (_) {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch (_) {}
}
