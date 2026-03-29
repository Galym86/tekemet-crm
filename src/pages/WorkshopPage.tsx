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
      .select(
        `
        *,
        orders (
          id,
          created_at,
          clients (phone, name),
          cities (name)
        )
      `,
      )
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка списка изделий при монтировании
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
    setBusyId(null)
    if (error) {
      setErr(error.message)
      return
    }
    await loadItems()
  }

  if (loading) {
    return (
      <p className="text-left text-slate-600" role="status">
        Загрузка…
      </p>
    )
  }

  if (!fees) {
    return (
      <p className="text-left text-red-600">
        Не удалось загрузить тарифы цеха. Убедитесь, что в Supabase выполнен скрипт{' '}
        <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code> и
        таблица workshop_settings доступна.
      </p>
    )
  }

  return (
    <div className="text-left">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Цех</h2>
          <p className="text-sm text-slate-500">
            Отметьте этапы обработки. К сумме заказа добавляются фиксированные
            надбавки (настраиваются в «Настройках»).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Обновить
        </button>
      </div>

      {fees && (
        <p className="mb-4 text-sm text-slate-600">
          Тарифы: постирано — {Number(fees.wash_fee_tg)} ₸, собрано —{' '}
          {Number(fees.assemble_fee_tg)} ₸, упаковано — {Number(fees.pack_fee_tg)} ₸
        </p>
      )}

      {err && <p className="mb-4 text-sm text-red-600">{err}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Дата
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Клиент
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Тариф
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-700">
                м²
              </th>
              <th className="px-4 py-3 text-right font-medium text-slate-700">
                Итого
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-700">
                Этапы
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  Нет позиций. Оформите заказ на экране «Заказы».
                </td>
              </tr>
            )}
            {items.map((row) => {
              const o = row.orders
              const client = o?.clients
              const cityName = o?.cities?.name ?? '—'
              const created = o?.created_at
                ? new Date(o.created_at).toLocaleString('ru-RU')
                : '—'
              const total =
                fees && itemGrandTotal(row, fees)
              const disabled = busyId === row.id
              return (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {created}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {client?.name || '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {client?.phone} · {cityName}
                    </div>
                  </td>
                  <td className="max-w-[140px] px-4 py-3 text-slate-700">
                    {row.price_label?.trim() || '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(row.area_sqm)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                    {total !== undefined
                      ? `${total.toLocaleString('ru-KZ', { maximumFractionDigits: 0 })} ₸`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <StatusBtn
                        label="Постирано"
                        fee={fees ? Number(fees.wash_fee_tg) : 150}
                        active={row.washed}
                        disabled={disabled}
                        onClick={() =>
                          void toggleField(row.id, 'washed', !row.washed)
                        }
                      />
                      <StatusBtn
                        label="Собрано"
                        fee={fees ? Number(fees.assemble_fee_tg) : 50}
                        active={row.assembled}
                        disabled={disabled}
                        onClick={() =>
                          void toggleField(row.id, 'assembled', !row.assembled)
                        }
                      />
                      <StatusBtn
                        label="Упаковано"
                        fee={fees ? Number(fees.pack_fee_tg) : 50}
                        active={row.packed}
                        disabled={disabled}
                        onClick={() =>
                          void toggleField(row.id, 'packed', !row.packed)
                        }
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusBtn({
  label,
  fee,
  active,
  disabled,
  onClick,
}: {
  label: string
  fee: number
  active: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      {label} ({fee}₸)
    </button>
  )
}
