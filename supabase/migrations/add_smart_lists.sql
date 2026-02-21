CREATE TABLE IF NOT EXISTS smart_lists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  name        text        NOT NULL,
  config      jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_lists_user_id ON smart_lists(user_id);

ALTER TABLE smart_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "smart_lists_select" ON smart_lists FOR SELECT TO authenticated USING (true);
CREATE POLICY "smart_lists_insert" ON smart_lists FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "smart_lists_update" ON smart_lists FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "smart_lists_delete" ON smart_lists FOR DELETE TO authenticated USING (true);
