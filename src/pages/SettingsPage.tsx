import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { City, PriceOption, WorkshopSettings } from '../types/database'

const DEFAULT_TARIFFS: { name: string; price: number; sort_order: number }[] = [
  { name: 'Все виды ковров', price: 500, sort_order: 1 },
  { name: 'Синтетика', price: 480, sort_order: 2 },
  { name: 'Сильнозагрязнённые', price: 550, sort_order: 3 },
]

export function SettingsPage() {
  const [cities, setCities] = useState<City[]>([])
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [priceCityId, setPriceCityId] = useState('')
  const [fees, setFees] = useState({
    wash_fee_tg: '150',
    assemble_fee_tg: '50',
    pack_fee_tg: '50',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [newCity, setNewCity] = useState({ name: '', sort: '' })
  const [newTariff, setNewTariff] = useState({ name: '', price: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setMsg(null)
    const [cRes, pRes, fRes] = await Promise.all([
      supabase.from('cities').select('*').order('sort_order', { ascending: true }),
      supabase.from('price_options').select('*').order('sort_order', { ascending: true }),
      supabase.from('workshop_settings').select('*').eq('id', 1).maybeSingle(),
    ])
    if (cRes.error) setMsg({ type: 'err', text: cRes.error.message })
    else {
      const list = (cRes.data ?? []) as City[]
      setCities(list)
      setPriceCityId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev
        return list[0]?.id ?? ''
      })
    }

    if (pRes.error) setMsg({ type: 'err', text: pRes.error.message })
    else setPriceOptions((pRes.data ?? []) as PriceOption[])

    if (fRes.error) setMsg({ type: 'err', text: fRes.error.message })
    else if (fRes.data) {
      const f = fRes.data as WorkshopSettings
      setFees({
        wash_fee_tg: String(f.wash_fee_tg),
        assemble_fee_tg: String(f.assemble_fee_tg),
        pack_fee_tg: String(f.pack_fee_tg),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка справочников при монтировании
    void load()
  }, [load])

  const optionsForCity = useMemo(
    () => priceOptions.filter((p) => p.city_id === priceCityId),
    [priceOptions, priceCityId],
  )

  const saveCity = async (
    c: City,
    patch: Partial<Pick<City, 'name' | 'sort_order'>>,
  ) => {
    const name =
      typeof patch.name === 'string' ? patch.name.trim() : c.name
    const sort_order =
      patch.sort_order !== undefined ? patch.sort_order : c.sort_order
    if (!name) {
      setMsg({ type: 'err', text: 'Название города не может быть пустым.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('cities')
      .update({ name, sort_order })
      .eq('id', c.id)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setMsg({ type: 'ok', text: 'Город сохранён.' })
    await load()
  }

  const addCity = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newCity.name.trim()
    const sort = parseInt(newCity.sort || '0', 10)
    if (!name) {
      setMsg({ type: 'err', text: 'Введите название города.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const sort_order =
      Number.isFinite(sort) && sort > 0
        ? sort
        : cities.length
          ? Math.max(...cities.map((x) => x.sort_order)) + 1
          : 1
    const { data: row, error } = await supabase
      .from('cities')
      .insert({ name, sort_order })
      .select('id')
      .single()
    if (error) {
      setSaving(false)
      setMsg({ type: 'err', text: error.message })
      return
    }
    const cityId = (row as { id: string }).id
    const { error: e2 } = await supabase.from('price_options').insert(
      DEFAULT_TARIFFS.map((t) => ({
        city_id: cityId,
        name: t.name,
        price_per_sqm: t.price,
        sort_order: t.sort_order,
      })),
    )
    setSaving(false)
    if (e2) {
      setMsg({ type: 'err', text: e2.message })
      await load()
      return
    }
    setNewCity({ name: '', sort: '' })
    setMsg({ type: 'ok', text: 'Город добавлен с тарифами по умолчанию.' })
    setPriceCityId(cityId)
    await load()
  }

  const deleteCity = async (c: City) => {
    if (!confirm(`Удалить город «${c.name}» и все его тарифы?`)) return
    setSaving(true)
    const { error } = await supabase.from('cities').delete().eq('id', c.id)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setMsg({ type: 'ok', text: 'Город удалён.' })
    await load()
  }

  const saveTariff = async (
    po: PriceOption,
    patch: Partial<Pick<PriceOption, 'name' | 'price_per_sqm' | 'sort_order'>>,
  ) => {
    const name =
      typeof patch.name === 'string' ? patch.name.trim() : po.name
    const price =
      patch.price_per_sqm !== undefined
        ? Number(patch.price_per_sqm)
        : po.price_per_sqm
    const sort_order =
      patch.sort_order !== undefined ? patch.sort_order : po.sort_order
    if (!name) {
      setMsg({ type: 'err', text: 'Укажите название тарифа.' })
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setMsg({ type: 'err', text: 'Укажите корректную цену за м².' })
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await supabase
      .from('price_options')
      .update({ name, price_per_sqm: price, sort_order })
      .eq('id', po.id)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setMsg({ type: 'ok', text: 'Тариф сохранён.' })
    await load()
  }

  const addTariff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!priceCityId) {
      setMsg({ type: 'err', text: 'Сначала выберите город.' })
      return
    }
    const name = newTariff.name.trim()
    const price = parseFloat(newTariff.price.replace(',', '.'))
    if (!name) {
      setMsg({ type: 'err', text: 'Введите название тарифа.' })
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setMsg({ type: 'err', text: 'Укажите цену за м².' })
      return
    }
    const sort_order = optionsForCity.length
      ? Math.max(...optionsForCity.map((x) => x.sort_order)) + 1
      : 1
    setSaving(true)
    setMsg(null)
    const { error } = await supabase.from('price_options').insert({
      city_id: priceCityId,
      name,
      price_per_sqm: price,
      sort_order,
    })
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setNewTariff({ name: '', price: '' })
    setMsg({ type: 'ok', text: 'Тариф добавлен.' })
    await load()
  }

  const deleteTariff = async (po: PriceOption) => {
    if (!confirm(`Удалить тариф «${po.name}»?`)) return
    setSaving(true)
    const { error } = await supabase.from('price_options').delete().eq('id', po.id)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setMsg({ type: 'ok', text: 'Тариф удалён.' })
    await load()
  }

  const saveFees = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const w = parseFloat(fees.wash_fee_tg.replace(',', '.'))
    const a = parseFloat(fees.assemble_fee_tg.replace(',', '.'))
    const p = parseFloat(fees.pack_fee_tg.replace(',', '.'))
    if (![w, a, p].every((x) => Number.isFinite(x) && x >= 0)) {
      setMsg({ type: 'err', text: 'Введите неотрицательные числа.' })
      setSaving(false)
      return
    }
    const { error } = await supabase
      .from('workshop_settings')
      .update({
        wash_fee_tg: w,
        assemble_fee_tg: a,
        pack_fee_tg: p,
      })
      .eq('id', 1)
    setSaving(false)
    if (error) {
      setMsg({ type: 'err', text: error.message })
      return
    }
    setMsg({ type: 'ok', text: 'Тарифы цеха сохранены.' })
  }

  if (loading) {
    return (
      <p className="text-left text-slate-600" role="status">
        Загрузка…
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 text-left">
      <section>
        <h2 className="text-xl font-semibold text-slate-900">Города</h2>
        <p className="mt-1 text-sm text-slate-500">
          Только название и порядок в списке. Цены настраиваются отдельно ниже.
        </p>

        <ul className="mt-4 space-y-4">
          {cities.map((c) => (
            <CityRow
              key={c.id}
              city={c}
              disabled={saving}
              onSave={saveCity}
              onDelete={deleteCity}
            />
          ))}
        </ul>

        <form
          onSubmit={addCity}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4"
        >
          <div>
            <label className="text-xs font-medium text-slate-600">Новый город</label>
            <input
              value={newCity.name}
              onChange={(e) => setNewCity((p) => ({ ...p, name: e.target.value }))}
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Название"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Порядок</label>
            <input
              value={newCity.sort}
              onChange={(e) => setNewCity((p) => ({ ...p, sort: e.target.value }))}
              className="mt-1 block w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="авто"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            Добавить город
          </button>
        </form>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">
          Цены приёма (₸/м² по типу ковра)
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Для каждого города задайте названия тарифов (например: все виды ковров,
          синтетика, сильнозагрязнённые) и цену за м². На приёме заказа выбирается
          город и тариф по каждой позиции.
        </p>

        <div className="mt-4">
          <label className="text-sm font-medium text-slate-700">Город для редактирования цен</label>
          <select
            value={priceCityId}
            onChange={(e) => setPriceCityId(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {cities.length === 0 && <option value="">— нет городов —</option>}
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {!priceCityId ? (
          <p className="mt-4 text-sm text-amber-700">
            Добавьте город выше, чтобы настроить тарифы.
          </p>
        ) : (
          <>
            <ul className="mt-4 space-y-3">
              {optionsForCity.map((po) => (
                <TariffRow
                  key={po.id}
                  option={po}
                  disabled={saving}
                  onSave={saveTariff}
                  onDelete={deleteTariff}
                />
              ))}
              {optionsForCity.length === 0 && (
                <li className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Для этого города ещё нет тарифов. Добавьте строки ниже или выполните
                  миграцию БД (файл <code className="rounded bg-white px-1">supabase/migration_price_options.sql</code>).
                </li>
              )}
            </ul>

            <form
              onSubmit={addTariff}
              className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4"
            >
              <div className="min-w-[180px] flex-1">
                <label className="text-xs font-medium text-slate-600">Название тарифа</label>
                <input
                  value={newTariff.name}
                  onChange={(e) =>
                    setNewTariff((p) => ({ ...p, name: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Например: шёлк"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">₸/м²</label>
                <input
                  value={newTariff.price}
                  onChange={(e) =>
                    setNewTariff((p) => ({ ...p, price: e.target.value }))
                  }
                  className="mt-1 w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="500"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                Добавить тариф
              </button>
            </form>
          </>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900">Тарифы цеха</h2>
        <p className="mt-1 text-sm text-slate-500">
          Фиксированные надбавки к позиции при отметке этапа на экране «Цех».
        </p>
        <form onSubmit={saveFees} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">Постирано (₸)</span>
              <input
                value={fees.wash_fee_tg}
                onChange={(e) =>
                  setFees((p) => ({ ...p, wash_fee_tg: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Собрано (₸)</span>
              <input
                value={fees.assemble_fee_tg}
                onChange={(e) =>
                  setFees((p) => ({ ...p, assemble_fee_tg: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Упаковано (₸)</span>
              <input
                value={fees.pack_fee_tg}
                onChange={(e) =>
                  setFees((p) => ({ ...p, pack_fee_tg: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            Сохранить тарифы цеха
          </button>
        </form>
      </section>

      {msg && (
        <p
          className={
            msg.type === 'ok' ? 'text-sm text-emerald-600' : 'text-sm text-red-600'
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}

function CityRow({
  city,
  disabled,
  onSave,
  onDelete,
}: {
  city: City
  disabled: boolean
  onSave: (c: City, patch: Partial<Pick<City, 'name' | 'sort_order'>>) => void
  onDelete: (c: City) => void
}) {
  const [name, setName] = useState(city.name)
  const [order, setOrder] = useState(String(city.sort_order))

  useEffect(() => {
    setName(city.name)
    setOrder(String(city.sort_order))
  }, [city])

  return (
    <li className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-[180px] flex-1 text-sm">
        <span className="text-slate-600">Название города</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="w-24 text-sm">
        <span className="text-slate-600">Порядок</span>
        <input
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSave(city, {
            name: name.trim(),
            sort_order: parseInt(order, 10) || 0,
          })
        }
        className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        Сохранить
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDelete(city)}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        Удалить
      </button>
    </li>
  )
}

function TariffRow({
  option,
  disabled,
  onSave,
  onDelete,
}: {
  option: PriceOption
  disabled: boolean
  onSave: (
    po: PriceOption,
    patch: Partial<Pick<PriceOption, 'name' | 'price_per_sqm' | 'sort_order'>>,
  ) => void
  onDelete: (po: PriceOption) => void
}) {
  const [name, setName] = useState(option.name)
  const [price, setPrice] = useState(String(option.price_per_sqm))
  const [order, setOrder] = useState(String(option.sort_order))

  useEffect(() => {
    setName(option.name)
    setPrice(String(option.price_per_sqm))
    setOrder(String(option.sort_order))
  }, [option])

  return (
    <li className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <label className="min-w-[160px] flex-1 text-sm">
        <span className="text-slate-600">Название тарифа</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="w-28 text-sm">
        <span className="text-slate-600">₸/м²</span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="w-20 text-sm">
        <span className="text-slate-600">Порядок</span>
        <input
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSave(option, {
            name: name.trim(),
            price_per_sqm: parseFloat(price.replace(',', '.')),
            sort_order: parseInt(order, 10) || 0,
          })
        }
        className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
      >
        Сохранить
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDelete(option)}
        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        Удалить
      </button>
    </li>
  )
}
