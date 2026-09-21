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

    it('accepts valid domain patterns', () => {
      expect(RuleEngine.validatePattern('google.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*.google.com').isValid).toBe(true);
      expect(RuleEngine.validatePattern('github.com/myorg/*').isValid).toBe(true);
      expect(RuleEngine.validatePattern('*://*/settings').isValid).toBe(true);
      expect(RuleEngine.validatePattern('192.168.1.*').isValid).toBe(true);
    });
  });

  describe('testPattern', () => {
    describe('domain pattern: google.com', () => {
      const pattern = 'google.com';

      it('matches http and https URLs', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'http://google.com')).toBe(true);
      });

      it('matches with www prefix', () => {
        expect(RuleEngine.testPattern(pattern, 'https://www.google.com')).toBe(true);
      });

      it('matches with paths and query strings', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com/search?q=test')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://google.com?q=test')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://google.com#top')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://www.google.com/maps')).toBe(true);
      });

      it('matches with custom ports', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com:8080/foo')).toBe(true);
      });

      it('does not match lookalike domains', () => {
        expect(RuleEngine.testPattern(pattern, 'https://notgoogle.com')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://google.com.attacker.com')).toBe(false);
      });
    });

    describe('subdomain wildcard pattern: *.google.com', () => {
      const pattern = '*.google.com';

      it('matches single and nested subdomains', () => {
        expect(RuleEngine.testPattern(pattern, 'https://mail.google.com')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://docs.google.com/doc/123')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://sub.sub.google.com/')).toBe(true);
      });

      it('does not match exact apex domain without subdomain', () => {
        expect(RuleEngine.testPattern(pattern, 'https://google.com')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://google.com/search')).toBe(false);
      });

      it('does not match unrelated domains', () => {
        expect(RuleEngine.testPattern(pattern, 'https://notgoogle.com')).toBe(false);
      });
    });

    describe('path wildcard pattern: github.com/myorg/*', () => {
      const pattern = 'github.com/myorg/*';

      it('matches paths under the specified folder', () => {
        expect(RuleEngine.testPattern(pattern, 'https://github.com/myorg/repo1')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://github.com/myorg/repo2/issues')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'https://www.github.com/myorg/repo1')).toBe(true);
      });

      it('does not match different paths on the same domain', () => {
        expect(RuleEngine.testPattern(pattern, 'https://github.com/other/repo')).toBe(false);
        expect(RuleEngine.testPattern(pattern, 'https://github.com/myorg')).toBe(false);
      });
    });

    describe('scheme and domain wildcard pattern: *://*/settings', () => {
      const pattern = '*://*/settings';

      it('matches any scheme and domain with exact path /settings', () => {
        expect(RuleEngine.testPattern(pattern, 'https://any.site/settings')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'http://foo.com/settings')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'http://foo.com/settings?tab=1')).toBe(true);
      });

      it('does not match sub-paths under /settings', () => {
        expect(RuleEngine.testPattern(pattern, 'https://foo.com/settings/advanced')).toBe(false);
      });
    });

    describe('IP wildcard pattern: 192.168.1.*', () => {
      const pattern = '192.168.1.*';

      it('matches IPs in subnet with any port or path', () => {
        expect(RuleEngine.testPattern(pattern, 'http://192.168.1.1:8080/page')).toBe(true);
        expect(RuleEngine.testPattern(pattern, 'http://192.168.1.254/')).toBe(true);
      });

      it('does not match different subnets', () => {
        expect(RuleEngine.testPattern(pattern, 'http://192.168.2.1')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('returns false for empty or non-string URLs', () => {
        expect(RuleEngine.testPattern('google.com', '')).toBe(false);
        expect(RuleEngine.testPattern('google.com', null as any)).toBe(false);
        expect(RuleEngine.testPattern('google.com', undefined as any)).toBe(false);
      });

      it('handles case-insensitivity', () => {
        expect(RuleEngine.testPattern('GOOGLE.COM', 'https://google.com')).toBe(true);
        expect(RuleEngine.testPattern('google.com', 'HTTPS://GOOGLE.COM/TEST')).toBe(true);
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
      },
      {
        id: 'rule-github-work',
        name: 'GitHub Work',
        color: 'purple',
        patterns: ['github.com/myorg/*'],
        collapse: { enabled: false, timeoutMs: null },
        order: 0, // Higher priority due to lower order number
      },
      {
        id: 'rule-github-general',
        name: 'GitHub',
        color: 'grey',
        patterns: ['github.com'],
        collapse: { enabled: true, timeoutMs: 15000 },
        order: 2,
      },
    ];

    it('matches rule with highest priority (lower order value)', () => {
      const result = RuleEngine.matchUrlWithDetail('https://github.com/myorg/project', rules);
      expect(result).not.toBeNull();
      expect(result!.rule.id).toBe('rule-github-work');
      expect(result!.matchedPattern).toBe('github.com/myorg/*');
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
  });
});
