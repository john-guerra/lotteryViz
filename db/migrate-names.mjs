import mongodb from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { MongoClient } = mongodb;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = process.env.MONGO_URL || "mongodb://localhost:27017";
const MAPPING_FILE = path.join(__dirname, "name-mapping.json");

/**
 * Load and validate the mapping file
 */
function loadMapping() {
  if (!fs.existsSync(MAPPING_FILE)) {
    console.error(`Mapping file not found: ${MAPPING_FILE}`);
    console.error("Run `node db/generate-mapping.mjs` first.");
    process.exit(1);
  }

  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
  return mapping;
}

/**
 * Preview the migration without making changes
 */
async function previewMigration(client, mapping) {
  console.log("=== MIGRATION PREVIEW ===\n");

  for (const [courseKey, entries] of Object.entries(mapping)) {
    const dbName = `lottery_${courseKey}`;
    const db = client.db(dbName);
    const grades = db.collection("grades");

    console.log(`\n--- ${dbName} ---`);

    let updateCount = 0;
    let dropCount = 0;

    for (const entry of entries) {
      const count = await grades.countDocuments({ name: entry.old });

      if (count === 0) continue;

      const newName = entry.roster_match || entry.converted;
      const isDropped = entry.dropped || false;

      if (isDropped) {
        console.log(`  [DROPPED] "${entry.old}" -> "${newName}" (${count} records)`);
        dropCount += count;
      } else {
        console.log(`  [UPDATE]  "${entry.old}" -> "${newName}" (${count} records)`);
        updateCount += count;
      }
    }

    console.log(`\n  Summary: ${updateCount} records to update, ${dropCount} records to mark as dropped`);
  }
}

/**
 * Execute the migration
 */
async function executeMigration(client, mapping) {
  console.log("=== EXECUTING MIGRATION ===\n");

  const results = {};

  for (const [courseKey, entries] of Object.entries(mapping)) {
    const dbName = `lottery_${courseKey}`;
    const db = client.db(dbName);
    const grades = db.collection("grades");

    console.log(`\nMigrating ${dbName}...`);

    let totalUpdated = 0;
    let totalDropped = 0;

    for (const entry of entries) {
      // Use roster_match if available, otherwise use converted name
      // Trim whitespace from all names
      const newName = (entry.roster_match || entry.converted).trim();
      const isDropped = entry.dropped || false;

      // Build the update
      const update = {
        $set: { name: newName },
      };

      if (isDropped) {
        update.$set.dropped = true;
      } else {
        // Remove dropped flag if it was previously set
        update.$unset = { dropped: "" };
      }

      const result = await grades.updateMany({ name: entry.old }, update);

      if (result.modifiedCount > 0) {
        if (isDropped) {
          totalDropped += result.modifiedCount;
        } else {
          totalUpdated += result.modifiedCount;
        }
      }
    }

    results[dbName] = { updated: totalUpdated, dropped: totalDropped };
    console.log(`  Updated: ${totalUpdated}, Marked dropped: ${totalDropped}`);
  }

  return results;
}

/**
 * Verify the migration by checking for any remaining old-format names
 */
async function verifyMigration(client, mapping) {
  console.log("\n=== VERIFICATION ===\n");

  let allGood = true;

  for (const [courseKey, entries] of Object.entries(mapping)) {
    const dbName = `lottery_${courseKey}`;
    const db = client.db(dbName);
    const grades = db.collection("grades");

    const oldNames = entries.map((e) => e.old);

    // Check if any old names still exist
    const remaining = await grades.countDocuments({ name: { $in: oldNames } });

    if (remaining > 0) {
      console.log(`  [WARN] ${dbName}: ${remaining} records still have old names`);
      allGood = false;
    } else {
      console.log(`  [OK] ${dbName}: all names migrated`);
    }

    // Show sample of new names
    const sample = await grades.find({}).limit(5).toArray();
    console.log(`  Sample names: ${sample.map((r) => r.name).join(", ")}`);
  }

  return allGood;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run") || args.includes("-n");
  const skipVerify = args.includes("--skip-verify");

  if (dryRun) {
    console.log("DRY RUN MODE - No changes will be made\n");
  }

  const mapping = loadMapping();

  const client = new MongoClient(url, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB\n");

    if (dryRun) {
      await previewMigration(client, mapping);
      console.log("\nRun without --dry-run to execute the migration.");
    } else {
      // Confirm before proceeding
      console.log("This will modify the database. Press Ctrl+C to cancel.\n");
      console.log("Waiting 3 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const results = await executeMigration(client, mapping);

      if (!skipVerify) {
        const success = await verifyMigration(client, mapping);
        if (!success) {
          console.log("\n[WARN] Some records may not have been migrated correctly.");
          console.log("Review the warnings above and check the database.");
        }
      }

      console.log("\n=== MIGRATION COMPLETE ===");
      console.log("\nResults:");
      for (const [db, stats] of Object.entries(results)) {
        console.log(`  ${db}: ${stats.updated} updated, ${stats.dropped} marked as dropped`);
      }

      console.log("\nRecommended next steps:");
      console.log("1. Run `node db/backup.mjs` to create a post-migration backup");
      console.log("2. Test the application frontend");
      console.log("3. Verify grade totals are unchanged");
    }
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
