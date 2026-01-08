-- Add missing columns to browser_instances
ALTER TABLE browser_instances ADD COLUMN IF NOT EXISTS fly_machine_id text;
ALTER TABLE browser_instances ADD COLUMN IF NOT EXISTS linked_at timestamptz;
ALTER TABLE browser_instances ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz;

-- Ensure connections table exists
CREATE TABLE IF NOT EXISTS connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL, -- 'whatsapp', 'google', etc.
    browser_instance_id uuid REFERENCES browser_instances(id) ON DELETE SET NULL,
    email text,
    access_token text,
    refresh_token text,
    token_expires_at timestamptz,
    scopes text[],
    sync_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, type)
);

-- Ensure synced_conversations table exists
CREATE TABLE IF NOT EXISTS synced_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source text NOT NULL, -- 'whatsapp', 'linkedin', etc.
    external_id text NOT NULL, -- generic 'chatId'
    title text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, source, external_id)
);

-- Ensure synced_messages table exists
CREATE TABLE IF NOT EXISTS synced_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES synced_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id text NOT NULL, -- message id
    sender text NOT NULL,
    content text,
    timestamp timestamptz, -- message timestamp
    received_at timestamptz DEFAULT now(), -- when we synced it
    is_from_me boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    UNIQUE(user_id, conversation_id, external_id)
);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE synced_messages ENABLE ROW LEVEL SECURITY;

-- Policies for connections
DO $$ BEGIN
  CREATE POLICY "Users can view own connections" ON connections FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own connections" ON connections FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own connections" ON connections FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own connections" ON connections FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Policies for synced_conversations
DO $$ BEGIN
  CREATE POLICY "Users can view own conversations" ON synced_conversations FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own conversations" ON synced_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own conversations" ON synced_conversations FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own conversations" ON synced_conversations FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Policies for synced_messages
DO $$ BEGIN
  CREATE POLICY "Users can view own messages" ON synced_messages FOR SELECT USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own messages" ON synced_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own messages" ON synced_messages FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own messages" ON synced_messages FOR DELETE USING (auth.uid() = user_id);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);
CREATE INDEX IF NOT EXISTS idx_synced_conversations_user_id ON synced_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_synced_messages_conversation_id ON synced_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_synced_messages_timestamp ON synced_messages(timestamp DESC);
