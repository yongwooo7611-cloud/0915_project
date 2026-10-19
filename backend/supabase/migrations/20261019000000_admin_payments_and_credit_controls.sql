begin;

alter table public.credit_transactions
  add column if not exists admin_id bigint references public.admins(id) on delete set null,
  add column if not exists balance_after integer check (balance_after is null or balance_after >= 0);

create index if not exists credit_transactions_admin_created_idx
  on public.credit_transactions(admin_id, created_at desc)
  where admin_id is not null;

with running_balances as (
  select id, sum(amount) over (
    partition by user_id order by created_at, id rows between unbounded preceding and current row
  )::integer as balance_after
  from public.credit_transactions
)
update public.credit_transactions as ct
set balance_after = running_balances.balance_after
from running_balances
where ct.id = running_balances.id
  and ct.balance_after is null;

create or replace function public.set_credit_transaction_balance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.balance_after is null then
    select balance into new.balance_after
    from public.credit_wallets
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists credit_transactions_set_balance on public.credit_transactions;
create trigger credit_transactions_set_balance
before insert on public.credit_transactions
for each row execute function public.set_credit_transaction_balance();

create or replace function public.adjust_user_credits(
  p_user_id bigint,
  p_amount integer,
  p_reason text,
  p_admin_id bigint
)
returns table(balance integer, transaction_id bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
  v_transaction_id bigint;
begin
  if p_amount = 0 or abs(p_amount::bigint) > 1000000 then
    raise exception 'credit adjustment amount is invalid';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 2 or char_length(trim(p_reason)) > 200 then
    raise exception 'credit adjustment reason is invalid';
  end if;
  if not exists (select 1 from public.users where id = p_user_id) then
    raise exception 'user not found';
  end if;
  if not exists (select 1 from public.admins where id = p_admin_id) then
    raise exception 'admin not found';
  end if;

  insert into public.credit_wallets(user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select w.balance into v_balance
  from public.credit_wallets w
  where w.user_id = p_user_id
  for update;

  if v_balance + p_amount < 0 then
    raise exception 'insufficient credit balance';
  end if;

  update public.credit_wallets as w
  set balance = w.balance + p_amount, updated_at = now()
  where w.user_id = p_user_id
  returning w.balance into v_balance;

  insert into public.credit_transactions(user_id, amount, reason, admin_id, balance_after)
  values (
    p_user_id,
    p_amount,
    case when p_amount > 0 then 'admin_grant: ' else 'admin_revoke: ' end || trim(p_reason),
    p_admin_id,
    v_balance
  )
  returning id into v_transaction_id;

  return query select v_balance, v_transaction_id;
end;
$$;

revoke all on function public.adjust_user_credits(bigint, integer, text, bigint)
  from public, anon, authenticated;
grant execute on function public.adjust_user_credits(bigint, integer, text, bigint)
  to service_role;

commit;
