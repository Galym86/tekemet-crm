import type { OrderItem, WorkshopSettings } from '../types/database'

export function baseLineTotal(areaSqm: number, unitPrice: number): number {
  return Number(areaSqm) * Number(unitPrice)
}

export function workshopExtras(
  item: Pick<OrderItem, 'washed' | 'assembled' | 'packed'>,
  fees: WorkshopSettings,
): number {
  let sum = 0
  if (item.washed) sum += Number(fees.wash_fee_tg)
  if (item.assembled) sum += Number(fees.assemble_fee_tg)
  if (item.packed) sum += Number(fees.pack_fee_tg)
  return sum
}

export function itemGrandTotal(item: OrderItem, fees: WorkshopSettings): number {
  return baseLineTotal(item.area_sqm, item.unit_price) + workshopExtras(item, fees)
}
