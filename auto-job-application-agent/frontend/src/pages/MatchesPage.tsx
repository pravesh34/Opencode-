import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { JobMatchRow } from '../lib/types'

export function MatchesPage() {
  const qc = useQueryClient()
  const matches = useQuery({ queryKey: ['matches'], queryFn: () => api<JobMatchRow[]>('/api/matches') })
  const score = useMutation({ mutationFn: () => api('/api/pipeline/score', { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['matches'] }); qc.invalidateQueries({ queryKey: ['jobs'] }) } })
  const prepare = useMutation({
    mutationFn: (job_id: number) => api('/api/applications/prepare', { method: 'POST', body: JSON.stringify({ job_id }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
  })
  return (
    <div className="space-y-4">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Matches & Ranking</h1>
          <p className="text-sm text-slate-600 mt-1">Transparent scoring, eligibility checks, scam/safety penalties, and action recommendations. Review before applying.</p>
        </div>
        <button className="btn btn-primary" onClick={() => score.mutate()} disabled={score.isPending}>Run Scoring</button>
      </div>
      <div className="space-y-3">
        {(matches.data || []).map(r => (
          <div key={r.match.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{r.job.title} <span className="font-normal text-slate-500">at {r.job.company}</span></div>
                <div className="text-sm text-slate-600">{r.job.location} · {r.job.employment_type} · {r.job.source}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold">{r.match.score.toFixed(0)}</div>
                <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${r.match.recommended_action === 'apply' ? 'bg-teal-100 text-teal-800' : r.match.recommended_action === 'review' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{r.match.recommended_action} · {r.match.eligible ? 'eligible' : 'check eligibility'}</div>
              </div>
            </div>
            <p className="text-sm mt-2">{r.match.explanation}</p>
            <div className="mt-2 text-xs text-slate-600">Breakdown: {Object.entries(r.match.breakdown || {}).map(([k,v]) => `${k}: ${v}`).join(' · ')}</div>
            <div className="mt-3 flex gap-2">
              <button className="btn" onClick={() => prepare.mutate(r.job.id)} disabled={prepare.isPending}>Prepare Application Materials</button>
              {r.job.url && <a className="btn" href={r.job.url} target="_blank" rel="noreferrer">Open Job</a>}
            </div>
          </div>
        ))}
        {!matches.data?.length && <div className="card p-4 text-sm text-slate-500">No matches. Add jobs and run scoring.</div>}
      </div>
    </div>
  )
}
