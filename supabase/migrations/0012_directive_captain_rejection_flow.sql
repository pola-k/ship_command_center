-- Captain can REJECT a command directive with a reason; command must approve or overrule.

alter type public.directive_status add value if not exists 'rejected_pending_review';
alter type public.directive_status add value if not exists 'rejection_approved';

-- Inline CHECK on `action` (0006) may be named something other than directive_responses_action_check.
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

comment on column public.directives.status is
  'pending | accepted | … | rejected_pending_review (captain refused, awaits command) | rejection_approved';
