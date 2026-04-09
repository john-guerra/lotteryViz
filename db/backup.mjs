import mongodb from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { classes } from "../front/src/students.mjs";

const { MongoClient } = mongodb;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = process.env.MONGO_URL || "mongodb://localhost:27017";
const BACKUPS_DIR = path.join(__dirname, "backups");
const MAX_BACKUPS = 10;

// Get database names from the courses defined in students.mjs
function getConfiguredDatabases() {
  return Object.keys(classes).map((course) => `lottery_${course}`);
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}


async function exportCollection(client, dbName, backupDir) {
  const db = client.db(dbName);
  const grades = await db.collection("grades").find({}).toArray();

  const filename = `${dbName}.json`;
  const filepath = path.join(backupDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(grades, null, 2));

  return {
    database: dbName,
    collection: "grades",
    recordCount: grades.length,
    filename,
  };
}

function zipOlderBackups(currentBackupName) {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return;
  }

  // Find all uncompressed backup folders except the current one
  const uncompressedBackups = fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.startsWith("backup_") && name !== currentBackupName)
    .map((name) => ({
      name,
      path: path.join(BACKUPS_DIR, name),
    }))
    .filter((item) => fs.statSync(item.path).isDirectory());

  for (const backup of uncompressedBackups) {
    const zipPath = `${backup.path}.zip`;
    if (!fs.existsSync(zipPath)) {
      console.log(`Compressing ${backup.name}...`);
      try {
        execSync(`zip -rq "${zipPath}" "${backup.name}"`, {
          cwd: BACKUPS_DIR,
        });
        // Remove the original folder after successful zip
        fs.rmSync(backup.path, { recursive: true, force: true });
        console.log(`  -> Compressed to ${backup.name}.zip`);
      } catch (err) {
        console.error(`  -> Failed to compress: ${err.message}`);
      }
    }
  }
}

function getAllBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BACKUPS_DIR)
    .filter((name) => name.startsWith("backup_"))
    .map((name) => {
      const fullPath = path.join(BACKUPS_DIR, name);
      const stat = fs.statSync(fullPath);
      const isZip = name.endsWith(".zip");
      const baseName = isZip ? name.replace(".zip", "") : name;
      return {
        name,
        baseName,
        path: fullPath,
        stat,
        isZip,
      };
    })
    .sort((a, b) => b.baseName.localeCompare(a.baseName));
}

function cleanupOldBackups() {
  const backups = getAllBackups();

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      console.log(`Deleting old backup: ${backup.name}`);
      if (backup.isZip) {
        fs.unlinkSync(backup.path);
      } else {
        fs.rmSync(backup.path, { recursive: true, force: true });
      }
    }
  }
}

async function backup() {
  const timestamp = new Date();
  const backupName = `backup_${formatTimestamp(timestamp)}`;
  const backupDir = path.join(BACKUPS_DIR, backupName);

  console.log("Starting database backup...");
  console.log(`Backup location: ${backupDir}`);

  // Ensure backups directory exists
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const client = new MongoClient(url, { useUnifiedTopology: true });

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const databases = getConfiguredDatabases();

    if (databases.length === 0) {
      console.log("No courses configured in students.mjs. Skipping backup.");
      return;
    }

    console.log(`Found ${databases.length} database(s): ${databases.join(", ")}`);

    // Create backup directory
    fs.mkdirSync(backupDir, { recursive: true });

    // Export each database
    const exports = [];
    for (const dbName of databases) {
      console.log(`Exporting ${dbName}...`);
      const result = await exportCollection(client, dbName, backupDir);
      exports.push(result);
      console.log(`  -> ${result.recordCount} records`);
    }

    // Create manifest
    const manifest = {
      timestamp: timestamp.toISOString(),
      backupName,
      totalDatabases: databases.length,
      totalRecords: exports.reduce((sum, e) => sum + e.recordCount, 0),
      exports,
    };

    fs.writeFileSync(
      path.join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    console.log(`Backup complete: ${manifest.totalRecords} total records from ${manifest.totalDatabases} database(s)`);

    // Zip older backups (keep current one uncompressed)
    zipOlderBackups(backupName);

    // Cleanup old backups
    cleanupOldBackups();
  } catch (err) {
    console.error("Backup failed:", err.message);
    // Don't exit with error code - allow server to start even if backup fails
  } finally {
    await client.close();
  }
}

backup();
