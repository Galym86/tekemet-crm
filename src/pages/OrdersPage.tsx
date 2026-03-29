import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { normalizePhone } from '../lib/phone'
import { baseLineTotal } from '../lib/pricing'
import type { City, Client, PriceOption } from '../types/database'

type LineDraft = {
  id: string
  length_m: string
  width_m: string
  price_option_id: string
}

function parseDimMeters(s: string): number | null {
  const n = parseFloat(s.replace(',', '.').trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** Площадь м² = длина × ширина (оба в метрах) */
function lineAreaSqm(line: LineDraft): number | null {
  const L = parseDimMeters(line.length_m)
  const W = parseDimMeters(line.width_m)
  if (L === null || W === null) return null
  return Math.round(L * W * 100) / 100
}

function firstOptionIdForCity(
  cityId: string,
  options: PriceOption[],
): string {
  const list = options
    .filter((o) => o.city_id === cityId)
    .sort((a, b) => a.sort_order - b.sort_order)
  return list[0]?.id ?? ''
}

export function OrdersPage() {
  const [cities, setCities] = useState<City[]>([])
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [cityId, setCityId] = useState('')
  const [phone, setPhone] = useState('')
  const [clientName, setClientName] = useState('')
  const [foundClient, setFoundClient] = useState<Client | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([
    { id: crypto.randomUUID(), length_m: '', width_m: '', price_option_id: '' },
  ])
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const loadData = useCallback(async () => {
    const [cRes, pRes] = await Promise.all([
      supabase.from('cities').select('*').order('sort_order', { ascending: true }),
      supabase.from('price_options').select('*').order('sort_order', { ascending: true }),
    ])
    if (cRes.error) {
      setMsg({ type: 'err', text: cRes.error.message })
      return
    }
    if (pRes.error) {
      setMsg({ type: 'err', text: pRes.error.message })
      return
    }
    const list = (cRes.data ?? []) as City[]
    const opts = (pRes.data ?? []) as PriceOption[]
    setCities(list)
    setPriceOptions(opts)
    setCityId((prev) => {
      if (prev && list.some((c) => c.id === prev)) return prev
      return list[0]?.id ?? ''
    })
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const optionsForCity = useMemo(
    () =>
      priceOptions
        .filter((o) => o.city_id === cityId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [priceOptions, cityId],
  )

  useEffect(() => {
    if (!cityId) return
    setLines((prev) =>
      prev.map((line) => {
        const valid = optionsForCity.some((o) => o.id === line.price_option_id)
        const fallback = firstOptionIdForCity(cityId, priceOptions)
        return {
          ...line,
          price_option_id: valid ? line.price_option_id : fallback,
        }
      }),
    )
  }, [cityId, optionsForCity, priceOptions])

  const selectedCity = useMemo(
    () => cities.find((c) => c.id === cityId) ?? null,
    [cities, cityId],
  )

  const receptionTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const a = lineAreaSqm(line)
      if (a === null || a <= 0) return sum
      const opt = priceOptions.find((o) => o.id === line.price_option_id)
      if (!opt) return sum
      return sum + baseLineTotal(a, opt.price_per_sqm)
    }, 0)
  }, [lines, priceOptions])

  const searchClient = async () => {
    setMsg(null)
    const p = normalizePhone(phone)
    if (p.length < 10) {
      setMsg({ type: 'err', text: 'Введите номер телефона (не менее 10 цифр).' })
      setFoundClient(null)
      return
    }
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('phone', p)
      .maybeSingle()
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    if (data) {
      const c = data as Client
      setFoundClient(c)
      setClientName(c.name)
      if (c.city_id && cities.some((x) => x.id === c.city_id)) {
        setCityId(c.city_id)
      }
      setMsg({ type: 'ok', text: 'Клиент найден.' })
    } else {
      setFoundClient(null)
      setClientName('')
      setMsg({ type: 'ok', text: 'Новый клиент — укажите имя и город.' })
    }
  }

  const addLine = () => {
    const def = firstOptionIdForCity(cityId, priceOptions)
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), length_m: '', width_m: '', price_option_id: def },
    ])
  }

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)))
  }

  const updateLine = (
    id: string,
    patch: Partial<Pick<LineDraft, 'length_m' | 'width_m' | 'price_option_id'>>,
  ) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const p = normalizePhone(phone)
    if (p.length < 10) {
      setMsg({ type: 'err', text: 'Укажите корректный телефон.' })
      return
    }
    if (!selectedCity) {
      setMsg({ type: 'err', text: 'Выберите город.' })
      return
    }
    if (optionsForCity.length === 0) {
      setMsg({
        type: 'err',
        text: 'Для выбранного города нет тарифов. Настройте цены в разделе «Настройки».',
      })
      return
    }

    const rows: { area_sqm: number; unit_price: number; price_label: string }[] = []
    for (const line of lines) {
      const a = lineAreaSqm(line)
      if (a === null || a <= 0) continue
      const opt = priceOptions.find((o) => o.id === line.price_option_id)
      if (!opt || opt.city_id !== cityId) {
        setMsg({
          type: 'err',
          text: 'Укажите тариф и длину с шириной для каждой заполненной позиции.',
        })
        return
      }
      rows.push({
        area_sqm: a,
        unit_price: opt.price_per_sqm,
        price_label: opt.name,
      })
    }
    if (rows.length === 0) {
      setMsg({
        type: 'err',
        text: 'Укажите длину и ширину ковра (в метрах), чтобы получилась площадь больше 0 м².',
      })
      return
    }

    setLoading(true)
    try {
      let clientId = foundClient?.id
      if (!clientId) {
        const { data: ins, error: e1 } = await supabase
          .from('clients')
          .insert({
            phone: p,
            name: clientName.trim() || 'Клиент',
            city_id: cityId || null,
          })
          .select('id')
          .single()
        if (e1) throw new Error(e1.message)
        clientId = (ins as { id: string }).id
      } else {
        const existing = foundClient
        if (!existing) throw new Error('Клиент не найден')
        const { error: e2 } = await supabase
          .from('clients')
          .update({
            name: clientName.trim() || existing.name,
            city_id: cityId || null,
          })
          .eq('id', clientId)
        if (e2) throw new Error(e2.message)
      }

      const { data: orderRow, error: e3 } = await supabase
        .from('orders')
        .insert({
          client_id: clientId,
          city_id: cityId,
          comment: comment.trim() || null,
        })
        .select('id')
        .single()
      if (e3) throw new Error(e3.message)
      const orderId = (orderRow as { id: string }).id

      const insertRows = rows.map((r) => ({
        order_id: orderId,
        area_sqm: r.area_sqm,
        unit_price: r.unit_price,
        price_label: r.price_label,
      }))
      const { error: e4 } = await supabase.from('order_items').insert(insertRows)
      if (e4) throw new Error(e4.message)

      setMsg({ type: 'ok', text: 'Заказ сохранён.' })
      const def = firstOptionIdForCity(cityId, priceOptions)
      setLines([
        { id: crypto.randomUUID(), length_m: '', width_m: '', price_option_id: def },
      ])
      setComment('')
      setFoundClient(null)
      setClientName('')
      setPhone('')
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Ошибка сохранения',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-left">
      <h2 className="mb-6 text-xl font-semibold text-slate-900">Приём заказа</h2>

      <form onSubmit={submitOrder} className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            Телефон клиента
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 700 000 00 00"
              className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 outline-none ring-sky-500 focus:ring-2"
            />
            <button
              type="button"
              onClick={() => void searchClient()}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Найти
            </button>
          </div>
          {foundClient && (
            <p className="mt-2 text-sm text-emerald-600">Клиент в базе</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Имя</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Как обращаться"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-sky-500 focus:ring-2"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">Город</label>
          <select
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-sky-500 focus:ring-2"
          >
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700">Ковры</span>
            <button
              type="button"
              onClick={addLine}
              className="text-sm font-medium text-sky-600 hover:text-sky-800"
            >
              + Добавить ковёр
            </button>
          </div>
          <ul className="space-y-4">
            {lines.map((line, idx) => {
              const areaPreview = lineAreaSqm(line)
              const opt = priceOptions.find((o) => o.id === line.price_option_id)
              const lineSum =
                areaPreview !== null && opt && opt.city_id === cityId
                  ? baseLineTotal(areaPreview, opt.price_per_sqm)
                  : null
              return (
              <li
                key={line.id}
                className="rounded-lg border border-slate-100 bg-slate-50/80"
              >
                <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                  <div className="flex w-max max-w-none flex-nowrap items-end gap-2 px-2 py-2 sm:w-full sm:min-w-0 sm:max-w-full">
                    <span
                      className="w-5 shrink-0 self-end pb-2 text-center text-xs text-slate-400"
                      aria-hidden
                    >
                      {idx + 1}.
                    </span>
                    <label className="min-w-[14rem] shrink-0 sm:min-w-0 sm:flex-1">
                      <span className="block text-[11px] text-slate-600 sm:text-xs">
                        Тип / тариф
                      </span>
                      <select
                        value={line.price_option_id}
                        onChange={(e) =>
                          updateLine(line.id, { price_option_id: e.target.value })
                        }
                        className="mt-0.5 w-[min(22rem,calc(100vw-8rem))] min-w-[14rem] max-w-[28rem] rounded-md border border-slate-300 px-2 py-1 text-xs outline-none ring-sky-500 focus:ring-2 sm:mt-1 sm:w-full sm:min-w-0 sm:max-w-none sm:py-1.5 sm:text-sm"
                      >
                        {optionsForCity.length === 0 ? (
                          <option value="">— нет тарифов —</option>
                        ) : (
                          optionsForCity.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name} — {Number(o.price_per_sqm)} ₸/м²
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="w-[3.75rem] shrink-0">
                      <span className="block text-[11px] text-slate-600 sm:text-xs">
                        Дл., м
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.length_m}
                        onChange={(e) =>
                          updateLine(line.id, { length_m: e.target.value })
                        }
                        placeholder="3,5"
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-1 py-1 text-xs tabular-nums outline-none ring-sky-500 focus:ring-2 sm:mt-1 sm:py-1 sm:text-sm"
                      />
                    </label>
                    <label className="w-[3.75rem] shrink-0">
                      <span className="block text-[11px] text-slate-600 sm:text-xs">
                        Шир., м
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={line.width_m}
                        onChange={(e) =>
                          updateLine(line.id, { width_m: e.target.value })
                        }
                        placeholder="2"
                        className="mt-0.5 w-full rounded-md border border-slate-300 px-1 py-1 text-xs tabular-nums outline-none ring-sky-500 focus:ring-2 sm:mt-1 sm:py-1 sm:text-sm"
                      />
                    </label>
                    <div className="w-[4.75rem] shrink-0">
                      <span className="block text-[11px] text-slate-600 sm:text-xs">
                        Площадь
                      </span>
                      <div
                        className="mt-0.5 flex h-[28px] items-center justify-end rounded-md border border-dashed border-slate-200 bg-white px-1 text-[10px] leading-none text-slate-800 tabular-nums sm:mt-1 sm:h-[30px] sm:text-[11px]"
                        title="Площадь, м²"
                      >
                        {areaPreview !== null
                          ? `${areaPreview.toLocaleString('ru-RU', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 2,
                            })}\u00a0м²`
                          : '—'}
                      </div>
                    </div>
                    <div className="w-[5.25rem] shrink-0">
                      <span className="block text-[11px] text-slate-600 sm:text-xs">
                        Сумма
                      </span>
                      <div
                        className="mt-0.5 flex h-[28px] items-center justify-end rounded-md border border-slate-200 bg-white px-1 text-[10px] font-medium leading-none text-slate-900 tabular-nums sm:mt-1 sm:h-[30px] sm:text-[11px]"
                        title="Площадь × цена тарифа"
                      >
                        {lineSum !== null
                          ? `${lineSum.toLocaleString('ru-KZ', {
                              maximumFractionDigits: 0,
                            })}\u00a0₸`
                          : '—'}
                      </div>
                    </div>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="shrink-0 self-center rounded-md px-1.5 py-1 text-[11px] text-red-600 hover:bg-red-50 sm:px-2 sm:text-sm"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              </li>
              )
            })}
          </ul>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-base font-semibold text-slate-900">
              Сумма приёма (длина × ширина × цена тарифа):{' '}
              <span className="text-sky-700">
                {receptionTotal.toLocaleString('ru-KZ', {
                  maximumFractionDigits: 0,
                })}{' '}
                ₸
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Надбавки цеха (стирка, сборка, упаковка) учитываются на экране «Цех».
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            Комментарий
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none ring-sky-500 focus:ring-2"
            placeholder="Пожелания клиента…"
          />
        </div>

        {msg && (
          <p
            className={
              msg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'
            }
          >
            {msg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? 'Сохранение…' : 'Оформить заказ'}
        </button>
      </form>
    </div>
  )
}
