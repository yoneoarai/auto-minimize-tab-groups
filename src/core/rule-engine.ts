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

    if (trimmed.startsWith('.') || trimmed === '*.' || trimmed === '.') {
      throw new Error(`Invalid pattern "${trimmed}": domain pattern cannot start with a dot.`);
    }

    if (trimmed.endsWith('://')) {
      throw new Error(`Invalid pattern "${trimmed}": must specify a host after the scheme.`);
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

    // Normalize leading wildcard *. or www.
    let cleanHost = hostPart;
    if (cleanHost.startsWith('*.')) {
      cleanHost = cleanHost.slice(2);
    }
    if (cleanHost.startsWith('www.')) {
      cleanHost = cleanHost.slice(4);
    }

    // Convert host part
    let hostRegex: string;
    if (hostPart.startsWith('*') && !hostPart.startsWith('*.')) {
      // General prefix wildcard like *internal*
      hostRegex = escapeRegexExceptWildcard(hostPart).replace(/\*/g, '[^/:]*');
    } else {
      // Standard domain or wildcard domain (e.g. "google.com" or "*.google.com"):
      // Matches apex domain, www., and all subdomains (e.g. mail.google.com) identically
      const escapedDomain = escapeRegexExceptWildcard(cleanHost).replace(/\*/g, '[^/:]*');
      hostRegex = `(?:[^/:]+\\.)*${escapedDomain}`;
    }

    const fullHostRegex = hostRegex;

    // Optional port matching
    const portRegex = '(?::\\d+)?';

    // Convert path part
    let fullPathRegex: string;
    if (pathPart && pathPart !== '/') {
      let pathRegex = escapeRegexExceptWildcard(pathPart);
      pathRegex = pathRegex.replace(/\*/g, '.*');
      fullPathRegex = `${pathRegex}(?:[?#].*)?$`;
    } else {
      // No path specified or single trailing slash: matches exact host or host with any path/query/hash
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

    // Rules are evaluated strictly by ascending priority (Priority 1 first).
    // If a rule is marked as isFallback:
    //   - If evaluateLast !== false, its priority is treated as Infinity (evaluated after all normal pattern rules).
    //   - Otherwise, its configured numeric priority is used.
    // If priorities are equal, ties are broken by ascending tab strip order.
    const getEffectivePriority = (rule: GroupRule): number => {
      if (rule.isFallback && rule.evaluateLast !== false) {
        return Infinity;
      }
      return typeof rule.priority === 'number' ? rule.priority : (rule.order ?? 0) + 1;
    };

    const sortedRules = [...rules].sort((a, b) => {
      const prioA = getEffectivePriority(a);
      const prioB = getEffectivePriority(b);
      if (prioA !== prioB) {
        return prioA - prioB;
      }
      return (a.order ?? 0) - (b.order ?? 0);
    });

    for (const rule of sortedRules) {
      if (rule.isFallback) {
        return {
          rule,
          matchedPattern: '*',
        };
      }

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
