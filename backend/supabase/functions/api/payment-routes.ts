import { assertDatabase, db } from '../_shared/database.ts'
import { requiredEnv } from '../_shared/env.ts'
import { requireSession } from '../_shared/auth.ts'
import { bodyJson, HttpError, json } from '../_shared/http.ts'

const creditProducts = {
  'credit-100': { amount: 1000, credits: 100, name: '모아 크레딧 100개' },
  'credit-550': { amount: 5000, credits: 550, name: '모아 크레딧 550개' },
  'credit-1200': { amount: 10000, credits: 1200, name: '모아 크레딧 1,200개' },
} as const

const subscriptionPlans = {
  sprout: { amount: 4900, credits: 300, name: '모아 새싹 멤버십' },
  forest: { amount: 9900, credits: 800, name: '모아 숲 멤버십' },
} as const

type TossPayment = {
  paymentKey: string; orderId: string; status: string; method?: string;
  totalAmount?: number; balanceAmount?: number; approvedAt?: string; receipt?: { url?: string };
  cancels?: Array<{ cancelAmount: number; cancelReason: string; canceledAt: string; transactionKey: string; cancelStatus: string }>;
}

type TossBilling = { billingKey: string; customerKey: string; method?: string }

class TossApiError extends HttpError {
  constructor(public upstreamStatus: number, public code: string, message: string) {
    super(upstreamStatus >= 500 ? 502 : 400, message)
  }
}

function tossErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    REJECT_CARD_PAYMENT: '카드 결제가 승인되지 않았습니다. 카드 한도와 잔액을 확인하거나 다른 결제수단을 이용해 주세요.',
    INVALID_REJECT_CARD: '카드 사용이 거절되었습니다. 카드사에 확인하거나 다른 결제수단을 이용해 주세요.',
    NOT_SUPPORTED_METHOD: '현재 사용할 수 없는 결제수단입니다. 다른 결제수단을 선택해 주세요.',
    INVALID_API_KEY: '결제 설정을 확인할 수 없습니다. 관리자에게 문의해 주세요.',
    PROVIDER_ERROR: '결제기관 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',
    FAILED_INTERNAL_SYSTEM_PROCESSING: '결제 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  }
  return messages[code] || '결제를 처리하지 못했습니다. 결제수단을 확인하거나 잠시 후 다시 시도해 주세요.'
}

function tossAuthorization(): string {
  return `Basic ${btoa(`${requiredEnv('TOSS_PAYMENTS_SECRET_KEY')}:`)}`
}

async function tossRequest<T>(path: string, method: 'GET' | 'POST' | 'DELETE', body?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`https://api.tosspayments.com${path}`, {
      method,
      headers: {
        Authorization: tossAuthorization(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'POST' && idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(65000),
    })
  } catch (error) {
    console.error('Toss Payments network error:', error instanceof Error ? error.message : error)
    throw new HttpError(502, '토스페이먼츠 서버 응답을 확인하지 못했습니다. 잠시 후 결제 상태를 다시 확인해 주세요.')
  }
  const text = await response.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text || '토스페이먼츠에서 올바르지 않은 응답을 받았습니다.' }
  }
  if (!response.ok) {
    console.error('Toss Payments error:', response.status, data.code, data.message)
    const code = String(data.code || '')
    throw new TossApiError(response.status, code, tossErrorMessage(code))
  }
  return data as T
}

async function confirmPayment(paymentKey: string, requestedOrderId: string, amount: number): Promise<TossPayment> {
  try {
    return await tossRequest<TossPayment>('/v1/payments/confirm', 'POST', {
      paymentKey, orderId: requestedOrderId, amount,
    }, `confirm-${requestedOrderId}`)
  } catch (confirmError) {
    const shouldQuery = !(confirmError instanceof TossApiError)
      || confirmError.upstreamStatus >= 500
      || confirmError.code === 'ALREADY_PROCESSED_PAYMENT'
    if (!shouldQuery) throw confirmError

    try {
      const payment = await tossRequest<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}`, 'GET')
      if (payment.status === 'DONE') return payment
    } catch (queryError) {
      console.error('Toss Payments recovery query failed:', queryError instanceof Error ? queryError.message : queryError)
    }
    throw confirmError
  }
}

async function cancelPayment(paymentKey: string, requestedOrderId: string, reason: string): Promise<TossPayment> {
  try {
    return await tossRequest<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}/cancel`, 'POST', {
      cancelReason: reason,
    }, `cancel-${requestedOrderId}`)
  } catch (cancelError) {
    const shouldQuery = !(cancelError instanceof TossApiError)
      || cancelError.upstreamStatus >= 500
      || cancelError.code === 'ALREADY_CANCELED_PAYMENT'
    if (!shouldQuery) throw cancelError

    try {
      const payment = await tossRequest<TossPayment>(`/v1/payments/${encodeURIComponent(paymentKey)}`, 'GET')
      if (payment.status === 'CANCELED') return payment
    } catch (queryError) {
      console.error('Toss Payments cancellation recovery failed:', queryError instanceof Error ? queryError.message : queryError)
    }
    throw cancelError
  }
}

function orderId(prefix: string): string {
  return `MOA-${prefix}-${crypto.randomUUID().replaceAll('-', '')}`
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function customerKey(userId: number): Promise<string> {
  const existing = await db.from('payment_customers').select('customer_key').eq('user_id', userId).maybeSingle()
  assertDatabase(existing.error)
  if (existing.data) return existing.data.customer_key

  const generated = `moa_${crypto.randomUUID().replaceAll('-', '')}`
  const inserted = await db.from('payment_customers').insert({ user_id: userId, customer_key: generated }).select('customer_key').single()
  if (inserted.error?.code === '23505') {
    const retried = await db.from('payment_customers').select('customer_key').eq('user_id', userId).single()
    assertDatabase(retried.error)
    return retried.data!.customer_key
  }
  assertDatabase(inserted.error)
  return inserted.data!.customer_key
}

async function accountSummary(userId: number) {
  const [wallet, subscription] = await Promise.all([
    db.from('credit_wallets').select('balance').eq('user_id', userId).maybeSingle(),
    db.from('subscriptions').select('plan_id,status,amount,monthly_credits,current_period_started_at,current_period_ends_at,canceled_at,renewal_mode').eq('user_id', userId).maybeSingle(),
  ])
  assertDatabase(wallet.error); assertDatabase(subscription.error)
  if (subscription.data?.status === 'active' && new Date(subscription.data.current_period_ends_at).getTime() <= Date.now()) {
    const expired = await db.from('subscriptions').update({ status: 'expired', billing_key: null }).eq('user_id', userId).eq('status', 'active')
    assertDatabase(expired.error)
    subscription.data.status = 'expired'
  }
  return {
    creditBalance: wallet.data?.balance || 0,
    subscription: subscription.data ? {
      planId: subscription.data.plan_id,
      status: subscription.data.status,
      amount: subscription.data.amount,
      monthlyCredits: subscription.data.monthly_credits,
      periodStartedAt: subscription.data.current_period_started_at,
      nextBillingAt: subscription.data.current_period_ends_at,
      canceledAt: subscription.data.canceled_at,
      renewalMode: subscription.data.renewal_mode,
    } : null,
  }
}

function paymentHistoryItem(order: Record<string, unknown>, refundableSubscriptionOrderId?: string | null) {
  return {
    orderId: order.order_id,
    kind: order.kind,
    productId: order.product_id,
    orderName: order.order_name,
    amount: order.amount,
    credits: order.credits,
    status: order.status,
    method: order.method,
    receiptUrl: order.receipt_url,
    approvedAt: order.approved_at,
    createdAt: order.created_at,
    canceledAt: order.canceled_at,
    canceledAmount: order.canceled_amount,
    cancelReason: order.cancel_reason,
    canCancel: order.status === 'completed' && Boolean(order.payment_key)
      && (order.kind === 'credit' || order.id === refundableSubscriptionOrderId),
  }
}

export async function cancelUserSubscription(userId: number) {
  const subscription = await db.from('subscriptions').select('status,billing_key').eq('user_id', userId).maybeSingle()
  assertDatabase(subscription.error)
  if (!subscription.data || subscription.data.status !== 'active') throw new HttpError(404, '활성 구독을 찾을 수 없습니다.')

  if (subscription.data.billing_key) {
    await tossRequest(`/v1/billing/${encodeURIComponent(subscription.data.billing_key)}`, 'DELETE', undefined, `billing-delete-${userId}`)
  }
  const canceled = await db.from('subscriptions').update({ status: 'canceled', billing_key: null, canceled_at: new Date().toISOString() }).eq('user_id', userId)
  assertDatabase(canceled.error)
  return accountSummary(userId)
}

export async function refundPaymentOrder(userId: number, requestedOrderId: string, reason: string) {
  const order = await db.from('payment_orders').select('*').eq('order_id', requestedOrderId).eq('user_id', userId).maybeSingle()
  assertDatabase(order.error)
  if (!order.data) throw new HttpError(404, '결제 내역을 찾을 수 없습니다.')
  if (order.data.status === 'canceled') {
    return { payment: paymentHistoryItem(order.data), ...(await accountSummary(userId)) }
  }
  if (!['credit', 'subscription'].includes(order.data.kind) || order.data.status !== 'completed' || !order.data.payment_key) {
    throw new HttpError(409, '이 결제는 취소·환불할 수 없습니다.')
  }
  if (order.data.kind === 'subscription') {
    const current = await db.from('subscriptions').select('last_payment_order_id').eq('user_id', userId).maybeSingle()
    assertDatabase(current.error)
    if (current.data?.last_payment_order_id !== order.data.id) throw new HttpError(409, '가장 최근 구독 결제만 환불할 수 있습니다.')
  }

  const wallet = await db.from('credit_wallets').select('balance').eq('user_id', userId).maybeSingle()
  assertDatabase(wallet.error)
  if ((wallet.data?.balance || 0) < order.data.credits) throw new HttpError(409, '지급된 크레딧을 이미 사용하여 환불할 수 없습니다.')

  const canceledPayment = await cancelPayment(order.data.payment_key, order.data.order_id, reason)
  if (canceledPayment.status !== 'CANCELED' || (canceledPayment.balanceAmount ?? 0) !== 0) {
    throw new HttpError(502, '토스페이먼츠 취소 결과를 확인하지 못했습니다.')
  }
  const cancellation = [...(canceledPayment.cancels || [])].reverse().find((item) => item.cancelStatus === 'DONE')
  if (!cancellation || cancellation.cancelAmount !== order.data.amount) throw new HttpError(502, '전액 취소 결과가 주문 금액과 일치하지 않습니다.')

  const rpcName = order.data.kind === 'subscription' ? 'finalize_subscription_refund' : 'finalize_payment_cancellation'
  const finalized = await db.rpc(rpcName, {
    p_order_id: order.data.order_id, p_user_id: userId,
    p_toss_status: canceledPayment.status, p_cancel_amount: cancellation.cancelAmount,
    p_cancel_reason: cancellation.cancelReason || reason,
    p_cancel_transaction_key: cancellation.transactionKey,
    p_canceled_at: cancellation.canceledAt || new Date().toISOString(),
  })
  if (finalized.error?.message.includes('insufficient credit balance')) throw new HttpError(409, '지급된 크레딧을 이미 사용하여 환불할 수 없습니다.')
  assertDatabase(finalized.error)
  const updated = await db.from('payment_orders').select('*').eq('id', order.data.id).single()
  assertDatabase(updated.error)
  return { payment: paymentHistoryItem(updated.data!), ...(await accountSummary(userId)) }
}

export async function paymentRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'GET' && path === '/payments/me') {
    const session = await requireSession(request, 'user')
    return json(request, { customerKey: await customerKey(session.id), ...await accountSummary(session.id) })
  }

  if (request.method === 'GET' && path === '/payments/history') {
    const session = await requireSession(request, 'user')
    const [orders, transactions, subscription] = await Promise.all([
      db.from('payment_orders')
        .select('id,order_id,kind,product_id,order_name,amount,credits,status,method,receipt_url,approved_at,created_at,canceled_at,canceled_amount,cancel_reason,payment_key')
        .eq('user_id', session.id).order('created_at', { ascending: false }).limit(100),
      db.from('credit_transactions')
        .select('id,amount,reason,balance_after,created_at,admin_id')
        .eq('user_id', session.id).order('created_at', { ascending: false }).limit(100),
      db.from('subscriptions').select('last_payment_order_id').eq('user_id', session.id).maybeSingle(),
    ])
    assertDatabase(orders.error); assertDatabase(transactions.error); assertDatabase(subscription.error)
    return json(request, {
      payments: (orders.data || []).map((order) => paymentHistoryItem(order, subscription.data?.last_payment_order_id)),
      creditTransactions: (transactions.data || []).map((transaction) => ({
        id: transaction.id,
        amount: transaction.amount,
        reason: transaction.reason,
        balanceAfter: transaction.balance_after,
        managedByAdmin: Boolean(transaction.admin_id),
        createdAt: transaction.created_at,
      })),
    })
  }

  if (request.method === 'POST' && path === '/payments/orders') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const productId = String(body.productId || '') as keyof typeof creditProducts
    const product = creditProducts[productId]
    if (!product) throw new HttpError(400, '선택한 크레딧 상품을 찾을 수 없습니다.')

    const newOrderId = orderId('CRD')
    const inserted = await db.from('payment_orders').insert({
      order_id: newOrderId, user_id: session.id, kind: 'credit', product_id: productId,
      order_name: product.name, amount: product.amount, credits: product.credits,
    }).select('order_id,order_name,amount').single()
    assertDatabase(inserted.error)
    return json(request, {
      order: { orderId: inserted.data!.order_id, orderName: inserted.data!.order_name, amount: inserted.data!.amount },
      customerKey: await customerKey(session.id),
    }, 201)
  }

  if (request.method === 'POST' && path === '/payments/subscriptions/orders') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const planId = String(body.planId || '') as keyof typeof subscriptionPlans
    const plan = subscriptionPlans[planId]
    if (!plan) throw new HttpError(400, '선택한 멤버십을 찾을 수 없습니다.')

    const current = await db.from('subscriptions').select('status,current_period_ends_at').eq('user_id', session.id).maybeSingle()
    assertDatabase(current.error)
    if (current.data?.status === 'active' && new Date(current.data.current_period_ends_at).getTime() > Date.now()) {
      throw new HttpError(409, '현재 이용 중인 멤버십이 있습니다.')
    }

    const newOrderId = orderId('SUB')
    const inserted = await db.from('payment_orders').insert({
      order_id: newOrderId, user_id: session.id, kind: 'subscription', product_id: planId,
      order_name: `${plan.name} 30일`, amount: plan.amount, credits: plan.credits,
    }).select('order_id,order_name,amount').single()
    assertDatabase(inserted.error)
    return json(request, {
      order: { orderId: inserted.data!.order_id, orderName: inserted.data!.order_name, amount: inserted.data!.amount },
      customerKey: await customerKey(session.id),
    }, 201)
  }

  if (request.method === 'POST' && path === '/payments/fail') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const requestedOrderId = String(body.orderId || '').trim()
    const failureCode = String(body.code || 'PAYMENT_FAILED').trim().slice(0, 100)
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(requestedOrderId)) throw new HttpError(400, '결제 주문 정보가 올바르지 않습니다.')
    const failed = await db.from('payment_orders').update({ status: 'failed', failure_code: failureCode })
      .eq('order_id', requestedOrderId).eq('user_id', session.id).eq('status', 'pending')
      .select('order_id').maybeSingle()
    assertDatabase(failed.error)
    return json(request, { recorded: Boolean(failed.data) })
  }

  if (request.method === 'POST' && path === '/payments/confirm') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const paymentKey = String(body.paymentKey || '').trim()
    const requestedOrderId = String(body.orderId || '').trim()
    const amount = Number(body.amount)
    if (!paymentKey || !requestedOrderId || !Number.isInteger(amount)) throw new HttpError(400, '결제 승인 정보가 올바르지 않습니다.')

    const order = await db.from('payment_orders').select('*').eq('order_id', requestedOrderId).eq('user_id', session.id).maybeSingle()
    assertDatabase(order.error)
    if (!order.data || !['credit', 'subscription'].includes(order.data.kind)) throw new HttpError(404, '결제 주문을 찾을 수 없습니다.')
    if (order.data.amount !== amount) throw new HttpError(400, '결제 금액이 주문 금액과 일치하지 않습니다.')
    if (order.data.status === 'completed') return json(request, {
      success: true,
      credited: order.data.credits,
      receiptUrl: order.data.receipt_url,
      ...(await accountSummary(session.id)),
    })

    const payment = await confirmPayment(paymentKey, requestedOrderId, order.data.amount)
    if (payment.orderId !== requestedOrderId || payment.totalAmount !== order.data.amount || payment.status !== 'DONE') {
      throw new HttpError(502, '토스페이먼츠 승인 결과가 주문 정보와 일치하지 않습니다.')
    }

    const rpcName = order.data.kind === 'subscription' ? 'finalize_manual_subscription_payment' : 'finalize_credit_payment'
    const finalized = await db.rpc(rpcName, {
      p_order_id: requestedOrderId, p_user_id: session.id, p_payment_key: payment.paymentKey,
      p_toss_status: payment.status, p_method: payment.method || null,
      p_receipt_url: payment.receipt?.url || null, p_approved_at: payment.approvedAt || new Date().toISOString(),
    })
    assertDatabase(finalized.error)
    return json(request, {
      success: true,
      credited: order.data.credits,
      creditBalance: finalized.data?.[0]?.balance || 0,
      subscription: order.data.kind === 'subscription' ? (await accountSummary(session.id)).subscription : undefined,
      receiptUrl: payment.receipt?.url || null,
    })
  }

  if (request.method === 'POST' && path === '/payments/subscriptions/activate') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const planId = String(body.planId || '') as keyof typeof subscriptionPlans
    const plan = subscriptionPlans[planId]
    const authKey = String(body.authKey || '').trim()
    const requestedCustomerKey = String(body.customerKey || '').trim()
    if (!plan || !authKey || !requestedCustomerKey) throw new HttpError(400, '구독 인증 정보가 올바르지 않습니다.')

    const expectedCustomerKey = await customerKey(session.id)
    if (requestedCustomerKey !== expectedCustomerKey) throw new HttpError(400, '구독 고객 정보가 일치하지 않습니다.')
    const authKeyHash = await sha256(authKey)
    let pending = await db.from('payment_orders').select('*').eq('auth_key_hash', authKeyHash).eq('user_id', session.id).maybeSingle()
    assertDatabase(pending.error)
    if (pending.data?.status === 'completed') return json(request, { success: true, ...(await accountSummary(session.id)) })

    const current = await db.from('subscriptions').select('status').eq('user_id', session.id).maybeSingle()
    assertDatabase(current.error)
    if (current.data?.status === 'active') throw new HttpError(409, '현재 구독을 먼저 해지한 후 새 멤버십을 등록해 주세요.')

    if (!pending.data) {
      pending = await db.from('payment_orders').insert({
        order_id: orderId('SUB'), user_id: session.id, kind: 'subscription', product_id: planId,
        order_name: plan.name, amount: plan.amount, credits: plan.credits, auth_key_hash: authKeyHash,
      }).select('*').single()
      assertDatabase(pending.error)
    }
    if (pending.data!.product_id !== planId) throw new HttpError(400, '구독 상품 정보가 일치하지 않습니다.')
    const billing = await tossRequest<TossBilling>('/v1/billing/authorizations/issue', 'POST', {
      authKey, customerKey: expectedCustomerKey,
    }, `billing-issue-${authKeyHash}`)
    if (!billing.billingKey || billing.customerKey !== expectedCustomerKey) throw new HttpError(502, '빌링키 발급 결과가 고객 정보와 일치하지 않습니다.')

    const payment = await tossRequest<TossPayment>(`/v1/billing/${encodeURIComponent(billing.billingKey)}`, 'POST', {
      customerKey: expectedCustomerKey, amount: plan.amount, orderId: pending.data!.order_id,
      orderName: plan.name, customerEmail: session.email, customerName: session.name || session.email.split('@')[0], taxFreeAmount: 0,
    }, `billing-charge-${pending.data!.order_id}`)
    if (payment.orderId !== pending.data!.order_id || payment.totalAmount !== plan.amount || payment.status !== 'DONE') {
      throw new HttpError(502, '구독 결제 승인 결과가 주문 정보와 일치하지 않습니다.')
    }

    const finalized = await db.rpc('finalize_subscription_payment', {
      p_order_id: pending.data!.order_id, p_user_id: session.id, p_payment_key: payment.paymentKey,
      p_customer_key: expectedCustomerKey, p_billing_key: billing.billingKey,
      p_toss_status: payment.status, p_method: payment.method || billing.method || null,
      p_receipt_url: payment.receipt?.url || null, p_approved_at: payment.approvedAt || new Date().toISOString(),
    })
    assertDatabase(finalized.error)
    return json(request, { success: true, credited: plan.credits, creditBalance: finalized.data?.[0]?.balance || 0, subscription: (await accountSummary(session.id)).subscription, receiptUrl: payment.receipt?.url || null })
  }

  if (request.method === 'POST' && path === '/payments/subscriptions/cancel') {
    const session = await requireSession(request, 'user')
    return json(request, { success: true, ...(await cancelUserSubscription(session.id)) })
  }

  const cancelMatch = path.match(/^\/payments\/orders\/([A-Za-z0-9_-]{6,64})\/cancel$/)
  if (request.method === 'POST' && cancelMatch) {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const reason = String(body.reason || '고객 요청으로 결제 취소').trim()
    if (!reason || reason.length > 200) throw new HttpError(400, '취소 사유는 200자 이내로 입력해 주세요.')

    return json(request, { success: true, ...(await refundPaymentOrder(session.id, cancelMatch[1], reason)) })
  }

  return null
}
