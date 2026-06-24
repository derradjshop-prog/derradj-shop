ALTER TABLE public.books ADD COLUMN IF NOT EXISTS full_description TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS keywords TEXT;

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='books'
ORDER BY column_name;
