import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { classes } from "../front/src/students.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUPS_DIR = path.join(__dirname, "backups");
const OUTPUT_FILE = path.join(__dirname, "name-mapping.json");

/**
 * Convert "Last, First M." to "First M. Last"
 */
function convertName(oldName) {
  const trimmed = oldName.trim();
  const commaIdx = trimmed.indexOf(", ");
  if (commaIdx === -1) {
    return trimmed; // No comma, return as-is
  }
  const last = trimmed.substring(0, commaIdx);
  const first = trimmed.substring(commaIdx + 2);
  return `${first} ${last}`;
}

/**
 * Normalize a name for comparison:
 * - Lowercase
 * - Remove extra spaces
 * - Remove honorifics (Mr., Ms., Mrs., Dr.)
 * - Remove brackets and their content (e.g., [CONFIDENTIAL])
 * - Remove standalone "Confidential" word (for matching db format)
 * - Remove trailing periods from initials
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\b(mr\.|ms\.|mrs\.|dr\.)\s*/gi, "") // Remove honorifics
    .replace(/\s*\[.*?\]\s*/g, "") // Remove brackets and content
    .replace(/\bconfidential\b/gi, "") // Remove standalone "Confidential"
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();
}

/**
 * Extract last name from "First [Middle] Last" format
 * Returns the last word(s) that match the original last name pattern
 */
function extractLastName(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Extract first name (first word, potentially with middle names/initials)
 */
function extractFirstParts(fullName) {
  const parts = fullName.trim().split(/\s+/);
  return parts.slice(0, -1).join(" "); // Everything except last
}

/**
 * Check if an initial matches a full name
 * "H." matches "Heliso", "Isaac H." matches "Isaac Heliso"
 */
function initialMatches(initial, fullName) {
  const initLower = initial.toLowerCase().replace(".", "");
  const fullLower = fullName.toLowerCase();
  return fullLower.startsWith(initLower);
}

/**
 * Compare first name parts allowing initial → full name matching
 * "Isaac H." should match "Isaac Heliso"
 */
function firstNamesMatch(dbFirst, rosterFirst) {
  const dbParts = dbFirst.trim().split(/\s+/);
  const rosterParts = rosterFirst.trim().split(/\s+/);

  // First name must match
  if (dbParts[0].toLowerCase() !== rosterParts[0].toLowerCase()) {
    return false;
  }

  // Check middle name/initial matching
  // If DB has an initial (ends with .), it should match the start of the roster middle name
  for (let i = 1; i < dbParts.length; i++) {
    const dbPart = dbParts[i];
    const rosterPart = rosterParts[i];

    if (!rosterPart) {
      // Roster has fewer parts, that's OK if remaining DB parts are initials
      if (!dbPart.endsWith(".")) {
        return false;
      }
      continue;
    }

    if (dbPart.endsWith(".")) {
      // DB has an initial, check if it matches roster
      if (!initialMatches(dbPart, rosterPart)) {
        return false;
      }
    } else {
      // Full name comparison
      if (dbPart.toLowerCase() !== rosterPart.toLowerCase()) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Find the best match in the roster for a converted name
 */
function findRosterMatch(convertedName, roster) {
  const normalizedConverted = normalizeName(convertedName);

  // Try exact match first
  for (const rosterName of roster) {
    if (normalizeName(rosterName) === normalizedConverted) {
      return { match: rosterName, confidence: "high" };
    }
  }

  // Extract parts for fuzzy matching
  const convertedLast = extractLastName(normalizedConverted);
  const convertedFirst = extractFirstParts(normalizedConverted);

  let bestMatch = null;
  let bestScore = 0;

  for (const rosterName of roster) {
    const normalizedRoster = normalizeName(rosterName);
    const rosterLast = extractLastName(normalizedRoster);
    const rosterFirst = extractFirstParts(normalizedRoster);

    // Last name must match exactly
    if (convertedLast !== rosterLast) {
      continue;
    }

    // Check first name match (allowing initial expansion)
    if (firstNamesMatch(convertedFirst, rosterFirst)) {
      // Score based on how well the names match
      const score = convertedFirst.length + rosterFirst.length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = rosterName;
      }
    }
  }

  if (bestMatch) {
    return { match: bestMatch, confidence: "high" };
  }

  // Try matching with last name being multi-part
  // e.g., "Cardenas Espinosa" as last name
  for (const rosterName of roster) {
    const normalizedRoster = normalizeName(rosterName);
    const rosterParts = normalizedRoster.split(/\s+/);

    // Try different splits of the roster name as "first... last..."
    for (let splitIdx = 1; splitIdx < rosterParts.length; splitIdx++) {
      const possibleFirst = rosterParts.slice(0, splitIdx).join(" ");
      const possibleLast = rosterParts.slice(splitIdx).join(" ");

      const convertedParts = normalizedConverted.split(/\s+/);
      for (let convSplit = 1; convSplit < convertedParts.length; convSplit++) {
        const convFirst = convertedParts.slice(0, convSplit).join(" ");
        const convLast = convertedParts.slice(convSplit).join(" ");

        if (convLast === possibleLast && firstNamesMatch(convFirst, possibleFirst)) {
          return { match: rosterName, confidence: "medium" };
        }
      }
    }
  }

  return { match: null, confidence: "none" };
}

/**
 * Get the most recent uncompressed backup directory
 */
function getLatestBackupDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return null;
  }

  const dirs = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.startsWith("backup_") && !name.endsWith(".zip"))
    .map((name) => path.join(BACKUPS_DIR, name))
    .filter((p) => fs.statSync(p).isDirectory())
    .sort()
    .reverse();

  return dirs[0] || null;
}

/**
 * Extract unique names from a backup JSON file
 */
function extractUniqueNames(backupFile) {
  const data = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  const names = new Set();
  for (const record of data) {
    if (record.name) {
      names.add(record.name);
    }
  }
  return Array.from(names).sort();
}

/**
 * Map course key to roster key
 */
function getCourseRosterKey(courseKey) {
  // courseKey is like "lottery_db_spring_2026"
  // roster key is like "db_spring_2026"
  return courseKey.replace(/^lottery_/, "");
}

async function generateMapping() {
  console.log("Generating name mapping...\n");

  const backupDir = getLatestBackupDir();
  if (!backupDir) {
    console.error("No backup directory found. Run `node db/backup.mjs` first.");
    process.exit(1);
  }

  console.log(`Using backup: ${path.basename(backupDir)}\n`);

  const mapping = {};

  // Get all backup JSON files (excluding manifest)
  const backupFiles = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map((f) => path.join(backupDir, f));

  for (const backupFile of backupFiles) {
    const filename = path.basename(backupFile, ".json");
    const rosterKey = getCourseRosterKey(filename);
    const roster = classes[rosterKey];

    if (!roster) {
      console.log(`Skipping ${filename}: no roster found for "${rosterKey}"`);
      continue;
    }

    console.log(`Processing ${filename}...`);
    console.log(`  Roster: ${rosterKey} (${roster.length} students)`);

    const dbNames = extractUniqueNames(backupFile);
    console.log(`  Database: ${dbNames.length} unique names`);

    const entries = [];

    for (const dbName of dbNames) {
      const converted = convertName(dbName);
      const { match, confidence } = findRosterMatch(converted, roster);

      const entry = {
        old: dbName,
        converted: converted,
      };

      if (match) {
        entry.roster_match = match;
        entry.confidence = confidence;
      } else {
        entry.roster_match = null;
        entry.dropped = true;
        entry.confidence = "none";
      }

      entries.push(entry);
    }

    // Sort: matched first (by confidence), then dropped
    entries.sort((a, b) => {
      if (a.dropped && !b.dropped) return 1;
      if (!a.dropped && b.dropped) return -1;
      if (a.confidence === "high" && b.confidence !== "high") return -1;
      if (a.confidence !== "high" && b.confidence === "high") return 1;
      return a.old.localeCompare(b.old);
    });

    mapping[rosterKey] = entries;

    // Summary
    const matched = entries.filter((e) => e.roster_match).length;
    const dropped = entries.filter((e) => e.dropped).length;
    const highConf = entries.filter((e) => e.confidence === "high").length;
    const medConf = entries.filter((e) => e.confidence === "medium").length;

    console.log(`  Results: ${matched} matched, ${dropped} dropped`);
    console.log(`  Confidence: ${highConf} high, ${medConf} medium\n`);
  }

  // Write mapping file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(mapping, null, 2));
  console.log(`\nMapping written to: ${OUTPUT_FILE}`);
  console.log("\nPlease review the mapping file before running the migration.");
  console.log("Pay special attention to:");
  console.log("  - Entries with 'dropped: true' (not in current roster)");
  console.log("  - Entries with 'confidence: medium' (fuzzy matches)");
  console.log("\nWhen ready, run: node db/migrate-names.mjs");
}

generateMapping();
