begin;

alter table public.subscriptions
  add column if not exists renewal_mode text not null default 'automatic'
    check (renewal_mode in ('automatic', 'manual'));

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'canceled', 'past_due', 'expired'));

create or replace function public.finalize_manual_subscription_payment(
  p_order_id text,
  p_user_id bigint,
  p_payment_key text,
  p_toss_status text,
  p_method text,
  p_receipt_url text,
  p_approved_at timestamptz
)
returns table(balance integer, credited integer, period_ends_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.payment_orders%rowtype;
  v_balance integer;
  v_period_end timestamptz;
begin
  select * into v_order from public.payment_orders
  where order_id = p_order_id and user_id = p_user_id for update;
  if not found or v_order.kind <> 'subscription' then raise exception 'subscription order not found'; end if;

  if v_order.status = 'completed' then
    select coalesce(w.balance, 0) into v_balance from public.credit_wallets w where w.user_id = p_user_id;
    select s.current_period_ends_at into v_period_end from public.subscriptions s where s.user_id = p_user_id;
    return query select coalesce(v_balance, 0), v_order.credits, v_period_end;
    return;
  end if;

  if exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and s.status = 'active' and s.current_period_ends_at > now()
  ) then raise exception 'active subscription already exists'; end if;

  v_period_end := p_approved_at + interval '30 days';
  update public.payment_orders set status = 'completed', payment_key = p_payment_key,
    toss_status = p_toss_status, method = p_method, receipt_url = p_receipt_url,
    approved_at = p_approved_at, failure_code = null
  where id = v_order.id;

  insert into public.subscriptions(user_id, plan_id, status, customer_key, billing_key, amount,
    monthly_credits, current_period_started_at, current_period_ends_at, last_payment_order_id,
    canceled_at, renewal_mode)
  values (p_user_id, v_order.product_id, 'active', 'manual_' || p_user_id::text, null, v_order.amount,
    v_order.credits, p_approved_at, v_period_end, v_order.id, null, 'manual')
  on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'active',
    customer_key = excluded.customer_key, billing_key = null, amount = excluded.amount,
    monthly_credits = excluded.monthly_credits, current_period_started_at = excluded.current_period_started_at,
    current_period_ends_at = excluded.current_period_ends_at, last_payment_order_id = excluded.last_payment_order_id,
    canceled_at = null, renewal_mode = 'manual';

  insert into public.credit_wallets(user_id, balance) values (p_user_id, v_order.credits)
  on conflict (user_id) do update set balance = public.credit_wallets.balance + excluded.balance, updated_at = now()
  returning public.credit_wallets.balance into v_balance;

  insert into public.credit_transactions(user_id, payment_order_id, amount, reason, balance_after)
  values (p_user_id, v_order.id, v_order.credits, 'subscription_payment', v_balance);

  return query select v_balance, v_order.credits, v_period_end;
end;
$$;

create or replace function public.finalize_subscription_refund(
  p_order_id text,
  p_user_id bigint,
  p_toss_status text,
  p_cancel_amount integer,
  p_cancel_reason text,
  p_cancel_transaction_key text,
  p_canceled_at timestamptz
)
returns table(balance integer, refunded integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.payment_orders%rowtype;
  v_balance integer;
begin
  select * into v_order from public.payment_orders
  where order_id = p_order_id and user_id = p_user_id for update;
  if not found then raise exception 'payment order not found'; end if;

  if v_order.status = 'canceled' then
    select coalesce(w.balance, 0) into v_balance from public.credit_wallets w where w.user_id = p_user_id;
    return query select coalesce(v_balance, 0), coalesce(v_order.canceled_amount, v_order.amount);
    return;
  end if;
  if v_order.status <> 'completed' or v_order.kind <> 'subscription' then
    raise exception 'subscription payment is not refundable';
  end if;
  if p_cancel_amount <> v_order.amount then raise exception 'only full cancellation is supported'; end if;
  if not exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id and s.last_payment_order_id = v_order.id
  ) then raise exception 'only latest subscription payment is refundable'; end if;

  select w.balance into v_balance from public.credit_wallets w
  where w.user_id = p_user_id for update;
  if coalesce(v_balance, 0) < v_order.credits then raise exception 'insufficient credit balance for refund'; end if;

  update public.credit_wallets as w set balance = w.balance - v_order.credits, updated_at = now()
  where w.user_id = p_user_id returning w.balance into v_balance;

  insert into public.credit_transactions(user_id, payment_order_id, amount, reason, balance_after)
  values (p_user_id, v_order.id, -v_order.credits, 'subscription_refund', v_balance)
  on conflict (payment_order_id, reason) where payment_order_id is not null do nothing;

  update public.payment_orders set status = 'canceled', toss_status = p_toss_status,
    canceled_amount = p_cancel_amount, cancel_reason = p_cancel_reason,
    cancel_transaction_key = p_cancel_transaction_key, canceled_at = p_canceled_at
  where id = v_order.id;

  update public.subscriptions set status = 'canceled', billing_key = null, canceled_at = p_canceled_at
  where user_id = p_user_id and last_payment_order_id = v_order.id;

  return query select v_balance, p_cancel_amount;
end;
$$;

revoke all on function public.finalize_manual_subscription_payment(text, bigint, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.finalize_subscription_refund(text, bigint, text, integer, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.finalize_manual_subscription_payment(text, bigint, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.finalize_subscription_refund(text, bigint, text, integer, text, text, timestamptz)
  to service_role;

commit;
