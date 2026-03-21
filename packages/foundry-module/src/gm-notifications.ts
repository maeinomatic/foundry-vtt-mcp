import { MODULE_ID } from './constants.js';

export type GMNotificationLevel = 'info' | 'warn' | 'error';

export function shouldNotifyGM(): boolean {
  if (!game.user?.isGM) {
    return false;
  }

  const enabledSetting = game.settings.get(MODULE_ID, 'enableNotifications') as unknown;
  return enabledSetting !== false;
}

export function notifyGM(level: GMNotificationLevel, message: string): void {
  if (!shouldNotifyGM()) {
    return;
  }

  if (level === 'info') {
    ui.notifications?.info(message);
    return;
  }

  if (level === 'warn') {
    ui.notifications?.warn(message);
    return;
  }

  ui.notifications?.error(message);
}

export function debugGM(message: string, details?: unknown): void {
  if (!game.user?.isGM) {
    return;
  }

  if (details !== undefined) {
    globalThis.console?.debug?.(`[${MODULE_ID}] ${message}`, details);
    return;
  }

  globalThis.console?.debug?.(`[${MODULE_ID}] ${message}`);
}
