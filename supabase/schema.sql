-- Run this in your Supabase SQL Editor

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (Extends Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  role TEXT DEFAULT 'Analyst',
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Threat Models
CREATE TABLE IF NOT EXISTS threat_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  risk_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Analyzing',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Result Cache (SHA-256 keyed)
CREATE TABLE IF NOT EXISTS agent_result_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash_key TEXT UNIQUE NOT NULL,
  agent_name TEXT NOT NULL,
  result JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RAG Chunks
CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  source_name TEXT NOT NULL,
  chunk_content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Required Controls Register
CREATE TABLE IF NOT EXISTS required_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  framework TEXT NOT NULL,
  control_id TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_mandatory BOOLEAN DEFAULT true
);