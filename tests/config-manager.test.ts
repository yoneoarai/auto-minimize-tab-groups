import { ConfigManager } from '../src/core/config-manager';
import { MockBrowserAdapter } from '../src/adapters/mock-adapter';
import { DEFAULT_TIMEOUT_MS, STORAGE_KEYS } from '../src/common/constants';

describe('ConfigManager', () => {
  let mockAdapter: MockBrowserAdapter;
  let configManager: ConfigManager;

  beforeEach(() => {
    mockAdapter = new MockBrowserAdapter();
    configManager = new ConfigManager(mockAdapter);
  });

  describe('validateTimeoutSeconds', () => {
    it('rejects empty input', () => {
      const result = ConfigManager.validateTimeoutSeconds('   ');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/enter a timeout value/i);
    });

    it('rejects non-numeric input', () => {
      const result = ConfigManager.validateTimeoutSeconds('abc');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/valid number/i);
    });

    it('rejects values below minimum (< 1s)', () => {
      const result = ConfigManager.validateTimeoutSeconds('0');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/at least 1 second/i);

      const negativeResult = ConfigManager.validateTimeoutSeconds('-10');
      expect(negativeResult.isValid).toBe(false);
    });

    it('rejects values above maximum (> 3600s)', () => {
      const result = ConfigManager.validateTimeoutSeconds('3601');
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toMatch(/cannot exceed 3600/i);
    });

    it('accepts valid boundary and middle values', () => {
      expect(ConfigManager.validateTimeoutSeconds('1').isValid).toBe(true);
      expect(ConfigManager.validateTimeoutSeconds('30').isValid).toBe(true);
      expect(ConfigManager.validateTimeoutSeconds('3600').isValid).toBe(true);
    });
  });

  describe('parseAndNormalizeTimeoutMs', () => {
    it('returns valid millisecond numbers directly', () => {
      expect(ConfigManager.parseAndNormalizeTimeoutMs(15000)).toBe(15000);
      expect(ConfigManager.parseAndNormalizeTimeoutMs('20000')).toBe(20000);
    });

    it('falls back to default on invalid or out-of-bounds input', () => {
      expect(ConfigManager.parseAndNormalizeTimeoutMs(null)).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs(undefined)).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs('invalid')).toBe(DEFAULT_TIMEOUT_MS);
      expect(ConfigManager.parseAndNormalizeTimeoutMs(500)).toBe(DEFAULT_TIMEOUT_MS); // Below 1000ms
      expect(ConfigManager.parseAndNormalizeTimeoutMs(5000000)).toBe(DEFAULT_TIMEOUT_MS); // Above 3600s
    });
  });

  describe('loadConfig and storage interaction', () => {
    it('loads default timeout when storage is empty', async () => {
      const config = await configManager.loadConfig();
      expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
      expect(configManager.getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
      expect(configManager.getTimeoutSeconds()).toBe(30);
    });

    it('loads stored timeout if valid', async () => {
      mockAdapter.storage[STORAGE_KEYS.TIMEOUT] = 45000;
      const config = await configManager.loadConfig();
      expect(config.timeoutMs).toBe(45000);
      expect(configManager.getTimeoutSeconds()).toBe(45);
    });

    it('saves valid timeout and updates storage', async () => {
      await configManager.setTimeoutSeconds(60);
      expect(mockAdapter.storage[STORAGE_KEYS.TIMEOUT]).toBe(60000);
      expect(configManager.getTimeoutMs()).toBe(60000);
      expect(configManager.getTimeoutSeconds()).toBe(60);
    });

    it('throws error when setting invalid timeout', async () => {
      await expect(configManager.setTimeoutSeconds(-5)).rejects.toThrow();
    });

    it('resets to default successfully', async () => {
      await configManager.setTimeoutSeconds(120);
      expect(configManager.getTimeoutMs()).toBe(120000);

      await configManager.resetToDefault();
      expect(configManager.getTimeoutMs()).toBe(DEFAULT_TIMEOUT_MS);
      expect(mockAdapter.storage[STORAGE_KEYS.TIMEOUT]).toBe(DEFAULT_TIMEOUT_MS);
    });

    it('notifies listeners when config changes via setTimeoutSeconds', async () => {
      const listener = jest.fn();
      configManager.onConfigChanged(listener);

      await configManager.setTimeoutSeconds(15);
      expect(listener).toHaveBeenCalledWith(15000);
    });

    it('synchronizes and notifies listeners when external storage changes', () => {
      const listener = jest.fn();
      configManager.onConfigChanged(listener);

      mockAdapter.triggerStorageChanged({
        [STORAGE_KEYS.TIMEOUT]: {
          oldValue: 30000,
          newValue: 50000,
        },
      });

      expect(configManager.getTimeoutMs()).toBe(50000);
      expect(listener).toHaveBeenCalledWith(50000);
    });
  });
});
