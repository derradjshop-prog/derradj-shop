-- ================================================================
-- REQUIRED: Allow anonymous visitors to submit reviews
-- Run this in Supabase SQL Editor BEFORE testing review.html
--
-- Without this policy, the form will get a 403 Forbidden error
-- because the current INSERT policy only allows authenticated staff.
-- ================================================================

-- Allow public (anon) visitors to INSERT a review
-- WITH CHECK ensures customers cannot self-approve or self-feature
DROP POLICY IF EXISTS "cr_anon_insert" ON public.customer_reviews;

CREATE POLICY "cr_anon_insert"
  ON public.customer_reviews
  FOR INSERT
  TO anon
  WITH CHECK (
    is_approved = FALSE    -- customers cannot self-approve
    AND is_featured = FALSE -- customers cannot mark their own review as featured
  );


-- ── Verify the policy was created ────────────────────────
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'customer_reviews'
ORDER BY cmd, policyname;
