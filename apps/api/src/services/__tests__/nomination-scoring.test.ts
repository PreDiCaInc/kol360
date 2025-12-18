import { describe, it, expect } from 'vitest';

/**
 * Tests for nomination scoring logic
 *
 * Per spec: Nomination Matching & Resolution tests
 * - Scoring algorithm for name matching
 * - Alias matching logic
 */

interface HcpWithAliases {
  id: string;
  npi: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
  aliases: Array<{ id: string; aliasName: string }>;
}

interface ScoredHcp {
  hcp: HcpWithAliases;
  score: number;
}

// Extract scoring logic from NominationService for testing
function scoreHcpMatch(hcp: HcpWithAliases, rawNameEntered: string): number {
  const fullName = `${hcp.firstName} ${hcp.lastName}`.toLowerCase();
  const rawName = rawNameEntered.toLowerCase().trim();

  // Exact full name match
  if (fullName === rawName) {
    return 100;
  }

  // Exact alias match
  if (hcp.aliases.some((a) => a.aliasName.toLowerCase() === rawName)) {
    return 95;
  }

  // Full name contains raw name or vice versa
  if (fullName.includes(rawName) || rawName.includes(fullName)) {
    return 85;
  }

  // Last name exact match
  const lastNameFromRaw = rawName.split(' ').pop();
  if (hcp.lastName.toLowerCase() === lastNameFromRaw) {
    return 75;
  }

  // Partial alias match
  if (
    hcp.aliases.some(
      (a) =>
        a.aliasName.toLowerCase().includes(rawName) ||
        rawName.includes(a.aliasName.toLowerCase())
    )
  ) {
    return 70;
  }

  // Multiple name parts match
  const nameParts = rawName.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const matchCount = nameParts.filter(
    (part) =>
      hcp.firstName.toLowerCase().includes(part) ||
      hcp.lastName.toLowerCase().includes(part)
  ).length;

  return Math.min(60, matchCount * 25);
}

describe('Nomination Scoring Logic', () => {
  const createHcp = (overrides: Partial<HcpWithAliases> = {}): HcpWithAliases => ({
    id: 'hcp-1',
    npi: '1234567890',
    firstName: 'John',
    lastName: 'Smith',
    specialty: 'Cardiology',
    city: 'New York',
    state: 'NY',
    aliases: [],
    ...overrides,
  });

  describe('Exact matches', () => {
    it('should return 100 for exact full name match', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'John Smith')).toBe(100);
    });

    it('should return 100 for exact full name match (case insensitive)', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'JOHN SMITH')).toBe(100);
    });

    it('should return 100 with extra whitespace trimmed', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, '  John Smith  ')).toBe(100);
    });
  });

  describe('Alias matches', () => {
    it('should return 95 for exact alias match', () => {
      const hcp = createHcp({
        firstName: 'John',
        lastName: 'Smith',
        aliases: [{ id: 'alias-1', aliasName: 'J. Smith' }],
      });
      expect(scoreHcpMatch(hcp, 'J. Smith')).toBe(95);
    });

    it('should return 95 for exact alias match (case insensitive)', () => {
      const hcp = createHcp({
        firstName: 'John',
        lastName: 'Smith',
        aliases: [{ id: 'alias-1', aliasName: 'Johnny Smith' }],
      });
      expect(scoreHcpMatch(hcp, 'JOHNNY SMITH')).toBe(95);
    });
  });

  describe('Partial matches', () => {
    it('should return 85 when full name contains raw name', () => {
      const hcp = createHcp({ firstName: 'John Robert', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'John')).toBe(85);
    });

    it('should return 85 when raw name contains full name', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'Dr. John Smith MD')).toBe(85);
    });

    it('should return 75 for exact last name match', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'Jane Smith')).toBe(75);
    });

    it('should return 70 for partial alias match', () => {
      const hcp = createHcp({
        firstName: 'John',
        lastName: 'Smith',
        aliases: [{ id: 'alias-1', aliasName: 'John Robert Smith' }],
      });
      expect(scoreHcpMatch(hcp, 'Robert')).toBe(70);
    });
  });

  describe('Multiple name part matches', () => {
    it('should return 25 for single part match', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Williams' });
      expect(scoreHcpMatch(hcp, 'John Doe')).toBe(25);
    });

    it('should return 85 when full name is contained (takes precedence)', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      // 'john smi' contains 'john smith' partially - triggers contains check
      expect(scoreHcpMatch(hcp, 'john smi')).toBe(85);
    });

    it('should return 85 when raw name contains full name', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      // Full name 'john smith' is contained in input
      expect(scoreHcpMatch(hcp, 'john smith extra words')).toBe(85);
    });

    it('should return 0 for no matches', () => {
      const hcp = createHcp({ firstName: 'John', lastName: 'Smith' });
      expect(scoreHcpMatch(hcp, 'Jane Doe')).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in names', () => {
      const hcp = createHcp({ firstName: "O'Brien", lastName: "McDonald" });
      expect(scoreHcpMatch(hcp, "O'Brien McDonald")).toBe(100);
    });

    it('should handle hyphenated names', () => {
      const hcp = createHcp({ firstName: 'Mary', lastName: 'Smith-Jones' });
      expect(scoreHcpMatch(hcp, 'Mary Smith-Jones')).toBe(100);
    });

    it('should handle empty alias array', () => {
      const hcp = createHcp({ aliases: [] });
      expect(scoreHcpMatch(hcp, 'Random Name')).toBeLessThan(95);
    });

    it('should handle multiple aliases', () => {
      const hcp = createHcp({
        firstName: 'John',
        lastName: 'Smith',
        aliases: [
          { id: 'alias-1', aliasName: 'J. Smith' },
          { id: 'alias-2', aliasName: 'Johnny' },
          { id: 'alias-3', aliasName: 'Jack Smith' },
        ],
      });
      expect(scoreHcpMatch(hcp, 'Jack Smith')).toBe(95);
    });
  });

  describe('Score sorting', () => {
    it('should correctly rank results by score', () => {
      const hcps = [
        createHcp({ id: '1', firstName: 'John', lastName: 'Smith' }),
        createHcp({ id: '2', firstName: 'Jane', lastName: 'Smith' }),
        createHcp({
          id: '3',
          firstName: 'James',
          lastName: 'Smith',
          aliases: [{ id: 'a', aliasName: 'John Smith' }],
        }),
      ];

      const searchName = 'John Smith';
      const scored = hcps.map((hcp) => ({
        hcp,
        score: scoreHcpMatch(hcp, searchName),
      }));

      scored.sort((a, b) => b.score - a.score);

      // Exact match should be first
      expect(scored[0].hcp.id).toBe('1');
      expect(scored[0].score).toBe(100);

      // Alias match second
      expect(scored[1].hcp.id).toBe('3');
      expect(scored[1].score).toBe(95);

      // Last name match third
      expect(scored[2].hcp.id).toBe('2');
      expect(scored[2].score).toBe(75);
    });
  });
});

describe('Name Parsing', () => {
  const parseNameParts = (rawName: string): string[] => {
    return rawName
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  };

  it('should parse simple names', () => {
    expect(parseNameParts('John Smith')).toEqual(['john', 'smith']);
  });

  it('should handle multiple spaces', () => {
    expect(parseNameParts('John   Smith')).toEqual(['john', 'smith']);
  });

  it('should remove special characters', () => {
    expect(parseNameParts("O'Brien McDonald")).toEqual(['obrien', 'mcdonald']);
  });

  it('should handle titles and suffixes', () => {
    expect(parseNameParts('Dr. John Smith, MD')).toEqual(['dr', 'john', 'smith', 'md']);
  });

  it('should handle empty string', () => {
    expect(parseNameParts('')).toEqual([]);
  });

  it('should handle only special characters', () => {
    expect(parseNameParts('!@#$%')).toEqual([]);
  });
});
