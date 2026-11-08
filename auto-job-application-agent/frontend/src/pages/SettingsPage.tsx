import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('/api/settings') })
  const s = settings.data
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Settings & AI Providers</h1>
        <p className="text-sm text-slate-600 mt-1">External API-only AI. Configure keys in <code>.env</code> (not committed). Task routing and provider defaults are loaded from <code>backend/app/core/ai_config.yaml</code> and environment variables.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Runtime</h2>
          <ul className="text-sm space-y-1">
            <li><b>Approval mode:</b> {s?.approval_mode}</li>
            <li><b>Browser headless:</b> {String(s?.browser_headless)}</li>
            <li><b>Default provider:</b> {s?.default_provider}</li>
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Providers</h2>
          <div className="space-y-2">
            {(s?.providers || []).map((p: any) => (
              <div key={p.name} className="border rounded-lg p-2 text-sm flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.default_model || '—'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.configured ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{p.configured ? 'configured' : 'no key'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card p-4">
        <h2 className="font-semibold mb-2">Task routing (from config)</h2>
        <pre className="text-xs bg-slate-50 border rounded p-3 overflow-auto">{JSON.stringify(s?.ai_config?.tasks || {}, null, 2)}</pre>
      </div>
      <div className="card p-4 text-sm text-slate-700">
        <h2 className="font-semibold mb-2">Notes</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Never commit real API keys. Use <code>.env</code> locally.</li>
          <li>Browser submission is conservative and approval-gated; many sites require logins/CAPTCHAs or custom adapters.</li>
          <li>Respect each platform’s terms and applicable laws. Review every application before final submission.</li>
        </ul>
      </div>
    </div>
  )
}
