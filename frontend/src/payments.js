const TOSS_PAYMENTS_SDK_URL = 'https://js.tosspayments.com/v2/standard'

const paymentErrorMessages = {
  USER_CANCEL: '결제가 취소되었습니다. 결제를 원하시면 다시 시도해 주세요.',
  PAY_PROCESS_CANCELED: '결제가 취소되었습니다. 결제를 원하시면 다시 시도해 주세요.',
  PAY_PROCESS_ABORTED: '결제 진행이 중단되었습니다. 결제 정보를 확인한 뒤 다시 시도해 주세요.',
  REJECT_CARD_PAYMENT: '카드 결제가 승인되지 않았습니다. 카드 한도와 잔액을 확인하거나 다른 결제수단을 이용해 주세요.',
  INVALID_REJECT_CARD: '카드 사용이 거절되었습니다. 카드사에 확인하거나 다른 결제수단을 이용해 주세요.',
  EXCEED_MAX_DAILY_PAYMENT_COUNT: '오늘 결제 가능한 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.',
  EXCEED_MAX_PAYMENT_AMOUNT: '결제 가능한 금액을 초과했습니다. 카드 한도를 확인해 주세요.',
  NOT_SUPPORTED_METHOD: '현재 사용할 수 없는 결제수단입니다. 다른 결제수단을 선택해 주세요.',
  INVALID_API_KEY: '결제 설정을 확인하고 있습니다. 잠시 후 다시 시도해 주세요.',
  PROVIDER_ERROR: '결제기관 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.',
  FAILED_INTERNAL_SYSTEM_PROCESSING: '결제 처리 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
}

export function paymentErrorMessage(error, fallback = '결제를 완료하지 못했습니다. 결제수단을 확인하거나 잠시 후 다시 시도해 주세요.') {
  const code = String(error?.code || '').trim().toUpperCase()
  return paymentErrorMessages[code] || fallback
}

function loadTossPaymentsSdk() {
  if (window.TossPayments) return Promise.resolve(window.TossPayments)

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector(`script[src="${TOSS_PAYMENTS_SDK_URL}"]`)
    const script = existingScript || document.createElement('script')

    const handleLoad = () => window.TossPayments
      ? resolve(window.TossPayments)
      : reject(new Error('토스페이먼츠 SDK를 불러오지 못했습니다.'))
    const handleError = () => reject(new Error('토스페이먼츠 SDK 연결에 실패했습니다.'))

    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    if (!existingScript) {
      script.src = TOSS_PAYMENTS_SDK_URL
      script.async = true
      document.head.appendChild(script)
    }
  })
}

export async function initializeTossPayment(customerKey = 'ANONYMOUS') {
  const clientKey = import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY?.trim()
  if (!clientKey) throw new Error('토스페이먼츠 클라이언트 키가 설정되지 않았습니다.')

  const TossPayments = await loadTossPaymentsSdk()
  return TossPayments(clientKey).payment({ customerKey })
}
