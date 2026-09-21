import { GroupRule, MatchResult } from '../types/rules';
import { ValidationResult } from '../types/config';

/**
 * Escapes regex special characters except asterisk (*).
 */
function escapeRegexExceptWildcard(str: string): string {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * URL Pattern matching engine for Tabbi.
 * Compiles user-defined URL patterns and matches URLs against configured group rules.
 */
export class RuleEngine {
  private static readonly MAX_CACHE_SIZE = 500;
  private static patternCache: Map<string, RegExp> = new Map();

  /**
   * Clears the compiled pattern cache.
   */
  public static clearCache(): void {
    RuleEngine.patternCache.clear();
  }

  /**
   * Validates a raw pattern string.
   */
  public static validatePattern(pattern: string): ValidationResult {
    const trimmed = pattern.trim();
    if (!trimmed) {
      return { isValid: false, errorMessage: 'Pattern cannot be empty.' };
    }

    try {
      RuleEngine.compilePattern(trimmed);
      return { isValid: true };
    } catch (err: any) {
      return {
        isValid: false,
        errorMessage: err.message || 'Invalid pattern syntax.',
      };
    }
  }

  /**
   * Compiles a user-friendly pattern string into a RegExp.
   *
   * Supported patterns:
   * - Domain: "google.com" matches http/https, optional www., and any path.
   * - Subdomain wildcard: "*.google.com" matches subdomains like "mail.google.com" but not "google.com".
   * - Path wildcard: "github.com/myorg/*" matches any path under /myorg/.
   * - Scheme wildcard: "*://domain/settings" matches any protocol and domain ending in /settings.
   * - IP wildcard: "192.168.1.*" matches local IP ranges.
   */
  public static compilePattern(raw: string): RegExp {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('Pattern cannot be empty.');
    }

    const cached = RuleEngine.patternCache.get(trimmed);
    if (cached) {
      return cached;
    }

    let pattern = trimmed;

    // Check if scheme is explicitly provided
    let schemePart = '';
    const schemeMatch = pattern.match(/^([a-zA-Z*]+):\/\/(.*)$/);
    if (schemeMatch) {
      const scheme = schemeMatch[1];
      pattern = schemeMatch[2];
      if (scheme === '*') {
        schemePart = '[a-zA-Z0-9+.-]+:\\/\\/';
      } else {
        schemePart = `${escapeRegexExceptWildcard(scheme)}:\\/\\/`;
      }
    } else {
      // Scheme not provided: allow optional http:// or https://
      schemePart = '(?:https?:\\/\\/)?';
    }

    // Separate host and path
    const slashIndex = pattern.indexOf('/');
    let hostPart = slashIndex === -1 ? pattern : pattern.slice(0, slashIndex);
    const pathPart = slashIndex === -1 ? '' : pattern.slice(slashIndex);

    // Normalize www.
    let allowWww = false;
    if (hostPart.startsWith('www.')) {
      hostPart = hostPart.slice(4);
      allowWww = true;
    } else if (!hostPart.startsWith('*.') && !hostPart.startsWith('*')) {
      allowWww = true;
    }

    // Convert host part
    let hostRegex: string;
    if (hostPart.startsWith('*.')) {
      // Subdomain wildcard: e.g. *.google.com requires at least one subdomain segment
      const domainWithoutWildcard = hostPart.slice(2);
      const escapedDomain = escapeRegexExceptWildcard(domainWithoutWildcard).replace(/\*/g, '[^/:]*');
      hostRegex = `(?:[^/:]+\\.)+${escapedDomain}`;
    } else {
      hostRegex = escapeRegexExceptWildcard(hostPart).replace(/\*/g, '[^/:]*');
    }

    let fullHostRegex: string;
    if (allowWww) {
      fullHostRegex = `(?:www\\.)?${hostRegex}`;
    } else {
      fullHostRegex = hostRegex;
    }

    // Optional port matching
    const portRegex = '(?::\\d+)?';

    // Convert path part
    let fullPathRegex: string;
    if (pathPart) {
      let pathRegex = escapeRegexExceptWildcard(pathPart);
      pathRegex = pathRegex.replace(/\*/g, '.*');
      fullPathRegex = `${pathRegex}(?:[?#].*)?$`;
    } else {
      // No path specified: matches exact host or host with any path/query/hash
      fullPathRegex = '(?:[\\/?#].*)?$';
    }

    const compiled = new RegExp(`^${schemePart}${fullHostRegex}${portRegex}${fullPathRegex}`, 'i');
    // Evict oldest entries if cache is full
    if (RuleEngine.patternCache.size >= RuleEngine.MAX_CACHE_SIZE) {
      const firstKey = RuleEngine.patternCache.keys().next().value;
      if (firstKey !== undefined) {
        RuleEngine.patternCache.delete(firstKey);
      }
    }

    RuleEngine.patternCache.set(trimmed, compiled);
    return compiled;
  }

  /**
   * Tests a single pattern against a given URL.
   */
  public static testPattern(pattern: string, url: string): boolean {
    if (!url || typeof url !== 'string' || !pattern) {
      return false;
    }

    try {
      const regex = RuleEngine.compilePattern(pattern);
      return regex.test(url);
    } catch {
      return false;
    }
  }

  /**
   * Matches a URL against an ordered list of group rules.
   * Returns the first matching rule, or null if no rule matches.
   */
  public static matchUrl(url: string, rules: GroupRule[]): GroupRule | null {
    const detail = RuleEngine.matchUrlWithDetail(url, rules);
    return detail ? detail.rule : null;
  }

  /**
   * Matches a URL against an ordered list of group rules with details.
   */
  public static matchUrlWithDetail(url: string, rules: GroupRule[]): MatchResult | null {
    if (!url || !rules || rules.length === 0) {
      return null;
    }

    // Rules are expected to be pre-sorted by order (ConfigManager.getRules() handles this)
    for (const rule of rules) {
      if (!rule.patterns || rule.patterns.length === 0) {
        continue;
      }

      for (const pattern of rule.patterns) {
        if (RuleEngine.testPattern(pattern, url)) {
          return {
            rule,
            matchedPattern: pattern,
          };
        }
      }
    }

    return null;
  }
}
