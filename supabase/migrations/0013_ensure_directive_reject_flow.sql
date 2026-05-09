-- Captain refuse uses action REJECT. Base schema (0006) inlined CHECK(action in (...));
-- Postgres names that constraint unpredictably (not always directive_responses_action_check),
-- so "drop constraint if exists directive_responses_action_check" can miss it and REJECT
-- still fails with 23514. Drop every CHECK on this table, then add the one we need.

alter type public.directive_status add value if not exists 'rejected_pending_review';
alter type public.directive_status add value if not exists 'rejection_approved';

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.directive_responses'::regclass
      and c.contype = 'c'
  loop
    execute format(
      'alter table public.directive_responses drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.directive_responses
  add constraint directive_responses_action_check
  check (action in ('ACCEPT', 'ESCALATE_DISTRESS', 'REJECT'));
