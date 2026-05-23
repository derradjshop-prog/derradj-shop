-- ============================================================
-- Derradj Shop — Reviews System
-- نظام التقييمات والآراء
-- Run entirely in Supabase SQL Editor
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- 1. TABLE: reviews
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reviews (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Customer identity (private — never exposed publicly)
  first_name           TEXT         NOT NULL CHECK (TRIM(first_name) <> ''),
  last_name            TEXT         NOT NULL CHECK (TRIM(last_name)  <> ''),

  -- Public display name — auto-generated if empty (e.g. "أمين ب.")
  display_name         TEXT,

  -- Location
  wilaya               TEXT         NOT NULL CHECK (TRIM(wilaya) <> ''),

  -- Review content
  rating               SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment              TEXT         NOT NULL CHECK (TRIM(comment) <> ''),

  -- What was purchased — array of {title, price} objects
  -- Example: [{"title":"العادات الذرية","price":900},{"title":"قوة الآن","price":850}]
  purchased_items      JSONB        NOT NULL DEFAULT '[]'::jsonb,

  -- Optional: if customer bought a bundle/package
  package_name         TEXT,

  -- Purchase financials
  total_price          NUMERIC(10,2),

  -- Link to a real order (optional — enables verified purchase badge)
  order_id             UUID         REFERENCES public.orders(id) ON DELETE SET NULL,

  -- Flags
  is_verified_purchase BOOLEAN      NOT NULL DEFAULT FALSE,
  is_approved          BOOLEAN      NOT NULL DEFAULT FALSE,  -- admin must approve before showing publicly

  -- How this review was collected
  -- 'manual'   → added by admin from dashboard
  -- 'website'  → submitted via website form (future)
  -- 'whatsapp' → collected from WhatsApp conversation
  -- 'import'   → bulk imported
  source               TEXT         NOT NULL DEFAULT 'manual'
                                    CHECK (source IN ('manual','website','whatsapp','import')),

  -- Internal notes for admin (never shown publicly)
  admin_notes          TEXT,

  -- Timestamps
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.reviews IS 'Customer reviews / testimonials — Derradj Shop';
COMMENT ON COLUMN public.reviews.purchased_items  IS 'JSON array of {title, price} — books or products bought';
COMMENT ON COLUMN public.reviews.is_approved      IS 'Only TRUE reviews are visible publicly on homepage';
COMMENT ON COLUMN public.reviews.source           IS 'How the review was collected (manual/website/whatsapp/import)';


-- ──────────────────────────────────────────────────────────────
-- 2. TRIGGER: auto-fill display_name from first_name + last initial
--    If display_name is left empty → "أمين ب." style
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reviews_fill_display_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.display_name IS NULL OR TRIM(NEW.display_name) = '' THEN
    NEW.display_name := NEW.first_name || ' ' || LEFT(NEW.last_name, 1) || '.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_fill_display_name ON public.reviews;
CREATE TRIGGER trg_reviews_fill_display_name
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.reviews_fill_display_name();


-- ──────────────────────────────────────────────────────────────
-- 3. TRIGGER: auto-update updated_at on every row update
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reviews_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.reviews_set_updated_at();


-- ──────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- ● Anonymous visitors: read ONLY approved reviews
DROP POLICY IF EXISTS "reviews_anon_read_approved" ON public.reviews;
CREATE POLICY "reviews_anon_read_approved"
  ON public.reviews
  FOR SELECT
  TO anon
  USING (is_approved = TRUE);

-- ● Authenticated users: approved reviews, OR all reviews if they are staff
DROP POLICY IF EXISTS "reviews_auth_read" ON public.reviews;
CREATE POLICY "reviews_auth_read"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    is_approved = TRUE
    OR EXISTS (
      SELECT 1 FROM public.staff_accounts sa
      WHERE sa.id = auth.uid()
        AND sa.is_active = TRUE
        AND sa.role IN ('admin', 'staff')
    )
  );

-- ● Staff only: INSERT
DROP POLICY IF EXISTS "reviews_staff_insert" ON public.reviews;
CREATE POLICY "reviews_staff_insert"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_accounts sa
      WHERE sa.id = auth.uid()
        AND sa.is_active = TRUE
        AND sa.role IN ('admin', 'staff')
    )
  );

-- ● Staff only: UPDATE (approve, edit, etc.)
DROP POLICY IF EXISTS "reviews_staff_update" ON public.reviews;
CREATE POLICY "reviews_staff_update"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts sa
      WHERE sa.id = auth.uid()
        AND sa.is_active = TRUE
        AND sa.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_accounts sa
      WHERE sa.id = auth.uid()
        AND sa.is_active = TRUE
        AND sa.role IN ('admin', 'staff')
    )
  );

-- ● Staff only: DELETE
DROP POLICY IF EXISTS "reviews_staff_delete" ON public.reviews;
CREATE POLICY "reviews_staff_delete"
  ON public.reviews
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_accounts sa
      WHERE sa.id = auth.uid()
        AND sa.is_active = TRUE
        AND sa.role IN ('admin', 'staff')
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 5. INDEXES — for fast homepage queries and admin filtering
-- ──────────────────────────────────────────────────────────────

-- Homepage: SELECT * FROM reviews WHERE is_approved = TRUE ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_reviews_approved_date
  ON public.reviews (created_at DESC)
  WHERE is_approved = TRUE;

-- Admin: filter by approval status
CREATE INDEX IF NOT EXISTS idx_reviews_is_approved
  ON public.reviews (is_approved);

-- Admin: link to order
CREATE INDEX IF NOT EXISTS idx_reviews_order_id
  ON public.reviews (order_id)
  WHERE order_id IS NOT NULL;

-- Admin / stats: filter by rating
CREATE INDEX IF NOT EXISTS idx_reviews_rating
  ON public.reviews (rating);


-- ──────────────────────────────────────────────────────────────
-- 6. SAMPLE DATA — 3 realistic book reviews (approved = TRUE)
--    These replace the 3 hardcoded cards from the homepage
-- ──────────────────────────────────────────────────────────────
INSERT INTO public.reviews
  (first_name, last_name, wilaya, rating, comment,
   purchased_items, total_price, is_verified_purchase, is_approved, source)
VALUES
  (
    'أمين', 'بن علي', 'الجزائر العاصمة', 5,
    'طلبت كتاب العادات الذرية وكتاب قوة الآن. وصلا خلال يومين بتغليف ممتاز. الأسعار معقولة جداً ومش لقيتها بهالسعر في أي مكان ثاني. شكراً Derradj Shop!',
    '[{"title":"العادات الذرية","price":900},{"title":"قوة الآن","price":850}]',
    1750, TRUE, TRUE, 'manual'
  ),
  (
    'سارة', 'مزياني', 'وهران', 5,
    'طلبت كتاب الذكاء العاطفي وكتاب بروباغندا. جاوا بسرعة وبحالة ممتازة. الخدمة محترفة والتواصل سريع. أنصح بيه كل من يحب القراءة!',
    '[{"title":"الذكاء العاطفي","price":800},{"title":"بروباغندا","price":750}]',
    1550, TRUE, TRUE, 'whatsapp'
  ),
  (
    'كريم', 'رحال', 'قسنطينة', 5,
    'اشتريت ثلاثة كتب في تطوير الذات. الجودة فاقت توقعاتي والأسعار أرخص من أي مكتبة في قسنطينة. متجر موثوق وأنا هنشري منو دائماً!',
    '[{"title":"فن الإتقان","price":850},{"title":"السر","price":700},{"title":"العقل فوق المادة","price":750}]',
    2300, TRUE, TRUE, 'manual'
  );


-- ──────────────────────────────────────────────────────────────
-- ✅ Done — verify with:
--
-- SELECT id, display_name, wilaya, rating, is_approved, created_at
-- FROM public.reviews
-- ORDER BY created_at DESC;
--
-- Public-safe view (what homepage sees):
-- SELECT display_name, wilaya, rating, comment, purchased_items,
--        total_price, is_verified_purchase, created_at
-- FROM public.reviews
-- WHERE is_approved = TRUE
-- ORDER BY created_at DESC;
-- ──────────────────────────────────────────────────────────────
