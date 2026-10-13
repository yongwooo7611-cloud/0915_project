create or replace function public.finalize_payment_cancellation(
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
    select coalesce(w.balance, 0) into v_balance
    from public.credit_wallets w where w.user_id = p_user_id;
    return query select coalesce(v_balance, 0), coalesce(v_order.canceled_amount, v_order.amount);
    return;
  end if;

  if v_order.status <> 'completed' or v_order.kind <> 'credit' then
    raise exception 'payment is not cancelable';
  end if;
  if p_cancel_amount <> v_order.amount then raise exception 'only full cancellation is supported'; end if;

  select w.balance into v_balance from public.credit_wallets w
  where w.user_id = p_user_id for update;
  if coalesce(v_balance, 0) < v_order.credits then
    raise exception 'insufficient credit balance for refund';
  end if;

  update public.credit_wallets as w
  set balance = w.balance - v_order.credits, updated_at = now()
  where w.user_id = p_user_id returning w.balance into v_balance;

  insert into public.credit_transactions(user_id, payment_order_id, amount, reason)
  values (p_user_id, v_order.id, -v_order.credits, 'payment_refund')
  on conflict (payment_order_id, reason) where payment_order_id is not null do nothing;

  update public.payment_orders set status = 'canceled', toss_status = p_toss_status,
    canceled_amount = p_cancel_amount, cancel_reason = p_cancel_reason,
    cancel_transaction_key = p_cancel_transaction_key, canceled_at = p_canceled_at
  where id = v_order.id;

  return query select v_balance, p_cancel_amount;
end;
$$;
