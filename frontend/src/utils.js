export function formatDate(value) {
  if (!value) return ''
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(normalized))
}
