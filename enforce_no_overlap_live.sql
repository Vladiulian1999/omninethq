BEGIN;

-- 1) Clean up bad data that would block the constraint:
--    LIVE blocks must have a valid time window, otherwise we can't enforce overlap rules.
--    Anything LIVE with invalid times gets downgraded to paused.
UPDATE public.availability_blocks
SET status = 'paused'::availability_block_status,
    updated_at = now(),
    meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
      'auto_paused_reason', 'invalid_time_window_for_live',
      'auto_paused_at', now()
    )
WHERE status = 'live'::availability_block_status
  AND (
    start_at IS NULL
    OR end_at IS NULL
    OR end_at <= start_at
  );

-- 2) If you currently have overlaps, you MUST resolve them before the constraint can be added.
--    This query will ERROR OUT (via ON_ERROR_STOP) if overlaps exist after cleanup.
--    It returns overlapping pairs.
DO $$
DECLARE
  overlap_count int;
BEGIN
  SELECT COUNT(*)
  INTO overlap_count
  FROM public.availability_blocks a
  JOIN public.availability_blocks b
    ON a.tag_id = b.tag_id
   AND a.id <> b.id
   AND a.status = 'live'::availability_block_status
   AND b.status = 'live'::availability_block_status
   AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
   AND a.start_at IS NOT NULL AND a.end_at IS NOT NULL
   AND b.start_at IS NOT NULL AND b.end_at IS NOT NULL;

  IF overlap_count > 0 THEN
    RAISE EXCEPTION 'Cannot add no-overlap constraint: % overlapping LIVE block pairs exist. Run the overlap report query and fix data first.', overlap_count;
  END IF;
END $$;

-- 3) Needed for EXCLUDE constraint operator class on text.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 4) Enforce: LIVE blocks must have a sane time window.
--    (This is the only way to make "no overlaps" meaningful.)
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_live_requires_time_window
  CHECK (
    status <> 'live'::availability_block_status
    OR (
      start_at IS NOT NULL
      AND end_at IS NOT NULL
      AND end_at > start_at
    )
  );

-- 5) Enforce: No overlapping LIVE blocks per tag_id.
--    Uses GiST EXCLUDE constraint on (tag_id, time range).
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_no_overlap_live_per_tag
  EXCLUDE USING gist (
    tag_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status = 'live'::availability_block_status);

COMMIT;
