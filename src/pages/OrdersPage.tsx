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

function lineAreaSqm(line: LineDraft): number | null {
  const L = parseDimMeters(line.length_m)
  const W = parseDimMeters(line.width_m)
  if (L === null || W === null) return null
  return Math.round(L * W * 100) / 100
}

export function OrdersPage() {
  const [cities, setCities] = useState<City[]>([])
  const [priceOptions, setPriceOptions] = useState<PriceOption[]>([])
  const [cityId, setCityId] = useState('')
  const [phone, setPhone] = useState('')
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('') // Новое поле Адрес
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
    if (cRes.data) {
      const list = cRes.data as City[]
      setCities(list)
      if (list.length > 0 && !cityId) setCityId(list[0].id)
    }
    if (pRes.data) setPriceOptions(pRes.data as PriceOption[])
  }, [cityId])

  useEffect(() => { void loadData() }, [loadData])

  const optionsForCity = useMemo(
    () => priceOptions.filter((o) => o.city_id === cityId).sort((a, b) => a.sort_order - b.sort_order),
    [priceOptions, cityId]
  )

  const receptionTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const a = lineAreaSqm(line)
      const opt = priceOptions.find((o) => o.id === line.price_option_id)
      return (a && opt) ? sum + baseLineTotal(a, opt.price_per_sqm) : sum
    }, 0)
  }, [lines, priceOptions])

  const searchClient = async () => {
    const p = normalizePhone(phone)
    if (p.length < 10) return setMsg({ type: 'err', text: 'Введите номер телефона' })
    const { data } = await supabase.from('clients').select('*').eq('phone', p).maybeSingle()
    if (data) {
      setFoundClient(data); setClientName(data.name)
      if (data.city_id) setCityId(data.city_id)
      setMsg({ type: 'ok', text: 'Клиент найден' })
    } else {
      setFoundClient(null); setMsg({ type: 'ok', text: 'Новый клиент' })
    }
  }

  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const p = normalizePhone(phone)
      let clientId = foundClient?.id
      // Объединяем адрес и комментарий для сохранения
      const fullComment = `Адрес: ${address}. ${comment}`.trim()

      if (!clientId) {
        const { data: ins, error: e1 } = await supabase.from('clients').insert({
          phone: p, name: clientName || 'Клиент', city_id: cityId
        }).select('id').single()
        if (e1) throw e1
        clientId = ins.id
      }
      
      const { data: orderRow, error: e3 } = await supabase.from('orders').insert({
        client_id: clientId, city_id: cityId, comment: fullComment
      }).select('id').single()
      if (e3) throw e3

      const insertRows = lines.map(l => {
        const a = lineAreaSqm(l)
        const opt = priceOptions.find(o => o.id === l.price_option_id)
        return a && opt ? { order_id: orderRow.id, area_sqm: a, unit_price: opt.price_per_sqm, price_label: opt.name } : null
      }).filter(Boolean)

      await supabase.from('order_items').insert(insertRows)
      setMsg({ type: 'ok', text: 'Заказ оформлен!' })
      setPhone(''); setClientName(''); setAddress(''); setComment('');
      setLines([{ id: crypto.randomUUID(), length_m: '', width_m: '', price_option_id: optionsForCity[0]?.id || '' }])
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-xl mx-auto p-4 pb-32">
      <h2 className="text-2xl font-black mb-6 text-slate-900 uppercase tracking-tight">Приём заказа</h2>
      
      <form onSubmit={submitOrder} className="space-y-4">
        
        {/* 1. ИМЯ */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Имя клиента</label>
          <input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl p-4 text-lg font-bold" placeholder="Напр: Арман" />
        </div>

        {/* 2. ГОРОД */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Город</label>
          <div className="grid grid-cols-2 gap-2">
            {cities.map(c => (
              <button key={c.id} type="button" onClick={() => setCityId(c.id)} 
                className={`p-4 rounded-xl font-bold transition-all border-2 ${cityId === c.id ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-50 bg-slate-50 text-slate-400'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* 3. АДРЕС */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Адрес доставки</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl p-4 font-bold" placeholder="Микрорайон, дом, квартира" />
        </div>

        {/* 4. ТЕЛЕФОН */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Телефон</label>
          <div className="flex gap-2">
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="flex-1 bg-slate-50 border-none rounded-xl p-4 text-lg font-bold" placeholder="77071234567" />
            <button type="button" onClick={searchClient} className="bg-slate-900 text-white px-6 rounded-xl font-bold uppercase text-xs">Найти</button>
          </div>
        </div>

        {/* БЛОК КОВРОВ */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <label className="text-xs font-bold text-slate-400 uppercase">Данные ковров</label>
            <button type="button" onClick={() => setLines([...lines, { id: crypto.randomUUID(), length_m: '', width_m: '', price_option_id: optionsForCity[0]?.id || '' }])} className="text-sky-600 font-bold text-sm">+ Добавить</button>
          </div>
          
          <div className="space-y-4">
            {lines.map((line) => {
              const area = lineAreaSqm(line)
              return (
                <div key={line.id} className="p-4 bg-slate-50 rounded-xl relative border border-slate-100">
                  <select value={line.price_option_id} onChange={e => setLines(lines.map(l => l.id === line.id ? {...l, price_option_id: e.target.value} : l))}
                    className="w-full mb-3 bg-white border-none rounded-lg p-3 font-bold text-slate-700 shadow-sm">
                    {optionsForCity.map(o => <option key={o.id} value={o.id}>{o.name} ({Number(o.price_per_sqm)} ₸/м²)</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Длина</span>
                      <input type="text" inputMode="decimal" value={line.length_m} onChange={e => setLines(lines.map(l => l.id === line.id ? {...l, length_m: e.target.value} : l))} className="w-full p-1 border-none font-black text-lg text-sky-600" placeholder="0.0" />
                    </div>
                    <div className="bg-white p-2 rounded-lg shadow-sm">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ширина</span>
                      <input type="text" inputMode="decimal" value={line.width_m} onChange={e => setLines(lines.map(l => l.id === line.id ? {...l, width_m: e.target.value} : l))} className="w-full p-1 border-none font-black text-lg text-sky-600" placeholder="0.0" />
                    </div>
                  </div>
                  {area && <div className="mt-3 text-right text-xs font-black text-slate-400 uppercase">Площадь: {area} м²</div>}
                  {lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter(l => l.id !== line.id))} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center font-bold shadow-lg">×</button>}
                </div>
              )
            })}
          </div>
        </div>

        {/* КНОПКА ОФОРМЛЕНИЯ */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-lg border-t border-slate-100 flex items-center justify-between gap-4 max-w-xl mx-auto shadow-2xl z-50">
          <div>
            <div className="text-[10px] text-slate-400 font-bold uppercase">Итого к оплате</div>
            <div className="text-2xl font-black text-emerald-600 tracking-tight">{receptionTotal.toLocaleString('ru-KZ')} ₸</div>
          </div>
          <button type="submit" disabled={loading} className="bg-sky-600 text-white px-10 py-4 rounded-2xl font-black uppercase text-sm shadow-xl shadow-sky-200 active:scale-95 disabled:opacity-50">
            {loading ? '...' : 'Оформить'}
          </button>
        </div>
      </form>
      {msg && <div className={`mt-4 p-4 rounded-2xl text-center font-black uppercase text-xs ${msg.type === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{msg.text}</div>}
    </div>
  )
}