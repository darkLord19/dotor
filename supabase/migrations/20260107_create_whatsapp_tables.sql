-- Browser instances table to track WhatsApp Web browser sessions
CREATE TABLE IF NOT EXISTS browser_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disconnected',
  last_seen_at timestamptz DEFAULT now(),
  last_sync_at timestamptz DEFAULT NULL,
  sync_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- WhatsApp messages table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  chat_id text NOT NULL,
  chat_name text,
  sender text NOT NULL,
  content text NOT NULL,
  message_timestamp text NOT NULL,
  is_from_me boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, message_id)
);

-- Enable RLS
ALTER TABLE browser_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for browser_instances
CREATE POLICY "Users can view own browser instances"
  ON browser_instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own browser instances"
  ON browser_instances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own browser instances"
  ON browser_instances FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own browser instances"
  ON browser_instances FOR DELETE
  USING (auth.uid() = user_id);

-- RLS policies for whatsapp_messages
CREATE POLICY "Users can view own whatsapp messages"
  ON whatsapp_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own whatsapp messages"
  ON whatsapp_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own whatsapp messages"
  ON whatsapp_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_browser_instances_user_id ON browser_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_browser_instances_status ON browser_instances(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user_id ON whatsapp_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_chat_id ON whatsapp_messages(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_received_at ON whatsapp_messages(received_at DESC);

-- Updated at trigger for browser_instances
CREATE OR REPLACE FUNCTION update_browser_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_browser_instances_updated_at ON browser_instances;
CREATE TRIGGER update_browser_instances_updated_at
  BEFORE UPDATE ON browser_instances
  FOR EACH ROW
  EXECUTE FUNCTION update_browser_instances_updated_at();
