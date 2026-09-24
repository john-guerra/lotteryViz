import { classes } from "../front/src/students.mjs";

/**
 * Load student roster for a given course
 * @param {string} course - Course name (e.g., "webdev_spring_2026")
 * @returns {string[]} - Array of student names
 */
export function loadStudentRoster(course) {
  const roster = classes[course]?.roster;
  if (!roster) {
    const availableCourses = Object.keys(classes).join(", ");
    throw new Error(
      `Course "${course}" not found. Available courses: ${availableCourses}`
    );
  }
  return roster;
}

/**
 * Get list of available courses
 * @returns {string[]} - Array of course names
 */
export function getAvailableCourses() {
  return Object.keys(classes);
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score (0-100) between two strings
 */
export function similarity(a, b) {
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  const distance = levenshtein(a, b);
  return Math.round((1 - distance / maxLen) * 100);
}

/**
 * Normalize a name for comparison
 * @param {string} name - Name to normalize
 * @returns {string} - Lowercase, trimmed, simplified name
 */
export function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, ""); // Remove periods and commas
}

/**
 * Strip noise words from roster names (Confidential, honorifics, etc.)
 * @param {string} name - Name to clean
 * @returns {string} - Cleaned name
 */
export function stripNoiseWords(name) {
  return name
    .replace(/\[?Confidential\]?/gi, "")
    .replace(/\b(Mrs|Ms|Mr|Dr)\.?\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract name parts from a roster name (format: "LastName, FirstName M.")
 * @param {string} rosterName - Name from roster
 * @returns {object} - Various name representations
 */
export function parseRosterName(rosterName) {
  // Strip noise words first
  const cleanedName = stripNoiseWords(rosterName);
  const normalized = normalizeName(cleanedName);
  const parts = normalized.split(" ");

  // Handle "LastName, FirstName M." format
  const commaIndex = cleanedName.indexOf(",");
  if (commaIndex > 0) {
    const lastName = normalizeName(cleanedName.slice(0, commaIndex));
    const rest = normalizeName(cleanedName.slice(commaIndex + 1));
    const restParts = rest.split(" ").filter((p) => p.length > 0);
    const firstName = restParts[0] || "";
    // Store all middle names for matching
    const middleNames = restParts.slice(1).filter((p) => p.length > 1);
    const middleInitial = restParts[1]?.replace(".", "") || "";

    return {
      original: rosterName.trim(),
      normalized,
      firstName,
      lastName,
      middleInitial,
      middleNames,
      // All name parts for reverse matching
      allParts: [firstName, lastName, ...middleNames].filter((p) => p.length > 1),
      // Various formats for matching
      formats: [
        normalized, // "doe john m"
        `${firstName} ${lastName}`, // "john doe"
        `${lastName} ${firstName}`, // "doe john"
        firstName, // "john"
        lastName, // "doe"
        `${firstName} ${lastName[0]}`, // "john d"
        `${firstName[0]} ${lastName}`, // "j doe"
        `${firstName}${lastName}`, // "johndoe"
        `${lastName}${firstName}`, // "doejohn"
      ].filter((f) => f && f.length > 1),
    };
  }

  // Fallback for non-standard formats
  return {
    original: rosterName.trim(),
    normalized,
    firstName: parts[0] || "",
    lastName: parts[parts.length - 1] || "",
    middleInitial: "",
    middleNames: parts.slice(1, -1),
    allParts: parts.filter((p) => p.length > 1),
    formats: [normalized, ...parts.filter((p) => p.length > 1)],
  };
}

/** `phrase` (one or more words) appears in `name` as whole words. */
function hasWords(name, phrase) {
  return Boolean(phrase) && ` ${name} `.includes(` ${phrase} `);
}

/**
 * Score how well a Slack name matches a roster entry
 * @returns {number} - Score 0-100 (higher is better)
 */
export function scoreMatch(slackName, rosterParsed) {
  const slack = normalizeName(slackName);
  const slackParts = slack.split(" ").filter((p) => p.length > 1);
  // Unfiltered, for the rule that needs the one-letter initial in "Maria L."
  const slackWords = slack.split(" ").filter(Boolean);

  // Exact match with any format
  for (const format of rosterParsed.formats) {
    if (slack === format) return 100;
  }

  // Check if Slack name contains first AND last name (high confidence)
  // This handles "Ben Piperno" matching "Piperno, Ben R. Confidential"
  // Whole words, so "Johnny Smithers" does not contain "John" and "Smith".
  if (
    rosterParsed.firstName &&
    rosterParsed.lastName &&
    hasWords(slack, rosterParsed.firstName) &&
    hasWords(slack, rosterParsed.lastName)
  ) {
    return 95;
  }

  // Reverse check: all parts of Slack name are found in roster
  // This handles "Kunal Juvvala" matching "Juvvala, Kunal Tushaar Satya Sai Kartikeya"
  if (
    slackParts.length >= 2 &&
    slackParts.every((part) => rosterParsed.normalized.includes(part))
  ) {
    return 90;
  }

  // Check if first name + last initial ("Maria L", "Maria Le"). The later word
  // must abbreviate the last name: a different last name that merely shares
  // its initial ("Maria Lopez" vs "Lee, Maria") is a different person.
  if (
    rosterParsed.firstName &&
    rosterParsed.lastName &&
    slackWords[0] === rosterParsed.firstName &&
    slackWords.slice(1).some((part) => rosterParsed.lastName.startsWith(part))
  ) {
    return 85;
  }

  // Handle single-word Slack names - match against first OR last name
  if (slackParts.length === 1) {
    const singleName = slackParts[0];
    if (
      (rosterParsed.firstName === singleName && singleName.length >= 3) ||
      (rosterParsed.lastName === singleName && singleName.length >= 3)
    ) {
      return 75;
    }
  }

  // Same first name but a clearly different surname is a different person,
  // however close the strings look overall ("Maria Lopez" vs "Lee, Maria"
  // is 73% similar). One edit is still tolerated as a typo; anything wider
  // lands in the preview's unmatched list rather than on the wrong student.
  const lastWord = slackParts[slackParts.length - 1];
  if (
    slackParts.length >= 2 &&
    slackParts[0] === rosterParsed.firstName &&
    lastWord.length >= 3 &&
    !rosterParsed.lastName.startsWith(lastWord) &&
    !rosterParsed.normalized.split(" ").includes(lastWord) &&
    levenshtein(lastWord, rosterParsed.lastName) > 1
  ) {
    return 0;
  }

  // Fuzzy match against each format, take best score
  let bestScore = 0;
  for (const format of rosterParsed.formats) {
    const score = similarity(slack, format);
    if (score > bestScore) bestScore = score;
  }

  // Boost score if first name matches exactly
  if (hasWords(slack, rosterParsed.firstName) && rosterParsed.firstName.length >= 3) {
    bestScore = Math.min(100, bestScore + 15);
  }

  // Boost score if last name matches exactly
  if (hasWords(slack, rosterParsed.lastName) && rosterParsed.lastName.length >= 3) {
    bestScore = Math.min(100, bestScore + 15);
  }

  return bestScore;
}

// Minimum confidence threshold for a match (0-100)
export const MIN_CONFIDENCE = 70;

/**
 * Match Slack users to student roster
 * @param {Array<string|string[]>} slackNames - One entry per Slack user: a name,
 *   or every name that user goes by (e.g. [display_name, real_name]). A
 *   nickname display name hides the roster name, so each candidate is scored
 *   and the best one wins.
 * @param {string[]} roster - Array of roster names (format: "LastName, FirstName M.")
 * @returns {{ matched: Array<{slackName: string, rosterName: string, confidence: number}>, unmatched: string[] }}
 *   `slackName` and `unmatched` hold a label like "Kiki (Keiko Tanaka)".
 */
export function matchNames(slackNames, roster) {
  const matched = [];
  const unmatched = [];

  // Pre-process roster names
  const rosterParsed = roster.map((name) => parseRosterName(name));

  for (const entry of slackNames) {
    const candidates = [...new Set([entry].flat().filter(Boolean))];
    const slackName =
      candidates.length > 1
        ? `${candidates[0]} (${candidates.slice(1).join(", ")})`
        : candidates[0] ?? "";
    let bestMatch = null;
    let bestScore = 0;
    let bestWords = 0;

    for (const candidate of candidates) {
      const words = normalizeName(candidate).split(" ").length;
      for (const parsed of rosterParsed) {
        const score = scoreMatch(candidate, parsed);
        // On a tie, the fuller name wins: a bare first name scores 100 against
        // every student with that first name, so it must not outrank a real
        // name's exact match just because display_name is checked first.
        if (score > bestScore || (score === bestScore && words > bestWords)) {
          bestScore = score;
          bestMatch = parsed;
          bestWords = words;
        }
      }
    }

    if (bestMatch && bestScore >= MIN_CONFIDENCE) {
      matched.push({
        slackName,
        rosterName: bestMatch.original,
        confidence: bestScore,
      });
    } else {
      unmatched.push(slackName);
    }
  }

  // One roster student per Slack user: if two users resolved to the same
  // student, only the stronger match is awarded; the other is reported
  // unmatched so the instructor sees it in the preview.
  // Ties go to the fuller Slack name, as in candidate selection above.
  const words = (m) => normalizeName(m.slackName).split(" ").length;
  const claimed = new Map();
  for (const m of matched) {
    const prev = claimed.get(m.rosterName);
    if (
      !prev ||
      m.confidence > prev.confidence ||
      (m.confidence === prev.confidence && words(m) > words(prev))
    ) {
      claimed.set(m.rosterName, m);
    }
  }
  for (const m of matched) {
    if (claimed.get(m.rosterName) !== m) unmatched.push(m.slackName);
  }
  matched.splice(0, matched.length, ...matched.filter((m) => claimed.get(m.rosterName) === m));

  // Sort matched by confidence (highest first)
  matched.sort((a, b) => b.confidence - a.confidence);

  return { matched, unmatched };
}
