-- ================================================================
-- admin/migrate-electronics-to-supabase.sql — Derradj Shop
--
-- Migrates 6 legacy electronics products from the old SHOP_CATALOG
-- (cart.js) into admin_products_catalog so they are managed from
-- the admin dashboard going forward.
--
-- Products migrated (legacy catalogIds 83–88):
--   83  حامل اللابتوب القابل للتعديل
--   84  ساعة ذكية Modio ST11 مع 3 أزواج أساور
--   85  Anker SoundCore R50i VG – Earbuds (Black)
--   86  Anker SoundCore R50i VG – Earbuds (Blue)  [is_active=false]
--   87  Airpods 4 Type-C Vrac (Garantie)
--   88  Hoco J132A 20000mAh Power Bank
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--   2. Paste this file and click "Run"
--
-- SAFE: ON CONFLICT (slug) DO NOTHING — no duplicates created.
-- ================================================================


-- ── 0. Ensure display_order column exists ──────────────────────────
ALTER TABLE admin_products_catalog
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

CREATE INDEX IF NOT EXISTS idx_apc_display_order
  ON admin_products_catalog (display_order ASC NULLS LAST);


-- ── 1. حامل اللابتوب القابل للتعديل (catalogId 83) ─────────────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  83,
  'حامل اللابتوب القابل للتعديل',
  'حامل لابتوب متعدد الزوايا',
  'Support PC Réglable Multi-Angles',
  'electronics', 'laptop',
  1500, NULL,
  'in_stock', true,
  '/Electronique/laptop/main.webp',
  'حامل لابتوب قابل للتعديل متعدد الزوايا، خفيف ومتنقل، مناسب لجميع أحجام اللابتوب.',
  'حامل لابتوب قابل للتعديل متعدد الزوايا، خفيف ومتنقل، مناسب لجميع أحجام اللابتوب. يحسن وضعية الجلوس ويقلل الإجهاد. مثالي للعمل من المنزل أو الدراسة. التوصيل لجميع ولايات الجزائر الـ 58.',
  'adjustable-laptop-stand',
  'حامل حاسوب,حامل لابتوب,support pc,laptop stand,support laptop,حامل كمبيوتر,إلكترونيات,electronique,laptop,حاسوب,كمبيوتر محمول,support ordinateur,support portable,قابل للتعديل,حامل لابتوب قابل للتعديل,laptop adjustable',
  NULL,
  1
)
ON CONFLICT (slug) DO NOTHING;


-- ── 2. ساعة ذكية Modio ST11 (catalogId 84) ────────────────────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  84,
  'ساعة ذكية Modio ST11 مع 3 أزواج أساور',
  'ساعة ذكية Modio ST11 مع 3 أزواج أساور',
  'Montre Connectée Modio ST11 avec 3 Bracelets',
  'electronics', 'smart_watch',
  9800, NULL,
  'in_stock', true,
  '/Electronique/smart-watch/modio-st11-smart-watch/main.webp',
  'ساعة ذكية Modio ST11 مع 3 أزواج أساور قابلة للتبديل. تدعم شريحة SIM 4G، شاشة لمس، متتبع صحي.',
  'ساعة ذكية Modio ST11 مع 3 أزواج أساور قابلة للتبديل. تدعم شريحة SIM 4G. شاشة لمس بألوان مشرقة، متتبع صحي شامل (معدل ضربات القلب، ضغط الدم، الخطوات)، إشعارات للرسائل والمكالمات. مناسبة للاستخدام اليومي والرياضة. التوصيل لجميع ولايات الجزائر الـ 58.',
  'modio-st11-smart-watch',
  'ساعة ذكية,smart watch,montre connectée,montre intelligente,modio,modio st11,ساعة modio,ساعة 4G,ساعة sim,ساعة إلكترونية,ساعة رياضية,ساعة يد ذكية,ساعة الجزائر,smartwatch algerie,إلكترونيات,electronique',
  'Modio',
  2
)
ON CONFLICT (slug) DO NOTHING;


-- ── 3. Anker SoundCore R50i VG – Black (catalogId 85) ─────────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  85,
  'Anker SoundCore R50i VG – Bluetooth Earbuds (Black)',
  'سماعات أنكر ساوندكور R50i VG بلوتوث – أسود',
  'Écouteurs Bluetooth Anker SoundCore R50i VG (Noir)',
  'electronics', 'earbuds',
  4900, NULL,
  'in_stock', true,
  '/Electronique/earbuds/anker-soundcore-r50i-vg/main.png',
  'Anker SoundCore R50i VG أصلية — Bluetooth 5.3، بطارية 30 ساعة، مقاومة الماء IPX5، شحن USB-C.',
  'Anker SoundCore R50i VG Original Bluetooth 5.3 earbuds with 10 mm dynamic drivers, 30h total battery life, 2 AI microphones for clear calls, IPX5 water resistance, and USB-C fast charging. Available in Black. Ideal for calls, music, gym, and daily use. Shipped to all 58 Algerian provinces.',
  'anker-soundcore-r50i-vg',
  'سماعات بلوتوث,سماعات أنكر,anker,soundcore,anker r50i,earbuds,bluetooth earbuds,écouteurs bluetooth,سماعات لاسلكية,سماعات الجزائر,écouteurs algérie,anker soundcore,r50i vg,سماعات داخل الأذن,إلكترونيات,electronique,bluetooth 5.3,سماعة بلوتوث,سماعة رياضية',
  'Anker',
  3
)
ON CONFLICT (slug) DO NOTHING;


-- ── 4. Anker SoundCore R50i VG – Blue (catalogId 86) [مخفي] ────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  86,
  'Anker SoundCore R50i VG – Bluetooth Earbuds (Blue)',
  'سماعات أنكر ساوندكور R50i VG بلوتوث – أزرق',
  'Écouteurs Bluetooth Anker SoundCore R50i VG (Bleu)',
  'electronics', 'earbuds',
  4900, NULL,
  'in_stock', false,
  '',
  'Anker SoundCore R50i VG Bluetooth 5.3 — Blue variant. Same features as the Black version.',
  'Anker SoundCore R50i VG Bluetooth 5.3 earbuds — Blue color variant. Same features as the Black version: 30h battery, AI microphones, IPX5, USB-C.',
  'anker-soundcore-r50i-vg-blue',
  'anker,soundcore,anker r50i,earbuds,bluetooth earbuds,blue,أزرق,سماعات بلوتوث',
  'Anker',
  NULL
)
ON CONFLICT (slug) DO NOTHING;


-- ── 5. Airpods 4 Type-C Vrac (catalogId 87) ───────────────────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  87,
  'Airpods 4 Type-C Vrac (Garantie)',
  'إيربودز 4 شحن Type-C فراك (ضمان)',
  'Airpods 4 Type-C Vrac avec Garantie',
  'electronics', 'earbuds',
  2900, NULL,
  'in_stock', true,
  '/Electronique/earbuds/airpods-4-type-c-vrac/main.webp',
  'Airpods 4 Type-C Vrac مع ضمان — سماعات بلوتوث لاسلكية بمنفذ شحن Type-C. تُباع بدون علبة.',
  'Airpods 4 Type-C Vrac (Garantie) — سماعات بلوتوث لاسلكية بمنفذ شحن Type-C. تُباع Vrac (بدون علبة) مع ضمان. لا شريحة SIM. لا كاميرا. مناسبة للاستخدام اليومي، المكالمات، الدراسة، والعمل. التوصيل لجميع ولايات الجزائر الـ 58.',
  'airpods-4-type-c-vrac',
  'airpods,airpods 4,airpods type c,airpods vrac,سماعات بلوتوث,سماعات type c,سماعات vrac,سماعات لاسلكية,سماعات الجزائر,airpods algerie,airpods dz,airpods 4 algerie,earbuds,bluetooth earbuds,type c earbuds,écouteurs bluetooth,écouteurs type c,garantie,vrac,إلكترونيات,electronique',
  NULL,
  4
)
ON CONFLICT (slug) DO NOTHING;


-- ── 6. Hoco J132A Power Bank (catalogId 88) ───────────────────────
INSERT INTO admin_products_catalog (
  catalog_id,
  product_name, product_name_ar, product_name_fr,
  category, subcategory,
  price, old_price,
  stock_status, is_active,
  main_image,
  short_description, full_description,
  slug, keywords,
  brand, display_order
) VALUES (
  88,
  'Hoco J132A 20000mAh Power Bank USB-A 15W + USB-C PD20W with Built-in Type-C 22.5W Cable and iP 12W Cable',
  'باور بانك Hoco J132A 20000mAh مع كابلات مدمجة',
  'Batterie Externe Hoco J132A 20000mAh avec Câbles Intégrés',
  'electronics', 'power_bank',
  3950, NULL,
  'in_stock', true,
  '/Electronique/power-bank/hoco-j132a-20000mah-power-bank/main.webp',
  'باور بانك Hoco J132A 20000mAh مع خرج USB-A 15W + USB-C PD20W وكابلات Type-C و iP مدمجة.',
  'باور بانك Hoco J132A 20000mAh مع خرج USB-A 15W، خرج USB-C PD20W، كابل Type-C مدمج 22.5W وكابل iP مدمج 12W. لا حاجة لكابلات إضافية. مثالي للسفر، المدرسة، العمل، والاستخدام اليومي. التوصيل لجميع ولايات الجزائر الـ 58.',
  'hoco-j132a-20000mah-power-bank',
  'power bank,powerbank,batterie externe,chargeur portable,hoco,hoco j132a,j132a,power bank 20000mah,power bank algerie,powerbank dz,power bank algérie,batterie externe algérie,power bank usb c,power bank pd,power bank built-in cable,power bank type c,شاحن محمول,بنك طاقة,بطارية احتياطية,إلكترونيات,electronique',
  'Hoco',
  5
)
ON CONFLICT (slug) DO NOTHING;


-- ════════════════════════════════════════════════════════════════
-- VERIFY — should return 6 rows with correct data
-- ════════════════════════════════════════════════════════════════
SELECT
  catalog_id,
  display_order,
  product_name,
  slug,
  category,
  subcategory,
  price,
  stock_status,
  is_active,
  created_at::date  AS created
FROM admin_products_catalog
WHERE catalog_id BETWEEN 83 AND 88
ORDER BY catalog_id;
