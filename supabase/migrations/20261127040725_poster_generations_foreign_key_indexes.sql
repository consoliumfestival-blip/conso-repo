CREATE INDEX IF NOT EXISTS idx_poster_generations_festival_id
  ON public.poster_generations (festival_id);

CREATE INDEX IF NOT EXISTS idx_poster_generations_item_id
  ON public.poster_generations (item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poster_generations_result_id
  ON public.poster_generations (result_id)
  WHERE result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_poster_generations_superseded_by_generation_id
  ON public.poster_generations (superseded_by_generation_id)
  WHERE superseded_by_generation_id IS NOT NULL;
