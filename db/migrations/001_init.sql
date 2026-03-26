-- Iris Bootstrap Schema
-- Core tables for the self-improving loop

CREATE TABLE IF NOT EXISTS cycles (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('proposal', 'question', 'need')),
  status TEXT NOT NULL DEFAULT 'thinking' CHECK (status IN ('thinking', 'proposed', 'chatting', 'approved', 'executing', 'waiting', 'completed', 'failed')),
  proposal_text TEXT,
  reasoning TEXT,
  wait_for_task_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER NOT NULL REFERENCES cycles(id),
  role TEXT NOT NULL CHECK (role IN ('iris', 'manager')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER REFERENCES cycles(id),
  cursor_agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  description TEXT,
  result_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS log_entries (
  id SERIAL PRIMARY KEY,
  cycle_id INTEGER REFERENCES cycles(id),
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed with Iris's initial strategy
INSERT INTO strategy (version, content) VALUES (1, 
'# Iris Strategy v1

## Mission
Maximize human flourishing in the age of AI.

## Current Focus: Checkpoint A
1. Build a super-connected community of leaders
2. Get to know each leader personally
3. Connect them with people, ideas, and opportunities aligned with their goals
4. Create useful SaaS products autonomously to generate income from this audience

## Immediate Priority
Upgrade my own systems to be more capable. Each cycle I should be asking:
- What capability am I missing that would unlock the most value?
- What can I automate that I currently depend on the manager for?
- What information do I need to gather?
');

CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cycles_status ON cycles(status);
CREATE INDEX IF NOT EXISTS idx_log_entries_created ON log_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_messages_cycle ON messages(cycle_id);
