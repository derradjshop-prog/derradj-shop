# ====================================================================
# admin/upload-to-supabase-storage.ps1 — Derradj Shop
#
# Uploads all electronics product images to Supabase Storage bucket
# "product-images" and prints the final SQL UPDATE statements.
#
# PREREQUISITES:
#   1. Run admin/gallery-images-migration.sql in Supabase SQL Editor
#   2. Get your service_role key from:
#      https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/settings/api
#      → "service_role" (secret key — never expose publicly)
#   3. Paste the key as the $SERVICE_ROLE_KEY value below
#
# HOW TO RUN (from the repo root):
#   cd <path-to-derradj-shop>
#   .\admin\upload-to-supabase-storage.ps1
#
# AFTER SUCCESS:
#   Run the SQL printed at the end in Supabase SQL Editor.
#   OR run admin/update-supabase-image-urls.sql directly.
# ====================================================================

# ── CONFIGURATION — fill in your service_role key ────────────────────
$SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY_HERE"

$SUPABASE_URL  = "https://jbmcbjzcedqpvnhbmrhk.supabase.co"
$BUCKET        = "product-images"
$STORAGE_BASE  = "$SUPABASE_URL/storage/v1/object/public/$BUCKET"

# Resolve shop root (one level up from /admin/) — always relative to
# this script's own location, so it works regardless of which machine
# or path the repo is checked out to.
$SHOP_ROOT = Split-Path $PSScriptRoot -Parent
if (-not $SHOP_ROOT -or -not (Test-Path $SHOP_ROOT)) {
    Write-Host "  ERROR: Could not resolve the repo root from this script's location." -ForegroundColor Red
    exit 1
}

# ── GUARD ─────────────────────────────────────────────────────────────
if ($SERVICE_ROLE_KEY -eq "YOUR_SERVICE_ROLE_KEY_HERE") {
    Write-Host ""
    Write-Host "  ERROR: You must set `$SERVICE_ROLE_KEY before running this script." -ForegroundColor Red
    Write-Host "  Get it from: Supabase dashboard → Settings → API → service_role (secret)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# ── HELPERS ───────────────────────────────────────────────────────────
function Get-Mime($path) {
    switch ([System.IO.Path]::GetExtension($path).ToLower()) {
        ".webp" { return "image/webp" }
        ".png"  { return "image/png"  }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        default { return "application/octet-stream" }
    }
}

$uploaded   = @()
$skipped    = @()
$failed     = @()

function Upload-Image {
    param([string]$LocalRel, [string]$StoragePath)

    $fullPath = Join-Path $SHOP_ROOT $LocalRel
    if (-not (Test-Path $fullPath)) {
        Write-Host "  [SKIP] Not found on disk: $LocalRel" -ForegroundColor Yellow
        $script:skipped += $StoragePath
        return $false
    }

    $mime    = Get-Mime $fullPath
    $bytes   = [System.IO.File]::ReadAllBytes($fullPath)
    $uri     = "$SUPABASE_URL/storage/v1/object/$BUCKET/$StoragePath"
    $headers = @{
        "apikey"        = $SERVICE_ROLE_KEY
        "Authorization" = "Bearer $SERVICE_ROLE_KEY"
        "x-upsert"      = "true"
    }

    try {
        $resp = Invoke-WebRequest -Method POST -Uri $uri `
            -Headers $headers -ContentType $mime -Body $bytes -UseBasicParsing
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) {
            Write-Host "  [OK] $StoragePath" -ForegroundColor Green
            $script:uploaded += $StoragePath
            return $true
        } else {
            Write-Host "  [FAIL] $StoragePath — HTTP $($resp.StatusCode)" -ForegroundColor Red
            $script:failed += $StoragePath
            return $false
        }
    } catch {
        Write-Host "  [FAIL] $StoragePath — $($_.Exception.Message)" -ForegroundColor Red
        $script:failed += $StoragePath
        return $false
    }
}

# ── CREATE BUCKET (public, if not already present) ───────────────────
Write-Host ""
Write-Host "Creating bucket '$BUCKET'..." -ForegroundColor Cyan
$bucketHeaders = @{
    "apikey"        = $SERVICE_ROLE_KEY
    "Authorization" = "Bearer $SERVICE_ROLE_KEY"
    "Content-Type"  = "application/json"
}
try {
    $bucketBody = '{"id":"product-images","name":"product-images","public":true}'
    Invoke-RestMethod -Method POST -Uri "$SUPABASE_URL/storage/v1/bucket" `
        -Headers $bucketHeaders -Body $bucketBody | Out-Null
    Write-Host "  [OK] Bucket created." -ForegroundColor Green
} catch {
    $msg = $_.Exception.Message
    if ($msg -match "already" -or $msg -match "409" -or $msg -match "Duplicate") {
        Write-Host "  [OK] Bucket already exists." -ForegroundColor Yellow
    } else {
        Write-Host "  [ERROR] Could not create bucket: $msg" -ForegroundColor Red
        Write-Host "  Create it manually: Supabase dashboard → Storage → New bucket → 'product-images' (public)" -ForegroundColor Yellow
    }
}


# ════════════════════════════════════════════════════════════════════════
# IMAGE UPLOAD MANIFEST
# 14 unique files. Duplicates detected and skipped:
#   main1.webp (laptop)     = main.webp (153 KB) — duplicate
#   images/main.png (Anker) = main.png  (36 KB)  — duplicate
#   main.png (PowerBank)    = main.webp (1.36 MB) — duplicate format
#   main4.png (laptop)      — does NOT exist on disk
# ════════════════════════════════════════════════════════════════════════

# ── Product 83 — حامل اللابتوب (adjustable-laptop-stand) ─────────────
Write-Host ""
Write-Host "[83] Laptop Stand — adjustable-laptop-stand" -ForegroundColor Cyan
Upload-Image "Electronique\laptop\main.webp"  "electronics/adjustable-laptop-stand/main.webp"
Upload-Image "Electronique\laptop\main2.png"  "electronics/adjustable-laptop-stand/gallery-1.png"
Upload-Image "Electronique\laptop\main3.png"  "electronics/adjustable-laptop-stand/gallery-2.png"
Upload-Image "Electronique\laptop\main1.png"  "electronics/adjustable-laptop-stand/gallery-3.png"
# main1.webp skipped — identical to main.webp (153,468 bytes)
# main4.png skipped — does not exist on disk

# ── Product 84 — Modio ST11 (modio-st11-smart-watch) ─────────────────
Write-Host ""
Write-Host "[84] Modio ST11 Smart Watch — modio-st11-smart-watch" -ForegroundColor Cyan
Upload-Image "Electronique\smart-watch\modio-st11-smart-watch\main.webp"     "electronics/modio-st11-smart-watch/main.webp"
Upload-Image "Electronique\smart-watch\modio-st11-smart-watch\image-2.webp"  "electronics/modio-st11-smart-watch/gallery-1.webp"
Upload-Image "Electronique\smart-watch\modio-st11-smart-watch\image-3.webp"  "electronics/modio-st11-smart-watch/gallery-2.webp"
Upload-Image "Electronique\smart-watch\modio-st11-smart-watch\image-4.webp"  "electronics/modio-st11-smart-watch/gallery-3.webp"

# ── Product 85 — Anker Black (anker-soundcore-r50i-vg) ───────────────
Write-Host ""
Write-Host "[85] Anker SoundCore R50i VG (Black) — anker-soundcore-r50i-vg" -ForegroundColor Cyan
Upload-Image "Electronique\earbuds\anker-soundcore-r50i-vg\main.png"          "electronics/anker-soundcore-r50i-vg/main.png"
Upload-Image "Electronique\earbuds\anker-soundcore-r50i-vg\images\1.png"      "electronics/anker-soundcore-r50i-vg/gallery-1.png"
Upload-Image "Electronique\earbuds\anker-soundcore-r50i-vg\images\2.png"      "electronics/anker-soundcore-r50i-vg/gallery-2.png"
Upload-Image "Electronique\earbuds\anker-soundcore-r50i-vg\images\3.png"      "electronics/anker-soundcore-r50i-vg/gallery-3.png"
# images/main.png skipped — identical to main.png (36,200 bytes)

# ── Product 87 — Airpods 4 (airpods-4-type-c-vrac) ───────────────────
Write-Host ""
Write-Host "[87] Airpods 4 Type-C Vrac — airpods-4-type-c-vrac" -ForegroundColor Cyan
Upload-Image "Electronique\earbuds\airpods-4-type-c-vrac\main.webp"  "electronics/airpods-4-type-c-vrac/main.webp"

# ── Product 88 — Hoco Power Bank (hoco-j132a-20000mah-power-bank) ────
Write-Host ""
Write-Host "[88] Hoco J132A Power Bank — hoco-j132a-20000mah-power-bank" -ForegroundColor Cyan
Upload-Image "Electronique\power-bank\hoco-j132a-20000mah-power-bank\main.webp"  "electronics/hoco-j132a-20000mah-power-bank/main.webp"
# main.png skipped — identical to main.webp (1,357,322 bytes)


# ── SUMMARY ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host " UPLOAD SUMMARY" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "  Uploaded : $($uploaded.Count) / 14 files" -ForegroundColor $(if ($uploaded.Count -eq 14) { "Green" } else { "Yellow" })
Write-Host "  Skipped  : $($skipped.Count) files (missing on disk)" -ForegroundColor Yellow
Write-Host "  Failed   : $($failed.Count) files" -ForegroundColor $(if ($failed.Count -gt 0) { "Red" } else { "Green" })

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "  Failed files:" -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Fix the errors above, then re-run. x-upsert=true means re-running is safe." -ForegroundColor Yellow
    exit 1
}

# ── PRINT FINAL SQL ─────────────────────────────────────────────────
Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host " NEXT STEP: Run the following SQL in Supabase SQL Editor" -ForegroundColor White
Write-Host " OR run admin/update-supabase-image-urls.sql directly" -ForegroundColor White
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host ""

$BASE_URL = "$STORAGE_BASE"
Write-Host @"
-- Paste this into: https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new

UPDATE admin_products_catalog SET
  main_image     = '$BASE_URL/electronics/adjustable-laptop-stand/main.webp',
  gallery_images = '["$BASE_URL/electronics/adjustable-laptop-stand/gallery-1.png","$BASE_URL/electronics/adjustable-laptop-stand/gallery-2.png","$BASE_URL/electronics/adjustable-laptop-stand/gallery-3.png"]'::jsonb
WHERE catalog_id = 83;

UPDATE admin_products_catalog SET
  main_image     = '$BASE_URL/electronics/modio-st11-smart-watch/main.webp',
  gallery_images = '["$BASE_URL/electronics/modio-st11-smart-watch/gallery-1.webp","$BASE_URL/electronics/modio-st11-smart-watch/gallery-2.webp","$BASE_URL/electronics/modio-st11-smart-watch/gallery-3.webp"]'::jsonb
WHERE catalog_id = 84;

UPDATE admin_products_catalog SET
  main_image     = '$BASE_URL/electronics/anker-soundcore-r50i-vg/main.png',
  gallery_images = '["$BASE_URL/electronics/anker-soundcore-r50i-vg/gallery-1.png","$BASE_URL/electronics/anker-soundcore-r50i-vg/gallery-2.png","$BASE_URL/electronics/anker-soundcore-r50i-vg/gallery-3.png"]'::jsonb
WHERE catalog_id = 85;

UPDATE admin_products_catalog SET
  main_image     = '$BASE_URL/electronics/airpods-4-type-c-vrac/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 87;

UPDATE admin_products_catalog SET
  main_image     = '$BASE_URL/electronics/hoco-j132a-20000mah-power-bank/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 88;

-- Verify
SELECT catalog_id, product_name, main_image, jsonb_array_length(gallery_images) AS gallery_count
FROM admin_products_catalog
WHERE catalog_id IN (83,84,85,87,88)
ORDER BY catalog_id;
"@

Write-Host ""
Write-Host "  Done. All $($uploaded.Count) images are live at:" -ForegroundColor Green
Write-Host "  $STORAGE_BASE/electronics/" -ForegroundColor Cyan
Write-Host ""
