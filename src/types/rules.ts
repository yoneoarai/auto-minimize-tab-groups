/**
 * Types and interfaces for Tabbi tab grouping rules and pattern matching.
 */

/**
 * Tab group color palette supported by browser tabGroups API.
 */
export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

/**
 * Parsed URL pattern structure used by RuleEngine.
 */
export interface UrlPattern {
  raw: string;
  regex: RegExp;
}

/**
 * Result of matching a URL against a set of rules.
 */
export interface MatchResult {
  rule: GroupRule;
  matchedPattern: string;
}

/**
 * A user-configured rule for auto-grouping tabs and custom collapse behavior.
 */
export interface GroupRule {
  id: string;
  name: string;
  color: TabGroupColor;
  patterns: string[];
  collapse: {
    enabled: boolean;
    timeoutMs: number | null; // null indicates using default timeout
  };
  order: number; // 0-indexed order for browser tab strip positioning and list sequencing
  priority: number; // 1-based evaluation priority for pattern matching (1 = highest precedence)
  isFallback?: boolean; // True if this is the catch-all / fallback group for unmatched tabs
  evaluateLast?: boolean; // If true, evaluates after all standard rules regardless of numeric priority
}
