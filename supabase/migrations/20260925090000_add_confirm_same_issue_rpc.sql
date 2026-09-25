-- "Same issue" confirmation, without the Google-linked-account requirement the spec
-- originally called for (product decision, 2026-09-25 — see CLAUDE.md rule 2). Any
-- session (anonymous included) can confirm an existing report is the same issue they
-- were about to log; this increments the report's own upvote_count directly rather
-- than creating a votes table with per-user dedup, matching the simplified bar
-- create_report already sets for anonymous reporting. Abuse is bounded the same way
-- create_report bounds it: a per-user rate limit via the existing rate_events table.

create or replace function public.confirm_same_issue(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := (auth.jwt() ->> 'sub')::uuid;
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.rate_events
    where user_id = v_user_id and action = 'confirm' and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  update public.reports
  set upvote_count = upvote_count + 1
  where id = p_report_id and is_hidden = false;

  if not found then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  insert into public.rate_events (user_id, action)
  values (v_user_id, 'confirm');
end;
$$;

revoke execute on function public.confirm_same_issue(uuid) from public;
grant execute on function public.confirm_same_issue(uuid) to anon, authenticated;
