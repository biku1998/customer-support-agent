-- Enable pgvector extension for vector similarity search
create extension if not exists vector;

-- Technotes table (article-level metadata)
create table if not exists technotes (
  id text primary key,
  title text not null,
  full_text text,
  section_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Technote sections table (the primary retrieval unit for RAG)
create table if not exists technote_sections (
  id text primary key,                    -- stable section id: {technoteId}#{sectionIdx}
  technote_id text not null references technotes(id) on delete cascade,
  section_idx integer not null,
  heading text,
  content text not null,
  span_start integer,
  span_end integer,
  embedding vector(1536),                 -- OpenAI text-embedding-3-small dimension
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(technote_id, section_idx)
);

-- HNSW index for fast cosine similarity search
-- Using vector_cosine_ops for cosine distance (most common for text embeddings)
create index if not exists technote_sections_embedding_hnsw
on technote_sections
using hnsw (embedding vector_cosine_ops);

-- Index for looking up sections by technote
create index if not exists technote_sections_technote_id_idx
on technote_sections(technote_id);

-- QA dev set table (for retrieval evaluation)
create table if not exists qa_dev (
  id text primary key,                    -- question ID
  title text not null,
  question text not null,
  answer text,
  answerable boolean not null default true,
  gold_technote_id text,                  -- references technotes, but nullable for unanswerable
  answer_span_start integer,
  answer_span_end integer,
  candidate_doc_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Index for filtering by answerable status
create index if not exists qa_dev_answerable_idx
on qa_dev(answerable);

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger technotes_updated_at
  before update on technotes
  for each row execute function update_updated_at_column();

create trigger technote_sections_updated_at
  before update on technote_sections
  for each row execute function update_updated_at_column();
