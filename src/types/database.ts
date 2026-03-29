export type City = {
  id: string
  name: string
  sort_order: number
}

/** Тариф приёма: название (напр. «Синтетика») + ₸/м² в рамках города */
export type PriceOption = {
  id: string
  city_id: string
  name: string
  price_per_sqm: number
  sort_order: number
}

export type WorkshopSettings = {
  id: number
  wash_fee_tg: number
  assemble_fee_tg: number
  pack_fee_tg: number
}

export type Client = {
  id: string
  phone: string
  name: string
  city_id: string | null
}

export type Order = {
  id: string
  client_id: string
  city_id: string
  comment: string | null
  created_at: string
}

export type OrderItem = {
  id: string
  order_id: string
  area_sqm: number
  unit_price: number
  price_label: string | null
  washed: boolean
  assembled: boolean
  packed: boolean
  created_at: string
}

export type OrderItemWithRelations = OrderItem & {
  orders: Order & {
    clients: Pick<Client, 'phone' | 'name'>
    cities: Pick<City, 'name'>
  }
}
