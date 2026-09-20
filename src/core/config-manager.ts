import { IBrowserAdapter } from '../types/browser';
import { ExtensionConfig, ValidationResult } from '../types/config';
import {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  STORAGE_KEYS,
} from '../common/constants';

export class ConfigManager {
  private currentTimeoutMs: number = DEFAULT_TIMEOUT_MS;
  private listeners: Set<(newTimeoutMs: number) => void> = new Set();

  constructor(private browserAdapter: IBrowserAdapter) {
    this.browserAdapter.onStorageChanged((changes) => {
      if (changes[STORAGE_KEYS.TIMEOUT]) {
        const rawNewValue = changes[STORAGE_KEYS.TIMEOUT].newValue;
        const normalized = ConfigManager.parseAndNormalizeTimeoutMs(rawNewValue);
        if (normalized !== this.currentTimeoutMs) {
          this.currentTimeoutMs = normalized;
          this.notifyListeners(normalized);
        }
      }
    });
  }

  /**
   * Validates a user-input timeout string in seconds.
   */
  public static validateTimeoutSeconds(value: string): ValidationResult {
    const trimmed = value.trim();
    if (!trimmed) {
      return { isValid: false, errorMessage: 'Please enter a timeout value.' };
    }

    const numValue = Number(trimmed);
    if (isNaN(numValue) || !Number.isFinite(numValue)) {
      return { isValid: false, errorMessage: 'Please enter a valid number.' };
    }

    if (numValue < MIN_TIMEOUT_SECONDS) {
      return {
        isValid: false,
        errorMessage: `Timeout must be at least ${MIN_TIMEOUT_SECONDS} second${MIN_TIMEOUT_SECONDS > 1 ? 's' : ''}.`,
      };
    }

    if (numValue > MAX_TIMEOUT_SECONDS) {
      return {
        isValid: false,
        errorMessage: `Timeout cannot exceed ${MAX_TIMEOUT_SECONDS} seconds (${Math.floor(MAX_TIMEOUT_SECONDS / 60)} minutes).`,
      };
    }

    return { isValid: true };
  }

  /**
   * Validates and normalizes a timeout value in milliseconds.
   * Returns DEFAULT_TIMEOUT_MS if invalid or out of bounds.
   */
  public static parseAndNormalizeTimeoutMs(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (
      isNaN(parsed) ||
      !Number.isFinite(parsed) ||
      parsed < MIN_TIMEOUT_SECONDS * 1000 ||
      parsed > MAX_TIMEOUT_SECONDS * 1000
    ) {
      return DEFAULT_TIMEOUT_MS;
    }
    return parsed;
  }

  /**
   * Loads configuration from storage and caches it locally.
   */
  public async loadConfig(): Promise<ExtensionConfig> {
    try {
      const data = await this.browserAdapter.getStorage([STORAGE_KEYS.TIMEOUT]);
      this.currentTimeoutMs = ConfigManager.parseAndNormalizeTimeoutMs(data[STORAGE_KEYS.TIMEOUT]);
    } catch (error) {
      console.warn('Failed to load configuration from storage, using defaults:', error);
      this.currentTimeoutMs = DEFAULT_TIMEOUT_MS;
    }
    return { timeoutMs: this.currentTimeoutMs };
  }

  /**
   * Gets the current timeout in milliseconds.
   */
  public getTimeoutMs(): number {
    return this.currentTimeoutMs;
  }

  /**
   * Gets the current timeout in seconds.
   */
  public getTimeoutSeconds(): number {
    return Math.round(this.currentTimeoutMs / 1000);
  }

  /**
   * Sets the timeout given in seconds.
   */
  public async setTimeoutSeconds(seconds: number): Promise<void> {
    const validation = ConfigManager.validateTimeoutSeconds(String(seconds));
    if (!validation.isValid) {
      throw new Error(validation.errorMessage);
    }
    const timeoutMs = seconds * 1000;
    await this.browserAdapter.setStorage({ [STORAGE_KEYS.TIMEOUT]: timeoutMs });
    this.currentTimeoutMs = timeoutMs;
    this.notifyListeners(timeoutMs);
  }

  /**
   * Resets configuration to default values.
   */
  public async resetToDefault(): Promise<void> {
    await this.browserAdapter.setStorage({ [STORAGE_KEYS.TIMEOUT]: DEFAULT_TIMEOUT_MS });
    this.currentTimeoutMs = DEFAULT_TIMEOUT_MS;
    this.notifyListeners(DEFAULT_TIMEOUT_MS);
  }

  /**
   * Subscribes to configuration changes.
   */
  public onConfigChanged(listener: (newTimeoutMs: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(newTimeoutMs: number): void {
    for (const listener of this.listeners) {
      try {
        listener(newTimeoutMs);
      } catch (err) {
        console.error('Error in config change listener:', err);
      }
    }
  }
}
