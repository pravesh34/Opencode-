import { NavLink, Outlet } from 'react-router-dom'
import { Bot, Briefcase, LayoutDashboard, ListChecks, Play, Settings, UserCircle } from 'lucide-react'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/profile', label: 'Candidate Profile', icon: UserCircle },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
  { to: '/matches', label: 'Matches', icon: ListChecks },
  { to: '/applications', label: 'Applications / CRM', icon: Bot },
  { to: '/settings', label: 'Settings & Providers', icon: Settings },
  { to: '/agent-runs', label: 'Agent Runs', icon: Play },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">JobPilot AI</div>
            <div className="text-xs text-slate-500">API-powered job discovery, matching, and approval-gated application agent</div>
          </div>
          <div className="text-xs text-slate-500">Local-first • Playwright • External AI APIs only</div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
        <aside className="card p-2 h-fit lg:sticky lg:top-[73px]">
          <nav className="space-y-1">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-teal-50 text-teal-800 font-medium' : 'text-slate-700 hover:bg-slate-50'}`}>
                <Icon size={16} /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0"><Outlet /></main>
      </div>
    </div>
  )
}
