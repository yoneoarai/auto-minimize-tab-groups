import { IBrowserAdapter } from '../types/browser';
import { ExtensionConfig, ValidationResult } from '../types/config';
import { GroupRule, TabGroupColor } from '../types/rules';
import {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  STORAGE_KEYS,
  CONFIG_VERSION,
  DEFAULT_GENERAL_GROUP_NAME,
  TAB_GROUP_COLORS,
  createDefaultConfig,
} from '../common/constants';

function generateRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class ConfigManager {
  private currentConfig: ExtensionConfig = createDefaultConfig();
  private listeners: Set<(config: ExtensionConfig) => void> = new Set();

  constructor(private browserAdapter: IBrowserAdapter) {
    this.browserAdapter.onStorageChanged((changes) => {
      let configChanged = false;

      if (changes[STORAGE_KEYS.CONFIG]) {
        const rawNew = changes[STORAGE_KEYS.CONFIG].newValue;
        this.currentConfig = this.normalizeConfig(rawNew);
        configChanged = true;
      } else if (changes[STORAGE_KEYS.TIMEOUT]) {
        // Fallback for v1 storage changes
        const rawTimeout = changes[STORAGE_KEYS.TIMEOUT].newValue;
        const normalizedTimeout = ConfigManager.parseAndNormalizeTimeoutMs(rawTimeout);
        if (normalizedTimeout !== this.currentConfig.defaultTimeoutMs) {
          this.currentConfig.defaultTimeoutMs = normalizedTimeout;
          this.currentConfig.timeoutMs = normalizedTimeout;
          configChanged = true;
        }
      }

      if (configChanged) {
        this.notifyListeners(this.currentConfig);
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
   * Validates a group rule.
   */
  public static validateRule(rule: Partial<GroupRule>): ValidationResult {
    if (!rule || typeof rule !== 'object') {
      return { isValid: false, errorMessage: 'Rule must be an object.' };
    }

    if (!rule.name || typeof rule.name !== 'string' || !rule.name.trim()) {
      return { isValid: false, errorMessage: 'Group name cannot be empty.' };
    }

    if (!rule.color || !TAB_GROUP_COLORS.includes(rule.color as TabGroupColor)) {
      return { isValid: false, errorMessage: `Invalid group color: ${rule.color}.` };
    }

    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      return { isValid: false, errorMessage: 'Rule must contain at least one URL pattern.' };
    }

    for (const pattern of rule.patterns) {
      if (typeof pattern !== 'string' || !pattern.trim()) {
        return { isValid: false, errorMessage: 'URL patterns cannot be empty strings.' };
      }
    }

    if (rule.collapse) {
      if (typeof rule.collapse.enabled !== 'boolean') {
        return { isValid: false, errorMessage: 'Collapse enabled must be a boolean.' };
      }
      if (rule.collapse.timeoutMs !== null && typeof rule.collapse.timeoutMs !== 'number') {
        return { isValid: false, errorMessage: 'Collapse timeoutMs must be a number or null.' };
      }
      if (typeof rule.collapse.timeoutMs === 'number') {
        if (
          rule.collapse.timeoutMs < MIN_TIMEOUT_SECONDS * 1000 ||
          rule.collapse.timeoutMs > MAX_TIMEOUT_SECONDS * 1000
        ) {
          return {
            isValid: false,
            errorMessage: `Custom timeout must be between ${MIN_TIMEOUT_SECONDS} and ${MAX_TIMEOUT_SECONDS} seconds.`,
          };
        }
      }
    }

    if (rule.priority !== undefined) {
      if (typeof rule.priority !== 'number' || !Number.isInteger(rule.priority) || rule.priority < 1) {
        return { isValid: false, errorMessage: 'Priority must be an integer of 1 or greater.' };
      }
    }

    if (rule.order !== undefined) {
      if (typeof rule.order !== 'number' || !Number.isInteger(rule.order) || rule.order < 0) {
        return { isValid: false, errorMessage: 'Order must be a non-negative integer.' };
      }
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
   * Migrates v1 configuration (single timeout value) to v2 schema.
   */
  public static migrateV1ToV2(v1TimeoutMs: number): ExtensionConfig {
    const normalized = ConfigManager.parseAndNormalizeTimeoutMs(v1TimeoutMs);
    return {
      version: CONFIG_VERSION,
      enabled: true,
      defaultTimeoutMs: normalized,
      timeoutMs: normalized,
      rules: [],
      unmatchedTabBehavior: 'leave-ungrouped',
      generalGroup: {
        name: DEFAULT_GENERAL_GROUP_NAME,
        color: 'grey',
        collapse: { enabled: true, timeoutMs: null },
      },
      groupOrdering: 'manual',
      reorganizeOnRuleChange: true,
      collapsePaused: false,
    };
  }

  /**
   * Normalizes arbitrary config data to guarantee standard v2 schema.
   */
  private normalizeConfig(raw: unknown): ExtensionConfig {
    if (!raw || typeof raw !== 'object') {
      return createDefaultConfig();
    }

    const data = raw as any;
    const defaultTimeoutMs = ConfigManager.parseAndNormalizeTimeoutMs(
      data.defaultTimeoutMs ?? data.timeoutMs
    );

    const rules: GroupRule[] = [];
    if (Array.isArray(data.rules)) {
      data.rules.forEach((r: any, idx: number) => {
        if (r && typeof r === 'object' && r.name && Array.isArray(r.patterns)) {
          const color: TabGroupColor = TAB_GROUP_COLORS.includes(r.color) ? r.color : 'grey';
          const validPatterns = r.patterns.filter((p: any) => typeof p === 'string' && p.trim().length > 0);
          if (validPatterns.length > 0) {
            rules.push({
              id: typeof r.id === 'string' && r.id ? r.id : generateRuleId(),
              name: String(r.name).trim(),
              color,
              patterns: validPatterns,
              collapse: {
                enabled: typeof r.collapse?.enabled === 'boolean' ? r.collapse.enabled : true,
                timeoutMs:
                  typeof r.collapse?.timeoutMs === 'number'
                    ? ConfigManager.parseAndNormalizeTimeoutMs(r.collapse.timeoutMs)
                    : null,
              },
              order: typeof r.order === 'number' ? r.order : idx,
              priority:
                typeof r.priority === 'number' && Number.isInteger(r.priority) && r.priority >= 1
                  ? r.priority
                  : (typeof r.order === 'number' ? r.order + 1 : idx + 1),
            });
          }
        }
      });
    }

    const generalGroupName =
      typeof data.generalGroup?.name === 'string' && data.generalGroup.name.trim()
        ? data.generalGroup.name.trim()
        : DEFAULT_GENERAL_GROUP_NAME;

    const generalGroupColor: TabGroupColor =
      TAB_GROUP_COLORS.includes(data.generalGroup?.color) ? data.generalGroup.color : 'grey';

    const generalGroupCollapse = {
      enabled:
        typeof data.generalGroup?.collapse?.enabled === 'boolean'
          ? data.generalGroup.collapse.enabled
          : true,
      timeoutMs:
        typeof data.generalGroup?.collapse?.timeoutMs === 'number'
          ? ConfigManager.parseAndNormalizeTimeoutMs(data.generalGroup.collapse.timeoutMs)
          : null,
    };

    return {
      version: CONFIG_VERSION,
      enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
      defaultTimeoutMs,
      timeoutMs: defaultTimeoutMs,
      rules,
      unmatchedTabBehavior:
        data.unmatchedTabBehavior === 'general-group' ? 'general-group' : 'leave-ungrouped',
      generalGroup: {
        name: generalGroupName,
        color: generalGroupColor,
        collapse: generalGroupCollapse,
      },
      groupOrdering: data.groupOrdering === 'alphabetical' ? 'alphabetical' : 'manual',
      reorganizeOnRuleChange:
        typeof data.reorganizeOnRuleChange === 'boolean' ? data.reorganizeOnRuleChange : true,
      collapsePaused: Boolean(data.collapsePaused),
    };
  }

  /**
   * Loads configuration from storage and caches it locally.
   * Handles transparent v1 to v2 migration.
   */
  public async loadConfig(): Promise<ExtensionConfig> {
    try {
      const data = await this.browserAdapter.getStorage([STORAGE_KEYS.CONFIG, STORAGE_KEYS.TIMEOUT]);

      if (data[STORAGE_KEYS.CONFIG]) {
        this.currentConfig = this.normalizeConfig(data[STORAGE_KEYS.CONFIG]);
      } else if (data[STORAGE_KEYS.TIMEOUT] !== undefined) {
        // v1 migration
        this.currentConfig = ConfigManager.migrateV1ToV2(data[STORAGE_KEYS.TIMEOUT]);
        await this.saveConfig();
      } else {
        this.currentConfig = createDefaultConfig();
      }
    } catch (error) {
      console.warn('Failed to load configuration from storage, using defaults:', error);
      this.currentConfig = createDefaultConfig();
    }
    return this.getConfig();
  }

  /**
   * Saves the current configuration to browser storage and notifies listeners.
   */
  public async saveConfig(): Promise<void> {
    await this.browserAdapter.setStorage({
      [STORAGE_KEYS.CONFIG]: this.currentConfig,
      [STORAGE_KEYS.TIMEOUT]: this.currentConfig.defaultTimeoutMs,
    });
  }

  /**
   * Returns a copy of the current configuration.
   */
  public getConfig(): ExtensionConfig {
    return JSON.parse(JSON.stringify(this.currentConfig));
  }

  /**
   * Gets the current default timeout in milliseconds.
   */
  public getTimeoutMs(): number {
    return this.currentConfig.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Gets the current default timeout in seconds.
   */
  public getTimeoutSeconds(): number {
    return Math.round(this.getTimeoutMs() / 1000);
  }

  /**
   * Sets the default timeout given in seconds.
   */
  public async setTimeoutSeconds(seconds: number): Promise<void> {
    const validation = ConfigManager.validateTimeoutSeconds(String(seconds));
    if (!validation.isValid) {
      throw new Error(validation.errorMessage);
    }
    const timeoutMs = seconds * 1000;
    this.currentConfig.defaultTimeoutMs = timeoutMs;
    this.currentConfig.timeoutMs = timeoutMs;
    await this.saveConfig();
  }

  /**
   * Gets all configured group rules, sorted by order.
   */
  public getRules(): GroupRule[] {
    const rules = this.currentConfig.rules || [];
    return [...rules].sort((a, b) => a.order - b.order).map(r => JSON.parse(JSON.stringify(r)));
  }

  /**
   * Gets a rule by its ID.
   */
  public getRuleById(id: string): GroupRule | undefined {
    const rule = (this.currentConfig.rules || []).find((r) => r.id === id);
    return rule ? JSON.parse(JSON.stringify(rule)) : undefined;
  }

  /**
   * Adds a new group rule.
   */
  public async addRule(
    ruleData: Omit<GroupRule, 'id' | 'order' | 'priority'> & { id?: string; order?: number; priority?: number }
  ): Promise<GroupRule> {
    const existingRules = this.getRules();
    let targetOrder = typeof ruleData.order === 'number' && ruleData.order >= 0
      ? Math.min(ruleData.order, existingRules.length)
      : existingRules.length;

    let targetPriority = typeof ruleData.priority === 'number' && ruleData.priority >= 1
      ? Math.floor(ruleData.priority)
      : 1;

    const newRule: GroupRule = {
      id: ruleData.id || generateRuleId(),
      name: ruleData.name.trim(),
      color: ruleData.color,
      patterns: ruleData.patterns.map((p) => p.trim()).filter(Boolean),
      collapse: {
        enabled: ruleData.collapse?.enabled ?? true,
        timeoutMs: ruleData.collapse?.timeoutMs ?? null,
      },
      order: targetOrder,
      priority: targetPriority,
    };

    const validation = ConfigManager.validateRule(newRule);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage);
    }

    existingRules.splice(targetOrder, 0, newRule);
    existingRules.forEach((r, idx) => {
      r.order = idx;
    });

    this.currentConfig.rules = existingRules;
    await this.saveConfig();
    return newRule;
  }

  /**
   * Updates an existing rule by ID.
   */
  public async updateRule(id: string, updates: Partial<Omit<GroupRule, 'id'>>): Promise<void> {
    const currentRules = this.getRules();
    const index = currentRules.findIndex((r) => r.id === id);
    if (index === -1) {
      throw new Error(`Rule with ID "${id}" not found.`);
    }

    const existing = currentRules[index];
    const updated: GroupRule = {
      ...existing,
      ...updates,
      id: existing.id,
      name: updates.name !== undefined ? updates.name.trim() : existing.name,
      patterns:
        updates.patterns !== undefined
          ? updates.patterns.map((p) => p.trim()).filter(Boolean)
          : existing.patterns,
      collapse: {
        enabled: updates.collapse?.enabled ?? existing.collapse.enabled,
        timeoutMs: updates.collapse?.timeoutMs !== undefined ? updates.collapse.timeoutMs : existing.collapse.timeoutMs,
      },
      priority: updates.priority !== undefined ? updates.priority : existing.priority,
    };

    const validation = ConfigManager.validateRule(updated);
    if (!validation.isValid) {
      throw new Error(validation.errorMessage);
    }

    if (typeof updates.order === 'number' && updates.order !== existing.order) {
      currentRules.splice(index, 1);
      const newPos = Math.max(0, Math.min(updates.order, currentRules.length));
      currentRules.splice(newPos, 0, updated);
    } else {
      currentRules[index] = updated;
    }

    currentRules.forEach((r, idx) => {
      r.order = idx;
    });

    this.currentConfig.rules = currentRules;
    await this.saveConfig();
  }

  /**
   * Moves a rule up or down in tab strip ordering.
   */
  public async moveRule(id: string, direction: 'up' | 'down'): Promise<void> {
    const rules = this.getRules();
    const index = rules.findIndex((r) => r.id === id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = rules[index];
      rules[index] = rules[index - 1];
      rules[index - 1] = temp;
    } else if (direction === 'down' && index < rules.length - 1) {
      const temp = rules[index];
      rules[index] = rules[index + 1];
      rules[index + 1] = temp;
    } else {
      return;
    }

    rules.forEach((r, idx) => {
      r.order = idx;
    });

    this.currentConfig.rules = rules;
    await this.saveConfig();
  }

  /**
   * Deletes a rule by ID.
   */
  public async deleteRule(id: string): Promise<void> {
    const initialLength = (this.currentConfig.rules || []).length;
    this.currentConfig.rules = (this.currentConfig.rules || []).filter((r) => r.id !== id);

    if (this.currentConfig.rules.length === initialLength) {
      throw new Error(`Rule with ID "${id}" not found.`);
    }

    // Re-index remaining rules
    this.currentConfig.rules.forEach((r, idx) => {
      r.order = idx;
    });

    await this.saveConfig();
  }

  /**
   * Reorders rules given a list of ordered rule IDs.
   */
  public async reorderRules(orderedIds: string[]): Promise<void> {
    const currentRules = this.currentConfig.rules || [];
    const ruleMap = new Map(currentRules.map((r) => [r.id, r]));

    const reordered: GroupRule[] = [];
    orderedIds.forEach((id) => {
      const rule = ruleMap.get(id);
      if (rule) {
        reordered.push(rule);
        ruleMap.delete(id);
      }
    });

    // Append any rules not explicitly included in orderedIds
    for (const rule of ruleMap.values()) {
      reordered.push(rule);
    }

    reordered.forEach((r, idx) => {
      r.order = idx;
    });

    this.currentConfig.rules = reordered;
    await this.saveConfig();
  }

  /**
   * Enables or disables Tabbi.
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    this.currentConfig.enabled = Boolean(enabled);
    await this.saveConfig();
  }

  /**
   * Returns whether auto-collapsing is currently paused across all groups.
   */
  public isCollapsePaused(): boolean {
    return Boolean(this.currentConfig.collapsePaused);
  }

  /**
   * Pauses or resumes auto-collapsing across all groups.
   */
  public async setCollapsePaused(paused: boolean): Promise<void> {
    this.currentConfig.collapsePaused = Boolean(paused);
    await this.saveConfig();
  }

  /**
   * Sets unmatched tab behavior.
   */
  public async setUnmatchedBehavior(behavior: 'leave-ungrouped' | 'general-group'): Promise<void> {
    this.currentConfig.unmatchedTabBehavior = behavior;
    await this.saveConfig();
  }

  /**
   * Updates general group settings.
   */
  public async setGeneralGroup(settings: ExtensionConfig['generalGroup']): Promise<void> {
    if (!settings) {
      throw new Error('General group settings cannot be empty.');
    }
    this.currentConfig.generalGroup = {
      name: settings.name.trim() || DEFAULT_GENERAL_GROUP_NAME,
      color: TAB_GROUP_COLORS.includes(settings.color) ? settings.color : 'grey',
      collapse: {
        enabled: Boolean(settings.collapse?.enabled),
        timeoutMs: settings.collapse?.timeoutMs ?? null,
      },
    };
    await this.saveConfig();
  }

  /**
   * Sets group ordering mode.
   */
  public async setGroupOrdering(ordering: 'manual' | 'alphabetical'): Promise<void> {
    this.currentConfig.groupOrdering = ordering;
    await this.saveConfig();
  }

  /**
   * Sets reorganize on rule change flag.
   */
  public async setReorganizeOnRuleChange(reorganize: boolean): Promise<void> {
    this.currentConfig.reorganizeOnRuleChange = Boolean(reorganize);
    await this.saveConfig();
  }

  /**
   * Imports configuration from JSON or object.
   */
  public async importConfig(imported: unknown): Promise<void> {
    let parsed = imported;
    if (typeof imported === 'string') {
      try {
        parsed = JSON.parse(imported);
      } catch {
        throw new Error('Invalid JSON format.');
      }
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid configuration: Root must be an object.');
    }

    const obj = parsed as Record<string, any>;
    if (obj.rules !== undefined && !Array.isArray(obj.rules)) {
      throw new Error('Invalid configuration: "rules" must be an array.');
    }

    this.currentConfig = this.normalizeConfig(parsed);
    await this.saveConfig();
  }

  /**
   * Resets configuration to default values.
   */
  public async resetToDefault(): Promise<void> {
    this.currentConfig = createDefaultConfig();
    await this.saveConfig();
  }

  /**
   * Subscribes to configuration changes.
   */
  public onConfigChanged(listener: (config: ExtensionConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(config: ExtensionConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(config);
      } catch (err) {
        console.error('Error in config change listener:', err);
      }
    }
  }
}
