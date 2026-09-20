/**
 * Timing and configuration constants for Auto Minimize Tab Groups
 */

export const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 3600; // 1 hour

export const DEBOUNCE_DELAY_MS = 250; // Event debouncing delay
export const NEW_TAB_GRACE_PERIOD_MS = 1000; // Grace period for new tabs to settle
export const JUST_OPENED_GRACE_PERIOD_MS = 5000; // Grace period for manually opened groups
export const STARTUP_DELAY_MS = 2000; // Delay before initializing on browser startup
export const INSTALL_DELAY_MS = 1000; // Delay before initializing on extension install/update

export const STORAGE_KEYS = {
  TIMEOUT: 'timeout',
} as const;
