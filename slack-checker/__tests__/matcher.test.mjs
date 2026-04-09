import {
  normalizeName,
  stripNoiseWords,
  levenshtein,
  similarity,
  parseRosterName,
  scoreMatch,
  matchNames,
  MIN_CONFIDENCE,
} from '../matcher.mjs';

describe('Helper Functions', () => {
  describe('normalizeName()', () => {
    test('converts to lowercase', () => {
      expect(normalizeName('John DOE')).toBe('john doe');
    });

    test('trims whitespace', () => {
      expect(normalizeName('  john doe  ')).toBe('john doe');
    });

    test('collapses multiple spaces', () => {
      expect(normalizeName('john   doe')).toBe('john doe');
    });

    test('removes periods and commas', () => {
      expect(normalizeName('John D., Jr.')).toBe('john d jr');
    });

    test('handles combined normalization', () => {
      expect(normalizeName('  JOHN   D.  DOE,  ')).toBe('john d doe');
    });
  });

  describe('stripNoiseWords()', () => {
    test('removes [Confidential]', () => {
      expect(stripNoiseWords('John Doe [Confidential]')).toBe('John Doe');
    });

    test('removes Confidential without brackets', () => {
      expect(stripNoiseWords('John Doe Confidential')).toBe('John Doe');
    });

    test('removes Mr.', () => {
      expect(stripNoiseWords('Mr. John Doe')).toBe('John Doe');
    });

    test('removes Ms.', () => {
      expect(stripNoiseWords('Ms. Jane Doe')).toBe('Jane Doe');
    });

    test('removes Mrs.', () => {
      expect(stripNoiseWords('Mrs. Jane Doe')).toBe('Jane Doe');
    });

    test('removes Dr.', () => {
      expect(stripNoiseWords('Dr. John Smith')).toBe('John Smith');
    });

    test('handles multiple noise words', () => {
      expect(stripNoiseWords('Mr. Ben Raphael Piperno [CONFIDENTIAL]')).toBe('Ben Raphael Piperno');
    });

    test('collapses extra spaces after removal', () => {
      expect(stripNoiseWords('Ms.  Nina  Jordan')).toBe('Nina Jordan');
    });
  });

  describe('levenshtein()', () => {
    test('returns 0 for identical strings', () => {
      expect(levenshtein('hello', 'hello')).toBe(0);
    });

    test('returns length for completely different strings', () => {
      expect(levenshtein('abc', 'xyz')).toBe(3);
    });

    test('calculates single character difference', () => {
      expect(levenshtein('cat', 'bat')).toBe(1);
    });

    test('calculates insertion distance', () => {
      expect(levenshtein('cat', 'cats')).toBe(1);
    });

    test('calculates deletion distance', () => {
      expect(levenshtein('cats', 'cat')).toBe(1);
    });

    test('handles empty strings', () => {
      expect(levenshtein('', 'abc')).toBe(3);
      expect(levenshtein('abc', '')).toBe(3);
      expect(levenshtein('', '')).toBe(0);
    });
  });

  describe('similarity()', () => {
    test('returns 100 for identical strings', () => {
      expect(similarity('john doe', 'john doe')).toBe(100);
    });

    test('returns 100 for empty strings', () => {
      expect(similarity('', '')).toBe(100);
    });

    test('returns 0 for completely different strings', () => {
      expect(similarity('abc', 'xyz')).toBe(0);
    });

    test('returns ~50% for half-similar strings', () => {
      const score = similarity('abcd', 'abxy');
      expect(score).toBeGreaterThanOrEqual(45);
      expect(score).toBeLessThanOrEqual(55);
    });

    test('returns proportional scores', () => {
      const score1 = similarity('john', 'johx');
      const score2 = similarity('john', 'joxx');
      expect(score1).toBeGreaterThan(score2);
    });
  });
});

describe('Name Parsing', () => {
  describe('parseRosterName()', () => {
    test('parses "LastName, FirstName" format', () => {
      const result = parseRosterName('Doe, John');
      expect(result.firstName).toBe('john');
      expect(result.lastName).toBe('doe');
      expect(result.original).toBe('Doe, John');
    });

    test('parses "LastName, FirstName M." format with middle initial', () => {
      const result = parseRosterName('Doe, John M.');
      expect(result.firstName).toBe('john');
      expect(result.lastName).toBe('doe');
      expect(result.middleInitial).toBe('m');
    });

    test('parses long middle names', () => {
      const result = parseRosterName('Juvvala, Kunal Tushaar Satya Sai Kartikeya');
      expect(result.firstName).toBe('kunal');
      expect(result.lastName).toBe('juvvala');
      expect(result.middleNames).toContain('tushaar');
      expect(result.middleNames).toContain('satya');
    });

    test('strips noise words before parsing', () => {
      const result = parseRosterName('Mr. Ben Raphael Piperno [CONFIDENTIAL]');
      expect(result.normalized).toContain('ben');
      expect(result.normalized).not.toContain('mr');
      expect(result.normalized).not.toContain('confidential');
    });

    test('handles non-standard format (no comma)', () => {
      const result = parseRosterName('John Michael Doe');
      expect(result.firstName).toBe('john');
      expect(result.lastName).toBe('doe');
      expect(result.allParts).toContain('michael');
    });

    test('generates multiple formats for matching', () => {
      const result = parseRosterName('Doe, John');
      expect(result.formats).toContain('john doe');
      expect(result.formats).toContain('doe john');
    });
  });
});

describe('Matching Logic', () => {
  describe('scoreMatch()', () => {
    test('returns 100 for exact matches', () => {
      const parsed = parseRosterName('Doe, John');
      expect(scoreMatch('john doe', parsed)).toBe(100);
    });

    test('returns 100 for exact match with last-first format', () => {
      const parsed = parseRosterName('Doe, John');
      expect(scoreMatch('doe john', parsed)).toBe(100);
    });

    test('returns 100 for first + last name matching format exactly', () => {
      const parsed = parseRosterName('Piperno, Ben Raphael');
      const score = scoreMatch('Ben Piperno', parsed);
      // Matches "firstName lastName" format exactly
      expect(score).toBe(100);
    });

    test('returns high score when all Slack parts found in roster', () => {
      const parsed = parseRosterName('Juvvala, Kunal Tushaar Satya Sai Kartikeya');
      const score = scoreMatch('Kunal Juvvala', parsed);
      // Matches "firstName lastName" format exactly
      expect(score).toBe(100);
    });

    test('returns 100 for single-word Slack name matching first name format', () => {
      const parsed = parseRosterName('Doe, John');
      const score = scoreMatch('John', parsed);
      // "john" is in formats array, so exact match
      expect(score).toBe(100);
    });

    test('returns 100 for single-word Slack name matching last name format', () => {
      const parsed = parseRosterName('Doe, Jonathan');
      const score = scoreMatch('Jonathan', parsed);
      // "jonathan" is in formats array
      expect(score).toBe(100);
    });

    test('boosts score when first name matches exactly', () => {
      const parsed = parseRosterName('Smith, Alexander');
      const scoreWithFirstName = scoreMatch('Alexander S', parsed);
      const scoreWithoutFirstName = scoreMatch('Alex S', parsed);
      expect(scoreWithFirstName).toBeGreaterThan(scoreWithoutFirstName);
    });

    test('boosts score when last name matches exactly', () => {
      const parsed = parseRosterName('Smith, John');
      const scoreWithLastName = scoreMatch('J Smith', parsed);
      const scoreWithoutLastName = scoreMatch('J Smyth', parsed);
      expect(scoreWithLastName).toBeGreaterThan(scoreWithoutLastName);
    });
  });
});

describe('Integration', () => {
  describe('matchNames()', () => {
    const testRoster = [
      'Piperno, Ben Raphael',
      'Juvvala, Kunal Tushaar Satya Sai Kartikeya',
      'Jordan, Nina',
      'Doe, John',
      'Smith, Jane Elizabeth',
    ];

    test('returns matched and unmatched arrays', () => {
      const result = matchNames(['Ben Piperno', 'xyz123'], testRoster);
      expect(result).toHaveProperty('matched');
      expect(result).toHaveProperty('unmatched');
      expect(Array.isArray(result.matched)).toBe(true);
      expect(Array.isArray(result.unmatched)).toBe(true);
    });

    test('matches high-confidence names correctly', () => {
      const result = matchNames(['Ben Piperno'], testRoster);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].rosterName).toBe('Piperno, Ben Raphael');
      expect(result.matched[0].confidence).toBeGreaterThanOrEqual(90);
    });

    test('matches names with complex middle names', () => {
      const result = matchNames(['Kunal Juvvala'], testRoster);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].rosterName).toBe('Juvvala, Kunal Tushaar Satya Sai Kartikeya');
    });

    test('matches exact first-last combinations', () => {
      const result = matchNames(['Nina Jordan'], testRoster);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].rosterName).toBe('Jordan, Nina');
    });

    test('matches single-word names when unique', () => {
      const result = matchNames(['John'], testRoster);
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].rosterName).toBe('Doe, John');
      expect(result.matched[0].confidence).toBe(100);
    });

    test('does not match gibberish names', () => {
      const result = matchNames(['xyz123', 'qwerty'], testRoster);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toContain('xyz123');
      expect(result.unmatched).toContain('qwerty');
    });

    test('respects minimum confidence threshold', () => {
      const result = matchNames(['xyzabc'], testRoster);
      expect(result.unmatched).toContain('xyzabc');
    });

    test('sorts matched by confidence (highest first)', () => {
      const result = matchNames(['Nina Jordan', 'John'], testRoster);
      expect(result.matched.length).toBeGreaterThanOrEqual(2);
      expect(result.matched[0].confidence).toBeGreaterThanOrEqual(result.matched[1].confidence);
    });

    test('handles empty slack names array', () => {
      const result = matchNames([], testRoster);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toHaveLength(0);
    });

    test('handles empty roster', () => {
      const result = matchNames(['John Doe'], []);
      expect(result.matched).toHaveLength(0);
      expect(result.unmatched).toContain('John Doe');
    });
  });

  describe('MIN_CONFIDENCE', () => {
    test('is set to 70', () => {
      expect(MIN_CONFIDENCE).toBe(70);
    });
  });
});

describe('Edge Cases from Plan', () => {
  const rosterWithNoise = [
    'Mr. Ben Raphael Piperno [CONFIDENTIAL]',
    'Juvvala, Kunal Tushaar Satya Sai Kartikeya',
    'Ms. Nina Jordan',
    'Doe, John',
  ];

  test('Ben Piperno matches Mr. Ben Raphael Piperno [CONFIDENTIAL]', () => {
    const result = matchNames(['Ben Piperno'], rosterWithNoise);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].rosterName).toBe('Mr. Ben Raphael Piperno [CONFIDENTIAL]');
    expect(result.matched[0].confidence).toBeGreaterThanOrEqual(90);
  });

  test('Kunal Juvvala matches Juvvala, Kunal Tushaar Satya Sai Kartikeya', () => {
    const result = matchNames(['Kunal Juvvala'], rosterWithNoise);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].rosterName).toBe('Juvvala, Kunal Tushaar Satya Sai Kartikeya');
    expect(result.matched[0].confidence).toBeGreaterThanOrEqual(90);
  });

  test('Nina Jordan matches Ms. Nina Jordan', () => {
    const result = matchNames(['Nina Jordan'], rosterWithNoise);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].rosterName).toBe('Ms. Nina Jordan');
  });

  test('John matches Doe, John with 100% confidence (exact format match)', () => {
    const result = matchNames(['John'], rosterWithNoise);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].rosterName).toBe('Doe, John');
    expect(result.matched[0].confidence).toBe(100);
  });

  test('xyz123 does not match anyone', () => {
    const result = matchNames(['xyz123'], rosterWithNoise);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toContain('xyz123');
  });
});
