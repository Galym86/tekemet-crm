/** Нормализация телефона для поиска: только цифры */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}

export function formatPhoneDisplay(digits: string): string {
  const d = normalizePhone(digits)
  if (d.length === 11 && d.startsWith('7')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`
  }
  if (d.length === 10) {
    return `+7 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`
  }
  return digits.trim() || d
}
