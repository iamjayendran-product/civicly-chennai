-- GCC filing log (spec: docs/superpowers/specs/2026-10-21-gcc-filing-admin-design.md §4–5).
-- Jay files reports with GCC by hand and records the complaint number here. Everything is
-- admin-only: no grants, no policies, nothing on public.reports or Realtime.

-- Codes mirror the eGovernments PGR workflow GCC's portal runs on. Display labels live
-- in the i18n catalog.
create type public.gcc_status as enum (
  'registered', 'forwarded', 'processing', 'completed',
  'rejected', 'reopened', 'withdrawn', 'not_completed'
);

-- One row per filed report.
create table public.gcc_filings (
  report_id     uuid primary key references public.reports(id) on delete cascade,
  complaint_id  text not null check (char_length(complaint_id) between 3 and 40),
  status        public.gcc_status not null default 'registered',
  note          text check (char_length(note) <= 1000),
  filed_at      timestamptz not null default now(),
  filed_by      uuid not null references auth.users(id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid not null references auth.users(id)
);
create index gcc_filings_complaint_id_idx on public.gcc_filings (complaint_id);

-- Append-only history of every save.
create table public.gcc_filing_events (
  id           bigserial primary key,
  report_id    uuid not null references public.reports(id) on delete cascade,
  complaint_id text not null,
  status       public.gcc_status not null,
  note         text,
  actor        uuid not null references auth.users(id),
  created_at   timestamptz not null default now()
);
create index gcc_filing_events_report_id_idx on public.gcc_filing_events (report_id, created_at);

alter table public.gcc_filings enable row level security;
alter table public.gcc_filing_events enable row level security;
revoke all on public.gcc_filings from anon, authenticated;
revoke all on public.gcc_filing_events from anon, authenticated;

-- Record (first save) or update (later saves) the GCC filing for one report.
-- filed_at/filed_by are set once; every save appends a history row. Complaint IDs are not
-- unique — near-duplicate reports may share one GCC complaint — so the other reports
-- carrying the same ID are returned for the UI to mention.
create or replace function public.admin_save_gcc_filing(
  p_report_id uuid,
  p_complaint_id text,
  p_status public.gcc_status default 'registered',
  p_note text default null
)
returns table (
  report_id uuid,
  complaint_id text,
  status public.gcc_status,
  note text,
  filed_at timestamptz,
  updated_at timestamptz,
  duplicate_of uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_complaint_id text := upper(btrim(coalesce(p_complaint_id, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if char_length(v_complaint_id) not between 3 and 40
     or char_length(coalesce(v_note, '')) > 1000
     or p_status is null
     or not exists (select 1 from public.reports r where r.id = p_report_id) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  insert into public.gcc_filings as g (report_id, complaint_id, status, note, filed_by, updated_by)
  values (p_report_id, v_complaint_id, p_status, v_note, v_uid, v_uid)
  on conflict (report_id) do update
    set complaint_id = excluded.complaint_id,
        status = excluded.status,
        note = excluded.note,
        updated_at = now(),
        updated_by = excluded.updated_by;

  insert into public.gcc_filing_events (report_id, complaint_id, status, note, actor)
  values (p_report_id, v_complaint_id, p_status, v_note, v_uid);

  return query
    select g.report_id, g.complaint_id, g.status, g.note, g.filed_at, g.updated_at,
           coalesce(
             (select array_agg(o.report_id order by o.filed_at)
                from public.gcc_filings o
               where o.complaint_id = g.complaint_id and o.report_id <> g.report_id),
             '{}'::uuid[]
           )
      from public.gcc_filings g
     where g.report_id = p_report_id;
end;
$$;

revoke execute on function public.admin_save_gcc_filing(uuid, text, public.gcc_status, text) from public;
grant execute on function public.admin_save_gcc_filing(uuid, text, public.gcc_status, text) to authenticated;
