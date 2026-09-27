-- Nearest-neighbour search over a user's own resume chunks.
--
-- Split out of 20260926190000: that migration was applied out of band and
-- everything in it succeeded EXCEPT this function.
--
-- WHY THIS IS plpgsql WITH A DYNAMIC QUERY rather than a plain `language sql`
-- function. A SQL-language function has its parameter types and its body
-- resolved at CREATE time, so it needs the `vector` type to be resolvable
-- right then. Depending on how the extension was enabled it may live in
-- `extensions`, in `public`, or somewhere else, and neither the qualified name
-- nor an unqualified one resolved reliably from the migration connection —
-- while the `embedding` column created against it works fine.
--
-- Deferring to a dynamic EXECUTE means `vector` and the `<=>` operator are
-- resolved at CALL time through the function's own search_path, which works
-- wherever the extension actually is. The parameter is text because pgvector
-- parses its own literal syntax (`[0.1,0.2,...]`) — exactly what
-- JSON.stringify of a number[] produces.
--
-- `security invoker` (the default) on purpose, so RLS applies INSIDE the
-- function and a caller can only ever match their own chunks. The
-- `resume_id` filter is defence in depth, not the security boundary.

create or replace function public.match_resume_chunks (
  p_resume_id uuid,
  p_query text,
  p_match_count int default 5
)
returns table (id uuid, seq int, section text, content text, similarity float)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $fn$
begin
  return query execute
    'select c.id,
            c.seq,
            c.section,
            c.content,
            1 - (c.embedding <=> $1::vector) as similarity
       from public.resume_chunks c
      where c.resume_id = $2
        and c.embedding is not null
      order by c.embedding <=> $1::vector asc
      limit $3'
    using p_query, p_resume_id, least(greatest(p_match_count, 1), 50);
end;
$fn$;

grant execute on function public.match_resume_chunks(uuid, text, int)
  to authenticated;
