-- RPC function for similarity search on technote sections
-- Uses cosine distance for ranking (lower = more similar)

create or replace function match_sections(
  query_embedding vector(1536),
  match_count int default 5,
  filter_technote_id text default null
)
returns table (
  id text,
  technote_id text,
  section_idx int,
  heading text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    ts.id,
    ts.technote_id,
    ts.section_idx,
    ts.heading,
    ts.content,
    (ts.embedding <=> query_embedding) as similarity
  from technote_sections ts
  where ts.embedding is not null
    and (filter_technote_id is null or ts.technote_id = filter_technote_id)
  order by ts.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Grant execute permission
grant execute on function match_sections to anon, authenticated;
