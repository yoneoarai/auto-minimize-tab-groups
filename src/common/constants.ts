import { ExtensionConfig } from '../types/config';
import { TabGroupColor } from '../types/rules';

/**
 * Timing and configuration constants for Tabbi - Tab Group Manager
 */

export const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 3600; // 1 hour

export const DEBOUNCE_DELAY_MS = 250; // Event debouncing delay
export const NEW_TAB_GRACE_PERIOD_MS = 1000; // Grace period for new tabs to settle
export const JUST_OPENED_GRACE_PERIOD_MS = 5000; // Grace period for manually opened groups
export const STARTUP_DELAY_MS = 2000; // Delay before initializing on browser startup
export const INSTALL_DELAY_MS = 1000; // Delay before initializing on extension install/update

export const CONFIG_VERSION = 2;
export const DEFAULT_GENERAL_GROUP_NAME = 'General';

export const TAB_GROUP_COLORS: readonly TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
] as const;

export const STORAGE_KEYS = {
  TIMEOUT: 'timeout',
  CONFIG: 'config',
} as const;

/**
 * Factory function to create a default ExtensionConfig v2 object.
 */
export const createDefaultConfig = (): ExtensionConfig => ({
  version: CONFIG_VERSION,
  enabled: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  rules: [],
  unmatchedTabBehavior: 'leave-ungrouped',
  generalGroup: {
    name: DEFAULT_GENERAL_GROUP_NAME,
    color: 'grey',
    collapse: {
      enabled: true,
      timeoutMs: null,
    },
  },
  groupOrdering: 'manual',
  reorganizeOnRuleChange: true,
  collapsePaused: false,
});
