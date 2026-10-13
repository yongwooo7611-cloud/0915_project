const TOSS_PAYMENTS_SDK_URL = 'https://js.tosspayments.com/v2/standard'
const CUSTOMER_KEY_STORAGE = 'moa_toss_customer_key'

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

function getCustomerKey() {
  const savedKey = localStorage.getItem(CUSTOMER_KEY_STORAGE)
  if (savedKey) return savedKey
  const customerKey = `moa-${crypto.randomUUID()}`
  localStorage.setItem(CUSTOMER_KEY_STORAGE, customerKey)
  return customerKey
}

export async function initializeTossPayment() {
  const clientKey = import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY?.trim()
  if (!clientKey) throw new Error('토스페이먼츠 클라이언트 키가 설정되지 않았습니다.')

  const TossPayments = await loadTossPaymentsSdk()
  return TossPayments(clientKey).payment({ customerKey: getCustomerKey() })
}
