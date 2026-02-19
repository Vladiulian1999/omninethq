SELECT id, tag_id, status, start_at, end_at
FROM public.availability_blocks
WHERE tag_id='tag-ovypw'
  AND status='live'::availability_block_status
  AND (start_at IS NULL OR start_at <= now())
  AND (end_at IS NULL OR end_at > now())
ORDER BY start_at ASC;
