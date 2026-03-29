import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { itemGrandTotal } from '../lib/pricing'
import type { OrderItemWithRelations, WorkshopSettings } from '../types/database'

export function WorkshopPage() {
  const [items, setItems] = useState<OrderItemWithRelations[]>([])
  const [fees, setFees] = useState<WorkshopSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadFees = useCallback(async () => {
    const { data, error } = await supabase
      .from('workshop_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      setErr(error.message)
      return
    }
    if (data) setFees(data as WorkshopSettings)
  }, [])

  const loadItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        *,
        orders (
          id,
          created_at,
          clients (phone, name),
          cities (name)
        )
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      setErr(error.message)
      setItems([])
      return
    }
    setItems((data ?? []) as OrderItemWithRelations[])
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    await Promise.all([loadFees(), loadItems()])
    setLoading(false)
  }, [loadFees, loadItems])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const toggleField = async (
    id: string,
    field: 'washed' | 'assembled' | 'packed',
    next: boolean,
  ) => {
    setBusyId(id)
    setErr(null)
    const { error } = await supabase
      .from('order_items')
      .update({ [field]: next })
      .eq('id', id)
    
    if (error) {
      setErr(error.message)
    } else {
      await loadItems()
    }
    setBusyId(null)
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Загрузка данных...</div>

  if (!fees) {
    return (
      <div className="p-8 text-red-600 bg-red-50 rounded-xl border border-red-200">
        Ошибка: Тарифы не найдены в базе данных.
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Шапка */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Цех Текемет</h1>
          <p className="text-slate-500">Управление процессом чистки и упаковки</p>
        </div>
        <button
          onClick={() => void refresh()}
          className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-95"
        >
          Обновить список
        </button>
      </div>

      {err && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">{err}</div>}

      {/* Список изделий */}
      <div className="grid gap-4">
        {items.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
            Заказов в работе пока нет
          </div>
        ) : (
          items.map((row) => {
            const order = row.orders
            const client = order?.clients
            const total = fees ? itemGrandTotal(row, fees) : 0
            const isBusy = busyId === row.id

            return (
              <div key={row.id} className={`bg-white rounded-2xl border p-4 shadow-sm transition-all ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold px-2 py-0.5 rounded">
                        {order?.cities?.name || 'Город не указан'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {order?.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : ''}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-lg">{client?.name || 'Без имени'}</h3>
                    <p className="text-sm text-slate-500 font-mono">{client?.phone}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400 mb-1">К оплате:</div>
                    <div className="text-xl font-black text-emerald-600 leading-none">
                      {total.toLocaleString('ru-KZ')} ₸
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {row.price_label} · {Number(row.area_sqm)} м²
                    </div>
                  </div>
                </div>

                {/* Кнопки управления статусом */}
                <div className="grid grid-cols-3 gap-2 border-t pt-4">
                  <WorkshopButton
                    label="Постирано"
                    active={row.washed}
                    onClick={() => void toggleField(row.id, 'washed', !row.washed)}
                  />
                  <WorkshopButton
                    label="Собрано"
                    active={row.assembled}
                    onClick={() => void toggleField(row.id, 'assembled', !row.assembled)}
                  />
                  <WorkshopButton
                    label="Упаковано"
                    active={row.packed}
                    onClick={() => void toggleField(row.id, 'packed', !row.packed)}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function WorkshopButton({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`py-3 px-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm border-2
        ${active 
          ? 'bg-emerald-500 border-emerald-500 text-white shadow-emerald-200' 
          : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300 hover:text-slate-600'
        }`}
    >
      {active ? `✓ ${label}` : label}
    </button>
  )
}