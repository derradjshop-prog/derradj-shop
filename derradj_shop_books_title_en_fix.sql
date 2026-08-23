UPDATE public.admin_products_catalog
SET product_name_ar = title_en
WHERE category = 'books' AND title_en IS NOT NULL AND product_name_ar IS NULL;

-- Spot-check
SELECT catalog_id, product_name, product_name_ar, title_en FROM public.admin_products_catalog
WHERE category = 'books' ORDER BY catalog_id LIMIT 5;
