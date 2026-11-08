import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Job } from '../lib/types'

export function JobsPage() {
  const qc = useQueryClient()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => api<Job[]>('/api/jobs') })
  const [form, setForm] = useState({ title: '', company: '', url: '', location: '', remote_type: 'unknown', employment_type: '', description: '' })
  const importOne = useMutation({
    mutationFn: () => api('/api/jobs/import', { method: 'POST', body: JSON.stringify({ jobs: [{ ...form, source: 'manual' }] }) }),
    onSuccess: () => { setForm({ title: '', company: '', url: '', location: '', remote_type: 'unknown', employment_type: '', description: '' }); qc.invalidateQueries({ queryKey: ['jobs'] }) },
  })
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Job Discovery & Intake</h1>
        <p className="text-sm text-slate-600 mt-1">Import/manual intake with normalization and dedupe. Platform adapters, authenticated source connectors, scam/expiry detection, and scheduled discovery can be extended in the modular pipeline; this build supports manual import, sample ingestion, scoring, and browser-based application workflows.</p>
      </div>
      <div className="card p-4 grid md:grid-cols-2 gap-3">
        <div><label>Title</label><input className="input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><label>Company</label><input className="input" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
        <div className="md:col-span-2"><label>URL</label><input className="input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} /></div>
        <div><label>Location</label><input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
        <div><label>Remote type</label><select value={form.remote_type} onChange={e => setForm({ ...form, remote_type: e.target.value })}><option value="unknown">unknown</option><option value="remote">remote</option><option value="hybrid">hybrid</option><option value="onsite">onsite</option></select></div>
        <div className="md:col-span-2"><label>Employment type</label><input className="input" value={form.employment_type} onChange={e => setForm({ ...form, employment_type: e.target.value })} /></div>
        <div className="md:col-span-2"><label>Description</label><textarea rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="md:col-span-2"><button className="btn btn-primary" onClick={() => importOne.mutate()} disabled={importOne.isPending || !form.title}>Add Job</button></div>
      </div>
      <div className="space-y-3">
        {(jobs.data || []).map(job => (
          <div key={job.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{job.title}</div>
                <div className="text-sm text-slate-600">{job.company} · {job.location || '—'} · {job.employment_type || '—'} · {job.remote_type}</div>
                {job.url && <a className="text-sm text-teal-700 underline" href={job.url} target="_blank" rel="noreferrer">{job.url}</a>}
              </div>
              <div className="text-xs px-2 py-1 rounded-full bg-slate-100">{job.status} / {job.source}</div>
            </div>
            <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{job.description?.slice(0, 500)}{job.description && job.description.length > 500 ? '…' : ''}</p>
          </div>
        ))}
        {!jobs.data?.length && <div className="card p-4 text-sm text-slate-500">No jobs yet. Use Dashboard “Load Sample Jobs” or add one manually.</div>}
      </div>
    </div>
  )
}
