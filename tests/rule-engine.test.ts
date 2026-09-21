import { RuleEngine } from '../src/core/rule-engine';
import { GroupRule } from '../src/types/rules';

describe('RuleEngine', () => {
  beforeEach(() => {
    RuleEngine.clearCache();
  });

  describe('validatePattern', () => {
    it('rejects empty or whitespace pattern', () => {
      expect(RuleEngine.validatePattern('').isValid).toBe(false);
      expect(RuleEngine.validatePattern('   ').isValid).toBe(false);
    });

    it('rejects malformed dot-prefixed and incomplete patterns', () => {
      expect(RuleEngine.validatePattern('.com').isValid).toBe(false);
      expect(RuleEngine.validatePattern('.org').isValid).toBe(false);
      expect(RuleEngine.validatePattern('.').isValid).toBe(false);
      expect(RuleEngine.validatePattern('*.').isValid).toBe(false);
      expect(RuleEngine.validatePattern('http://').isValid).toBe(false);
      expect(RuleEngine.validatePattern('https://').isValid).toBe(false);
    });

    it('accepts valid domain and wildcard patterns', () => {
      expect(RuleEngine.validatePattern('google.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('www.google.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*.google.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*').isValid).toBe(true);
      expect(RuleEngine.validatePattern('google.co.uk').isValid).toBe(true);
      expect(RuleEngine.validatePattern('localhost:3000').isValid).toBe(true);
      expect(RuleEngine.validatePattern('127.0.0.1:8080').isValid).toBe(true);
      expect(RuleEngine.validatePattern('github.com/myorg/*').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*://*/settings').isValid).toBe(true);
      expect(RuleEngine.validatePattern('192.168.1.*').isValid).toBe(true);
    });
  });

  describe('testPattern', () => {
    describe('domain pattern: google.com vs www.google.com vs *.google.com', () => {
      const patternApex = 'google.com';
      const patternWww = 'www.google.com';
      const patternWildcard = '*.google.com';
      const patternSubdomain = 'mail.google.com';

      it('matches apex domain, www, and subdomains identically for google.com, www.google.com, and *.google.com', () => {
        const testUrls = [
          'https://google.com',
          'http://google.com',
          'https://www.google.com',
          'http://www.google.com',
          'https://mail.google.com',
          'https://docs.google.com',
          'https://drive.google.com',
          'https://sub.mail.google.com',
          'https://google.com/search?q=test',
          'https://google.com:8080/foo#anchor',
        ];

        for (const url of testUrls) {
          expect(RuleEngine.testPattern(patternApex, url)).toBe(true);
          expect(RuleEngine.testPattern(patternWww, url)).toBe(true);
          expect(RuleEngine.testPattern(patternWildcard, url)).toBe(true);
        }
      });

      it('matches specific subdomain rules only for that subdomain', () => {
        expect(RuleEngine.testPattern(patternSubdomain, 'https://mail.google.com')).toBe(true);
        expect(RuleEngine.testPattern(patternSubdomain, 'https://sub.mail.google.com')).toBe(true);
        expect(RuleEngine.testPattern(patternSubdomain, 'https://google.com')).toBe(false);
        expect(RuleEngine.testPattern(patternSubdomain, 'https://docs.google.com')).toBe(false);
        expect(RuleEngine.testPattern(patternSubdomain, 'https://www.google.com')).toBe(false);
      });

      it('does not match lookalike, suffix, or phishing domains', () => {
        const lookalikes = [
          'https://notgoogle.com',
          'https://google.com.attacker.com',
          'https://google.com.org',
          'https://evil-google.com',
          'https://google.com-phishing.com',
          'https://fakegoogle.com',
        ];

        for (const url of lookalikes) {
          expect(RuleEngine.testPattern(patternApex, url)).toBe(false);
          expect(RuleEngine.testPattern(patternWww, url)).toBe(false);
          expect(RuleEngine.testPattern(patternWildcard, url)).toBe(false);
        }
      });
    });

    describe('TLD wildcard pattern: *.com', () => {
      const pattern = '*.com';

      it('matches any .com domain and subdomains', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://github.com/repo')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://sub.domain.com:8080')).toBe(true);
      });

      it('does not match non-.com domains', () => {
        expect(RuleEngine.testPattern(pattern, 'https://example.org')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://site.net')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://google.co.uk')).toBe(false);
      });
    });

    describe('multi-part country code TLDs: google.co.uk', () => {
      const pattern = 'google.co.uk';

      it('matches apex and subdomains of multi-part TLD', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.co.uk')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://www.google.co.uk')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://maps.google.co.uk/page')).toBe(true);
      });

      it('does not match different TLDs for the same brand', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://google.ca')).toBe(false);
      });
    });

    describe('localhost and IP patterns', () => {
      it('matches localhost with and without ports', () => {
        expect(RuleEngine.testPattern('localhost', 'http://localhost')).toBe(true);
        expect(RuleEngine.testPattern('localhost', 'http://localhost:3000/api')).toBe(true);
        expect(RuleEngine.testPattern('localhost:3000', 'http://localhost:3000/api')).toBe(true);
        expect(RuleEngine.testPattern('localhost:3000', 'http://localhost:8080/api')).toBe(false);
      });

      it('matches exact IP addresses and ports', () => {
        expect(RuleEngine.testPattern('127.0.0.1:8080', 'http://127.0.0.1:8080/app')).toBe(true);
        expect(RuleEngine.testPattern('127.0.0.1:8080', 'http://127.0.0.1:3000/app')).toBe(false);
      });
    });

    describe('path and query patterns', () => {
      it('matches path wildcards ignoring query params and anchors', () => {
        const pattern = 'github.com/myorg/*';
        expect(RuleEngine.testPattern(pattern, 'https://github.com/myorg/repo1?tab=readme#heading')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://github.com/otherorg/repo1')).toBe(false);
      });

      it('matches exact path with trailing slash flexibly', () => {
        expect(RuleEngine.testPattern('google.com/', 'https://google.com')).toBe(true);
        expect(RuleEngine.testPattern('google.com/', 'https://google.com/')).toBe(true);
        expect(RuleEngine.testPattern('google.com/', 'https://google.com/search')).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('returns false for empty or non-string URLs', () => {
        expect(RuleEngine.testPattern('google.com', '')).toBe(false);
        expect(RuleEngine.testPattern('google.com', null as any)).toBe(false);
        expect(RuleEngine.testPattern('google.com', undefined as any)).toBe(false);
      });

      it('handles case-insensitivity on patterns and URLs', () => {
        expect(RuleEngine.testPattern('GOOGLE.COM', 'https://google.com')).toBe(true);
        expect(RuleEngine.testPattern('google.com', 'HTTPS://GOOGLE.COM/TEST')).toBe(true);
        expect(RuleEngine.testPattern('GoOgLe.CoM', 'https://wWw.gOoGlE.cOm/SeArCh')).toBe(true);
      });

      it('handles leading and trailing whitespace in patterns', () => {
        expect(RuleEngine.testPattern('   google.com   ', 'https://google.com')).toBe(true);
      });
    });
  });

  describe('matchUrl and matchUrlWithDetail', () => {
    const rules: GroupRule[] = [
      {
        id: 'rule-google',
        name: 'Google',
        color: 'blue',
        patterns: ['*.google.com', 'google.com'],
        collapse: { enabled: true, timeoutMs: 30000 },
        order: 1,
        priority: 2,
      },
      {
        id: 'rule-github-work',
        name: 'GitHub Work',
        color: 'purple',
        patterns: ['github.com/myorg/*'],
        collapse: { enabled: false, timeoutMs: null },
        order: 0,
        priority: 1, // Higher priority due to lower priority number
      },
      {
        id: 'rule-github-general',
        name: 'GitHub',
        color: 'grey',
        patterns: ['github.com'],
        collapse: { enabled: true, timeoutMs: 15000 },
        order: 2,
        priority: 3,
      },
    ];

    it('matches rule with highest priority (lower priority value)', () => {
      const result = RuleEngine.matchUrlWithDetail('https://github.com/myorg/project', rules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-github-work');
      expect(result!.matchedPattern).toBe('github.com/myorg/*');
    });

    it('evaluates by rule.priority even if rules array is unsorted', () => {
      // Pass rules in reverse order: general (priority 3) before work (priority 1)
      const reversedRules = [rules[2], rules[0], rules[1]];
      const result = RuleEngine.matchUrlWithDetail('https://github.com/myorg/project', reversedRules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-github-work');
    });

    it('evaluates by priority even when lower-priority rule has a lower tab strip order', () => {
      const decoupledRules: GroupRule[] = [
        {
          id: 'rule-general',
          name: 'General GitHub',
          color: 'grey',
          patterns: ['github.com/*'],
          collapse: { enabled: true, timeoutMs: null },
          order: 0, // Appears first in tab strip
          priority: 2, // Evaluated second
        },
        {
          id: 'rule-specific',
          name: 'Org Specific',
          color: 'purple',
          patterns: ['github.com/myorg/*'],
          collapse: { enabled: true, timeoutMs: null },
          order: 5, // Appears sixth in tab strip
          priority: 1, // Evaluated first
        },
      ];

      const result = RuleEngine.matchUrlWithDetail('https://github.com/myorg/repo', decoupledRules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-specific');
    });

    it('falls back to order tie-breaking when rules have the same priority', () => {
      const tiedRules: GroupRule[] = [
        {
          id: 'rule-second',
          name: 'Second',
          color: 'blue',
          patterns: ['example.com/*'],
          collapse: { enabled: true, timeoutMs: null },
          order: 1,
          priority: 1,
        },
        {
          id: 'rule-first',
          name: 'First',
          color: 'green',
          patterns: ['example.com/*'],
          collapse: { enabled: true, timeoutMs: null },
          order: 0,
          priority: 1,
        },
      ];

      const result = RuleEngine.matchUrlWithDetail('https://example.com/page', tiedRules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-first');
    });

    it('falls back to lower priority rule when higher priority does not match', () => {
      const result = RuleEngine.matchUrlWithDetail('https://github.com/other-user/repo', rules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-github-general');
    });

    it('matches when secondary pattern in a rule matches', () => {
      const matchSubdomain = RuleEngine.matchUrl('https://mail.google.com', rules);
      expect(matchSubdomain?.id).toBe('rule-google');

      const matchApex = RuleEngine.matchUrl('https://google.com/search', rules);
      expect(matchApex?.id).toBe('rule-google');
    });

    it('returns null when no rule matches', () => {
      expect(RuleEngine.matchUrl('https://reddit.com', rules)).toBeNull();
      expect(RuleEngine.matchUrlWithDetail('https://reddit.com', rules)).toBeNull();
    });

    it('returns null for empty url or empty rules', () => {
      expect(RuleEngine.matchUrl('', rules)).toBeNull();
      expect(RuleEngine.matchUrl('https://google.com', [])).toBeNull();
    });

    describe('Fallback rule matching', () => {
      const fallbackRule: GroupRule = {
        id: 'catch-all-fallback',
        name: 'General',
        color: 'grey',
        patterns: [],
        collapse: { enabled: true, timeoutMs: null },
        order: 0,
        priority: 1,
        isFallback: true,
        evaluateLast: true,
      };

      const specificRule: GroupRule = {
        id: 'rule-specific',
        name: 'Work',
        color: 'blue',
        patterns: ['github.com/*'],
        collapse: { enabled: true, timeoutMs: null },
        order: 1,
        priority: 10, // Numerically lower priority than fallback's priority=1, but evaluateLast=true
      };

      it('evaluates fallback rule last when evaluateLast is true, even with priority 1 and order 0', () => {
        const testRules = [fallbackRule, specificRule];
        // Matches specificRule because fallback is evaluated last
        const matchSpecific = RuleEngine.matchUrlWithDetail('https://github.com/myorg', testRules);
        expect(matchSpecific).not.toBeNull();
        expect(matchSpecific!.rule.id).toBe('rule-specific');

        // Matches fallback for non-matching URLs
        const matchFallback = RuleEngine.matchUrlWithDetail('https://random.com', testRules);
        expect(matchFallback).not.toBeNull();
        expect(matchFallback!.rule.id).toBe('catch-all-fallback');
        expect(matchFallback!.matchedPattern).toBe('*');
      });

      it('evaluates fallback rule by numeric priority when evaluateLast is false', () => {
        const customPriorityFallback: GroupRule = {
          ...fallbackRule,
          evaluateLast: false,
          priority: 1, // Highest priority!
        };

        const testRules = [customPriorityFallback, specificRule];
        // Now fallback matches first because priority 1 beats priority 10
        const result = RuleEngine.matchUrlWithDetail('https://github.com/myorg', testRules);
        expect(result).not.toBeNull();
        expect(result!.rule.id).toBe('catch-all-fallback');
      });
    });
  });
});
