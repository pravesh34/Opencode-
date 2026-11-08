import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ApplicationRow, Job, JobMatchRow } from '../lib/types'

export function DashboardPage() {
  const qc = useQueryClient()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<Job[]>('/api/jobs') })
  const matches = useQuery({ queryKey: ['matches'], queryFn: () => api<JobMatchRow[]>('/api/matches') })
  const apps = useQuery({ queryKey: ['applications'], queryFn: () => api<ApplicationRow[]>('/api/applications') })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<any>('/api/settings') })

  const sample = useMutation({ mutationFn: () => api('/api/jobs/sample', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }) })
  const score = useMutation({ mutationFn: () => api('/api/pipeline/score', { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['matches'] }); qc.invalidateQueries({ queryKey: ['jobs'] }) } })

  const matchRows = matches.data || []
  const applyCount = matchRows.filter(m => m.match.recommended_action === 'apply').length
  const reviewCount = matchRows.filter(m => m.match.recommended_action === 'review').length

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Autonomous Job Agent Control Center</h1>
        <p className="text-sm text-slate-600 mt-1">Discover jobs, score fit, generate materials, map forms with Playwright, and keep approvals/submissions auditable. No local LLM inference; all AI tasks use configured external APIs with safe fallbacks when keys are missing.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn" onClick={() => sample.mutate()} disabled={sample.isPending}>Load Sample Jobs</button>
          <button className="btn btn-primary" onClick={() => score.mutate()} disabled={score.isPending}>Score / Rank Jobs</button>
        </div>
        {(sample.data as any)?.ok && <p className="text-sm text-teal-700 mt-2">Sample jobs imported.</p>}
        {(score.data as any)?.ok && <p className="text-sm text-teal-700 mt-2">Scored {(score.data as any).scored} jobs.</p>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Jobs" value={jobs.data?.length ?? '—'} />
        <Stat label="Recommended Apply" value={matchRows.length ? applyCount : '—'} />
        <Stat label="Needs Review" value={matchRows.length ? reviewCount : '—'} />
        <Stat label="Applications" value={apps.data?.length ?? '—'} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Safety & runtime</h2>
          <ul className="text-sm text-slate-700 space-y-1">
            <li><b>Approval mode:</b> {settings.data?.approval_mode ?? '…'}</li>
            <li><b>Default provider:</b> {settings.data?.default_provider ?? '…'}</li>
            <li><b>Browser headless:</b> {String(settings.data?.browser_headless ?? '…')}</li>
            <li><b>Configured providers:</b> {(settings.data?.providers || []).filter((p: any) => p.configured).map((p: any) => p.name).join(', ') || 'none (safe fallbacks active)'}</li>
          </ul>
          <p className="text-xs text-slate-500 mt-3">Candidate facts are stored with source/confidence. The system avoids inventing experience or credentials. Browser submission remains approval-gated by default; site-specific automation may require login/CAPTCHA/manual review.</p>
        </div>
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Top matches</h2>
          <div className="space-y-2">
            {matchRows.slice(0, 5).map(r => (
              <div key={r.match.id} className="border border-slate-200 rounded-lg p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{r.job.title} <span className="text-slate-500 font-normal">at {r.job.company}</span></div>
                  <div className="text-xs px-2 py-0.5 rounded-full bg-slate-100">{r.match.score.toFixed(0)} · {r.match.recommended_action}</div>
                </div>
                <div className="text-xs text-slate-600 mt-1">{r.match.eligibility_reason}</div>
              </div>
            ))}
            {!matchRows.length && <div className="text-sm text-slate-500">No matches yet. Load jobs and run scoring.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div className="card p-4"><div className="text-xs text-slate-500">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div></div>
}
