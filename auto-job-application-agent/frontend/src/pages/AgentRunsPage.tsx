import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export function AgentRunsPage() {
  const runs = useQuery({ queryKey: ['agent-runs'], queryFn: () => api<any[]>('/api/agent-runs') })
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Agent Runs & Observability</h1>
        <p className="text-sm text-slate-600 mt-1">Pipeline and browser automation runs, logs, and outputs for debugging/audit.</p>
      </div>
      <div className="space-y-3">
        {(runs.data || []).map((r: any) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">#{r.id} · {r.kind}</div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'completed' ? 'bg-teal-100 text-teal-800' : r.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>{r.status}</div>
            </div>
            {r.error && <div className="text-sm text-red-700 mt-2">{r.error}</div>}
            <details className="mt-2 text-sm"><summary className="cursor-pointer">Input / output / logs</summary><pre className="mt-2 text-xs bg-slate-50 border rounded p-3 overflow-auto whitespace-pre-wrap">{JSON.stringify({ input: r.input, output: r.output, logs: r.logs }, null, 2)}</pre></details>
          </div>
        ))}
        {!runs.data?.length && <div className="card p-4 text-sm text-slate-500">No runs yet. Use Applications → “Open & Map Form (Playwright)” or extend pipeline workers.</div>}
      </div>
    </div>
  )
}
