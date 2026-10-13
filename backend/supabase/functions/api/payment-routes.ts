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
    throw new TossApiError(response.status, String(data.code || ''), String(data.message || '토스페이먼츠 요청을 처리하지 못했습니다.'))
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
    db.from('subscriptions').select('plan_id,status,amount,monthly_credits,current_period_ends_at,canceled_at').eq('user_id', userId).maybeSingle(),
  ])
  assertDatabase(wallet.error); assertDatabase(subscription.error)
  return {
    creditBalance: wallet.data?.balance || 0,
    subscription: subscription.data ? {
      planId: subscription.data.plan_id,
      status: subscription.data.status,
      amount: subscription.data.amount,
      monthlyCredits: subscription.data.monthly_credits,
      nextBillingAt: subscription.data.current_period_ends_at,
      canceledAt: subscription.data.canceled_at,
    } : null,
  }
}

function paymentHistoryItem(order: Record<string, unknown>) {
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
    canCancel: order.kind === 'credit' && order.status === 'completed' && Boolean(order.payment_key),
  }
}

export async function paymentRoutes(request: Request, path: string): Promise<Response | null> {
  if (request.method === 'GET' && path === '/payments/me') {
    const session = await requireSession(request, 'user')
    return json(request, { customerKey: await customerKey(session.id), ...await accountSummary(session.id) })
  }

  if (request.method === 'GET' && path === '/payments/history') {
    const session = await requireSession(request, 'user')
    const orders = await db.from('payment_orders')
      .select('order_id,kind,product_id,order_name,amount,credits,status,method,receipt_url,approved_at,created_at,canceled_at,canceled_amount,cancel_reason,payment_key')
      .eq('user_id', session.id).order('created_at', { ascending: false }).limit(100)
    assertDatabase(orders.error)
    return json(request, { payments: (orders.data || []).map((order) => paymentHistoryItem(order)) })
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

  if (request.method === 'POST' && path === '/payments/confirm') {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const paymentKey = String(body.paymentKey || '').trim()
    const requestedOrderId = String(body.orderId || '').trim()
    const amount = Number(body.amount)
    if (!paymentKey || !requestedOrderId || !Number.isInteger(amount)) throw new HttpError(400, '결제 승인 정보가 올바르지 않습니다.')

    const order = await db.from('payment_orders').select('*').eq('order_id', requestedOrderId).eq('user_id', session.id).maybeSingle()
    assertDatabase(order.error)
    if (!order.data || order.data.kind !== 'credit') throw new HttpError(404, '결제 주문을 찾을 수 없습니다.')
    if (order.data.amount !== amount) throw new HttpError(400, '결제 금액이 주문 금액과 일치하지 않습니다.')
    if (order.data.status === 'completed') return json(request, { success: true, ...(await accountSummary(session.id)) })

    const payment = await confirmPayment(paymentKey, requestedOrderId, order.data.amount)
    if (payment.orderId !== requestedOrderId || payment.totalAmount !== order.data.amount || payment.status !== 'DONE') {
      throw new HttpError(502, '토스페이먼츠 승인 결과가 주문 정보와 일치하지 않습니다.')
    }

    const finalized = await db.rpc('finalize_credit_payment', {
      p_order_id: requestedOrderId, p_user_id: session.id, p_payment_key: payment.paymentKey,
      p_toss_status: payment.status, p_method: payment.method || null,
      p_receipt_url: payment.receipt?.url || null, p_approved_at: payment.approvedAt || new Date().toISOString(),
    })
    assertDatabase(finalized.error)
    return json(request, { success: true, credited: order.data.credits, creditBalance: finalized.data?.[0]?.balance || 0, receiptUrl: payment.receipt?.url || null })
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
    const subscription = await db.from('subscriptions').select('status,billing_key').eq('user_id', session.id).maybeSingle()
    assertDatabase(subscription.error)
    if (!subscription.data || subscription.data.status !== 'active' || !subscription.data.billing_key) throw new HttpError(404, '활성 구독을 찾을 수 없습니다.')

    await tossRequest(`/v1/billing/${encodeURIComponent(subscription.data.billing_key)}`, 'DELETE', undefined, `billing-delete-${session.id}`)
    const canceled = await db.from('subscriptions').update({ status: 'canceled', billing_key: null, canceled_at: new Date().toISOString() }).eq('user_id', session.id)
    assertDatabase(canceled.error)
    return json(request, { success: true, ...(await accountSummary(session.id)) })
  }

  const cancelMatch = path.match(/^\/payments\/orders\/([A-Za-z0-9_-]{6,64})\/cancel$/)
  if (request.method === 'POST' && cancelMatch) {
    const session = await requireSession(request, 'user')
    const body = await bodyJson(request)
    const reason = String(body.reason || '고객 요청으로 결제 취소').trim()
    if (!reason || reason.length > 200) throw new HttpError(400, '취소 사유는 200자 이내로 입력해 주세요.')

    const order = await db.from('payment_orders').select('*')
      .eq('order_id', cancelMatch[1]).eq('user_id', session.id).maybeSingle()
    assertDatabase(order.error)
    if (!order.data) throw new HttpError(404, '결제 내역을 찾을 수 없습니다.')
    if (order.data.status === 'canceled') {
      return json(request, { success: true, payment: paymentHistoryItem(order.data), ...(await accountSummary(session.id)) })
    }
    if (order.data.kind !== 'credit' || order.data.status !== 'completed' || !order.data.payment_key) {
      throw new HttpError(409, '이 결제는 사용자 화면에서 취소할 수 없습니다.')
    }

    const wallet = await db.from('credit_wallets').select('balance').eq('user_id', session.id).maybeSingle()
    assertDatabase(wallet.error)
    if ((wallet.data?.balance || 0) < order.data.credits) {
      throw new HttpError(409, '구매한 크레딧을 이미 사용하여 결제를 취소할 수 없습니다.')
    }

    const canceledPayment = await cancelPayment(order.data.payment_key, order.data.order_id, reason)
    if (canceledPayment.status !== 'CANCELED' || (canceledPayment.balanceAmount ?? 0) !== 0) {
      throw new HttpError(502, '토스페이먼츠 취소 결과를 확인하지 못했습니다.')
    }
    const cancellation = [...(canceledPayment.cancels || [])].reverse().find((item) => item.cancelStatus === 'DONE')
    if (!cancellation || cancellation.cancelAmount !== order.data.amount) {
      throw new HttpError(502, '전액 취소 결과가 주문 금액과 일치하지 않습니다.')
    }

    const finalized = await db.rpc('finalize_payment_cancellation', {
      p_order_id: order.data.order_id, p_user_id: session.id,
      p_toss_status: canceledPayment.status, p_cancel_amount: cancellation.cancelAmount,
      p_cancel_reason: cancellation.cancelReason || reason,
      p_cancel_transaction_key: cancellation.transactionKey,
      p_canceled_at: cancellation.canceledAt || new Date().toISOString(),
    })
    assertDatabase(finalized.error)
    const updated = await db.from('payment_orders').select('*').eq('id', order.data.id).single()
    assertDatabase(updated.error)
    return json(request, {
      success: true, payment: paymentHistoryItem(updated.data!),
      creditBalance: finalized.data?.[0]?.balance || 0,
    })
  }

  return null
}
