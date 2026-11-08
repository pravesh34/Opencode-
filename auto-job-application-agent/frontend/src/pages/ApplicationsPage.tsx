import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { ApplicationRow } from '../lib/types'

export function ApplicationsPage() {
  const qc = useQueryClient()
  const apps = useQuery({ queryKey: ['applications'], queryFn: () => api<ApplicationRow[]>('/api/applications') })
  const runBrowser = useMutation({ mutationFn: (id: number) => api(`/api/applications/${id}/run-browser`, { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['applications'] }); qc.invalidateQueries({ queryKey: ['agent-runs'] }) } })
  const approve = useMutation({ mutationFn: ({ id, approved, mark_submitted }: any) => api(`/api/applications/${id}/approve`, { method: 'POST', body: JSON.stringify({ approved, mark_submitted }) }), onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }) })
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Applications / CRM</h1>
        <p className="text-sm text-slate-600 mt-1">Generated materials, form mapping, screenshots/logs, approval state, and submission tracking. Browser automation is approval-gated by default and uses conservative field-filling; review before final submission.</p>
      </div>
      <div className="space-y-3">
        {(apps.data || []).map(r => (
          <div key={r.application.id} className="card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{r.job.title} <span className="font-normal text-slate-500">at {r.job.company}</span></div>
                <div className="text-sm text-slate-600">App #{r.application.id} · status {r.application.status} · approval {r.application.approval_state}</div>
                {r.job.url && <a className="text-sm text-teal-700 underline" href={r.job.url} target="_blank" rel="noreferrer">{r.job.url}</a>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => runBrowser.mutate(r.application.id)} disabled={runBrowser.isPending || !r.job.url}>Open & Map Form (Playwright)</button>
                <button className="btn" onClick={() => approve.mutate({ id: r.application.id, approved: true, mark_submitted: false })}>Approve</button>
                <button className="btn btn-primary" onClick={() => approve.mutate({ id: r.application.id, approved: true, mark_submitted: true })}>Mark Submitted</button>
              </div>
            </div>
            {r.application.notes && <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 whitespace-pre-wrap">{r.application.notes}</div>}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Cover letter / materials</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 border rounded p-3 overflow-auto">{r.application.cover_letter || '—'}</pre>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 border rounded p-3 overflow-auto">{JSON.stringify(r.application.answers || {}, null, 2)}</pre>
            </details>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Form mapping / submission result</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-slate-50 border rounded p-3 overflow-auto">{JSON.stringify({ form_mapping: r.application.form_mapping, submission_result: r.application.submission_result }, null, 2)}</pre>
            </details>
          </div>
        ))}
        {!apps.data?.length && <div className="card p-4 text-sm text-slate-500">No applications yet. From Matches, click “Prepare Application Materials”.</div>}
      </div>
    </div>
  )
}
