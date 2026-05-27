/**
 * convert-to-webp.js — Derradj Shop
 * Converts every books/*\/main.png → main.webp at quality 82
 * Run: node convert-to-webp.js
 */
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');

const BOOKS_DIR = path.join(__dirname, 'books');
const QUALITY   = 82;

async function convertAll() {
  const entries = fs.readdirSync(BOOKS_DIR, { withFileTypes: true });
  let converted = 0, skipped = 0, failed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pngPath  = path.join(BOOKS_DIR, entry.name, 'main.png');
    const webpPath = path.join(BOOKS_DIR, entry.name, 'main.webp');

    if (!fs.existsSync(pngPath)) {
      console.log(`  ⏩ skip (no png) : ${entry.name}`);
      skipped++;
      continue;
    }

    // Skip if webp already exists and is newer than png
    if (fs.existsSync(webpPath)) {
      const pngMtime  = fs.statSync(pngPath).mtimeMs;
      const webpMtime = fs.statSync(webpPath).mtimeMs;
      if (webpMtime >= pngMtime) {
        console.log(`  ✔ already up-to-date : ${entry.name}`);
        skipped++;
        continue;
      }
    }

    // Check PNG file size – skip near-empty placeholder files
    const pngSize = fs.statSync(pngPath).size;
    if (pngSize < 1000) {
      console.log(`  ⚠ tiny file (${pngSize}B), skip : ${entry.name}`);
      skipped++;
      continue;
    }

    try {
      const info = await sharp(pngPath)
        .webp({ quality: QUALITY, effort: 5 })
        .toFile(webpPath);

      const pngKB  = (pngSize / 1024).toFixed(1);
      const webpKB = (info.size   / 1024).toFixed(1);
      const saved  = (100 - (info.size / pngSize) * 100).toFixed(0);
      console.log(`  ✅ ${entry.name.padEnd(42)} PNG: ${pngKB.padStart(7)} KB  →  WebP: ${webpKB.padStart(7)} KB  (saved ${saved}%)`);
      converted++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${entry.name} — ${err.message}`);
      failed++;
    }
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`Converted : ${converted}`);
  console.log(`Skipped   : ${skipped}`);
  console.log(`Failed    : ${failed}`);
  console.log('─────────────────────────────────────────────');
}

convertAll().catch(console.error);
