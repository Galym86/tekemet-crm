import { NavLink, Outlet } from 'react-router-dom'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-sky-600 text-white shadow'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-left">
            <h1 className="text-lg font-semibold text-slate-900">
              CRM — стирка ковров
            </h1>
            <p className="text-sm text-slate-500">Приём заказов и цех</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <NavLink to="/" end className={linkClass}>
              Заказы
            </NavLink>
            <NavLink to="/workshop" className={linkClass}>
              Цех
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              Настройки
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
