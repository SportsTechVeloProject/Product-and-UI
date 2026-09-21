CREATE TABLE public.workout_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  set_label TEXT NOT NULL DEFAULT 'Set 1',
  load_kg NUMERIC NOT NULL DEFAULT 20,
  reps JSONB NOT NULL DEFAULT '[]'::jsonb,
  mean_velocity NUMERIC NOT NULL DEFAULT 0,
  peak_velocity NUMERIC NOT NULL DEFAULT 0,
  avg_power NUMERIC NOT NULL DEFAULT 0,
  consistency NUMERIC NOT NULL DEFAULT 0,
  velocity_loss NUMERIC NOT NULL DEFAULT 0,
  performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sets TO authenticated;
GRANT ALL ON public.workout_sets TO service_role;

ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own workout sets"
ON public.workout_sets FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX workout_sets_user_performed_idx ON public.workout_sets (user_id, performed_at DESC);