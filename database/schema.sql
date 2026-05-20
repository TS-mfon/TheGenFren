create extension if not exists vector;

create table if not exists users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  wallet_address text not null unique,
  encrypted_private_key text not null,
  encrypted_private_key_nonce text not null default '',
  vault_salt text not null default '',
  status text not null check (status in ('pending_payment', 'active')),
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists payment_receipts (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  network text not null check (network in ('bradbury')),
  amount_gen numeric(18, 6) not null,
  treasury_address text not null,
  sender_address text not null default '',
  tx_hash text not null unique,
  status text not null check (status in ('pending_submission', 'submitted', 'confirmed', 'rejected')),
  rejection_reason text not null default '',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  owner_id text not null references users(id) on delete cascade,
  name text not null,
  archetype text not null,
  status text not null check (status in ('pending_payment', 'provisioning', 'active', 'paused')),
  contract_address text not null unique,
  factory_contract_address text not null,
  created_at timestamptz not null default now()
);

create table if not exists deployments (
  id text primary key,
  user_id text references users(id) on delete cascade,
  agent_id text references agents(id) on delete cascade,
  subagent_id text,
  network text not null,
  kind text not null,
  tx_hash text not null unique,
  contract_address text not null default '',
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists autonomy_policies (
  agent_id text primary key references agents(id) on delete cascade,
  max_daily_runs integer not null,
  max_active_subagents integer not null,
  allowed_source_classes text[] not null,
  can_draft_content boolean not null,
  can_create_subagents boolean not null,
  can_schedule_monitoring boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists subagents (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  name text not null,
  archetype text not null,
  role text not null,
  contract_address text not null unique,
  status text not null check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  topic text not null,
  objective text not null,
  source_urls text[] not null default '{}',
  cadence text not null check (cadence in ('daily', 'weekly')),
  tone text not null,
  status text not null check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

create table if not exists briefings (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  goal_id text references goals(id) on delete set null,
  title text not null,
  summary text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  consensus_state text not null check (consensus_state in ('verified', 'contested', 'degraded')),
  source_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memory_items (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  type text not null,
  summary text not null,
  importance text not null check (importance in ('high', 'medium', 'low')),
  embedding vector(1536),
  memory_hash text not null,
  source_briefing_id text references briefings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists conversation_branches (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  branch_key text not null,
  summary text not null,
  last_active_at timestamptz not null default now()
);

create table if not exists tasks (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  subagent_id text references subagents(id) on delete set null,
  goal_id text references goals(id) on delete set null,
  name text not null,
  kind text not null,
  cadence text not null,
  status text not null check (status in ('scheduled', 'running', 'completed', 'failed', 'paused')),
  created_at timestamptz not null default now()
);

create table if not exists task_runs (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status text not null check (status in ('scheduled', 'running', 'completed', 'failed', 'paused')),
  result_summary text not null default '',
  error_code text not null default ''
);

create table if not exists source_evidence (
  id text primary key,
  task_run_id text references task_runs(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  source_url text not null,
  title text not null default '',
  excerpt text not null default '',
  content_hash text not null,
  fetched_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  agent_id text references agents(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists delegations (
  id text primary key,
  agent_id text not null references agents(id) on delete cascade,
  owner_id text not null references users(id) on delete cascade,
  delegate_handle text not null,
  delegate_address text not null,
  role text not null check (role in ('viewer', 'operator', 'admin')),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_type text not null,
  actor_id text not null,
  agent_id text references agents(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
