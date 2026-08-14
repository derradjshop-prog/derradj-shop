/**
 * localize-book-images.js — one-time migration.
 * Downloads the Supabase Storage-hosted cover for each book listed below,
 * re-encodes it as webp at the same quality used by convert-to-webp.js,
 * and writes it to books/<slug>/main.webp so the site can stop serving
 * these covers directly from Supabase Storage (source of ongoing egress).
 * Run: node scripts/localize-book-images.js
 */
const sharp = require('sharp');
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const BOOKS_DIR = path.join(__dirname, '..', 'books');
const QUALITY   = 82;

const MAP = {
  'a-journey-into-the-customers-mind': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783017897026-w2vxb56.webp',
  'blink-the-power-of-thinking-without-thinking': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783247359966-rn5ev3l.webp',
  'comfort-zone': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783018101258-gws7bfu.webp',
  'eat-that-frog': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783015925125-n77cqp3.webp',
  'goodbye-to-shyness': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783016481105-3uexz1v.webp',
  'how-to-win-friends-and-influence-people': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783248044052-59r6sz7.webp',
  'know-yourself': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783017665512-3z7wshn.webp',
  'moments-that-could-change-your-life': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783018295993-4fd9my9.webp',
  'secrets-of-the-millionaire-mind': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783016118290-eygsje1.webp',
  'sell-anything': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783162784132-bnsisgg.webp',
  'surrounded-by-idiots': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782681022772-lkrcony.webp',
  'surrounded-by-setbacks': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783015501065-7m9v73o.webp',
  'the-art-of-charisma': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782681536402-bn1n833.webp',
  'the-art-of-public-speaking': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783262929139-xptfdar.webp',
  'the-bomber-mafia': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782677602307-ga28u09.webp',
  'the-first-20-hours': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783264328827-q0mv2b2.webp',
  'the-industry-of-greats': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783247178714-435m4of.webp',
  'the-law-of-success': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783246791475-2wvx1so.webp',
  'the-power-of-failure': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/gallery/1783246984748-mak026d.webp',
  'the-power-of-your-subconscious-mind': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782672976023-xkvdq9u.webp',
  'the-secret-of-success': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783018482867-oywne46.webp',
  'the-tipping-point': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783247520973-1kmo7nh.webp',
  'think-and-act-like-a-cat': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783017785251-l8rvqg1.webp',
  'today-matters': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782678454822-lm7q6z9.webp',
  'unfuk-yourself': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1782680329708-ci8pwrp.webp',
  'you-are-a-badass': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783015065719-55fsrg6.webp',
  'your-mind-and-how-to-use-it': 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/admin-product-images/products/1783016590023-jp88sk3.webp',
};

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode + ' for ' + url)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function run() {
  let ok = 0, failed = 0;
  for (const [slug, url] of Object.entries(MAP)) {
    const dir = path.join(BOOKS_DIR, slug);
    const outPath = path.join(dir, 'main.webp');
    try {
      if (!fs.existsSync(dir)) throw new Error('book dir does not exist: ' + dir);
      const buf = await download(url);
      const info = await sharp(buf)
        .resize({ width: 1000, height: 1400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 5 })
        .toFile(outPath);
      console.log(`OK  ${slug.padEnd(45)} ${(buf.length/1024).toFixed(0)}KB -> ${(info.size/1024).toFixed(0)}KB`);
      ok++;
    } catch (err) {
      console.error(`FAIL ${slug}: ${err.message}`);
      failed++;
    }
  }
  console.log(`\nDone. ok=${ok} failed=${failed}`);
}

run();
