import { classes } from "../front/src/students.mjs";

/**
 * Load student roster for a given course
 * @param {string} course - Course name (e.g., "webdev_spring_2026")
 * @returns {string[]} - Array of student names
 */
export function loadStudentRoster(course) {
  const roster = classes[course];
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

/**
 * Score how well a Slack name matches a roster entry
 * @returns {number} - Score 0-100 (higher is better)
 */
export function scoreMatch(slackName, rosterParsed) {
  const slack = normalizeName(slackName);
  const slackParts = slack.split(" ").filter((p) => p.length > 1);

  // Exact match with any format
  for (const format of rosterParsed.formats) {
    if (slack === format) return 100;
  }

  // Check if Slack name contains first AND last name (high confidence)
  // This handles "Ben Piperno" matching "Piperno, Ben R. Confidential"
  if (
    rosterParsed.firstName &&
    rosterParsed.lastName &&
    slack.includes(rosterParsed.firstName) &&
    slack.includes(rosterParsed.lastName)
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

  // Check if first name + last initial
  if (
    rosterParsed.firstName &&
    rosterParsed.lastName &&
    slack.startsWith(rosterParsed.firstName) &&
    slack.includes(rosterParsed.lastName[0])
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

  // Fuzzy match against each format, take best score
  let bestScore = 0;
  for (const format of rosterParsed.formats) {
    const score = similarity(slack, format);
    if (score > bestScore) bestScore = score;
  }

  // Boost score if first name matches exactly
  if (slack.includes(rosterParsed.firstName) && rosterParsed.firstName.length >= 3) {
    bestScore = Math.min(100, bestScore + 15);
  }

  // Boost score if last name matches exactly
  if (slack.includes(rosterParsed.lastName) && rosterParsed.lastName.length >= 3) {
    bestScore = Math.min(100, bestScore + 15);
  }

  return bestScore;
}

// Minimum confidence threshold for a match (0-100)
export const MIN_CONFIDENCE = 70;

/**
 * Match Slack display names to student roster
 * @param {string[]} slackNames - Array of Slack display names
 * @param {string[]} roster - Array of roster names (format: "LastName, FirstName M.")
 * @returns {{ matched: Array<{slackName: string, rosterName: string, confidence: number}>, unmatched: string[] }}
 */
export function matchNames(slackNames, roster) {
  const matched = [];
  const unmatched = [];

  // Pre-process roster names
  const rosterParsed = roster.map((name) => parseRosterName(name));

  for (const slackName of slackNames) {
    let bestMatch = null;
    let bestScore = 0;

    for (const parsed of rosterParsed) {
      const score = scoreMatch(slackName, parsed);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = parsed;
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

  // Sort matched by confidence (highest first)
  matched.sort((a, b) => b.confidence - a.confidence);

  return { matched, unmatched };
}
