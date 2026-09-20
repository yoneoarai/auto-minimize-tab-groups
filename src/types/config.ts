import { GroupRule, TabGroupColor } from './rules';

/**
 * Full configuration schema for Tabbi (v2).
 */
export interface ExtensionConfigV2 {
  version: 2;
  enabled: boolean;
  defaultTimeoutMs: number;
  rules: GroupRule[];
  unmatchedTabBehavior: 'leave-ungrouped' | 'general-group';
  generalGroup: {
    name: string;
    color: TabGroupColor;
    collapse: {
      enabled: boolean;
      timeoutMs: number | null;
    };
  };
  groupOrdering: 'manual' | 'alphabetical';
  reorganizeOnRuleChange: boolean;
}

/**
 * Extension configuration model.
 * Supports v2 properties with backward compatibility for v1 timeoutMs during migration.
 */
export interface ExtensionConfig {
  /** Schema version for migration support */
  version?: 2;

  /** Global enable/disable toggle */
  enabled?: boolean;

  /** Default collapse timeout (ms) for groups without a custom setting */
  defaultTimeoutMs?: number;

  /** Legacy v1 timeout in milliseconds, preserved during migration */
  timeoutMs?: number;

  /** Ordered list of group rules */
  rules?: GroupRule[];

  /** What to do with tabs that don't match any rule */
  unmatchedTabBehavior?: 'leave-ungrouped' | 'general-group';

  /** Settings for the "General" catch-all group */
  generalGroup?: {
    name: string;
    color: TabGroupColor;
    collapse: {
      enabled: boolean;
      timeoutMs: number | null;
    };
  };

  /** How groups are ordered in the tab strip */
  groupOrdering?: 'manual' | 'alphabetical';

  /** Whether to re-organize existing tabs when rules change */
  reorganizeOnRuleChange?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}
