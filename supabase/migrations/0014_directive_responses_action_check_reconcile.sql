-- If 0013 (older) ran but only dropped a misnamed constraint, the original inline
-- CHECK on `action` may still block REJECT. This migration is idempotent and safe
-- to run on a DB that already has the correct constraint.

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
