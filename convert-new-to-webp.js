// convert-new-to-webp.js
// Converts every books/<folder>/main.png that has NO corresponding main.webp yet.
// Uses sharp (already installed). Quality: 80. Never overwrites existing files.

'use strict';

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const BOOKS_DIR = path.join(__dirname, 'books');
const QUALITY   = 80;

async function main () {
  const folders = fs.readdirSync(BOOKS_DIR, { withFileTypes: true })
    .filter(function (d) { return d.isDirectory(); })
    .map(function (d) { return d.name; });

  const results = { converted: [], skipped: [], errors: [] };

  for (const folder of folders.sort()) {
    const pngPath  = path.join(BOOKS_DIR, folder, 'main.png');
    const webpPath = path.join(BOOKS_DIR, folder, 'main.webp');

    if (!fs.existsSync(pngPath)) {
      continue; // no PNG in this folder
    }

    if (fs.existsSync(webpPath)) {
      results.skipped.push(folder);
      continue;
    }

    try {
      await sharp(pngPath)
        .webp({ quality: QUALITY, effort: 4 })
        .toFile(webpPath);

      const pngSize  = fs.statSync(pngPath).size;
      const webpSize = fs.statSync(webpPath).size;
      const savings  = (((pngSize - webpSize) / pngSize) * 100).toFixed(1);

      results.converted.push({
        folder,
        pngKB:   (pngSize  / 1024).toFixed(1),
        webpKB:  (webpSize / 1024).toFixed(1),
        savings: savings + '%',
      });

      console.log('DONE ' + folder + ': ' + (pngSize/1024).toFixed(1) + ' KB -> ' + (webpSize/1024).toFixed(1) + ' KB  (' + savings + '% smaller)');
    } catch (err) {
      results.errors.push({ folder: folder, err: err.message });
      console.error('FAIL ' + folder + ': ' + err.message);
    }
  }

  console.log('\n======================================================');
  console.log('Converted : ' + results.converted.length);
  console.log('Skipped   : ' + results.skipped.length + '  (already had main.webp)');
  console.log('Errors    : ' + results.errors.length);
  console.log('======================================================\n');

  if (results.errors.length) {
    console.log('Failed folders:');
    results.errors.forEach(function (e) { console.log('  - ' + e.folder + ': ' + e.err); });
  }

  return results;
}

main().catch(function (err) { console.error(err); process.exit(1); });
