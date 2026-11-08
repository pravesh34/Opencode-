import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

export function ProfilePage() {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<any>('/api/profile') })
  const [text, setText] = useState('')
  useEffect(() => { if (profile.data) setText(JSON.stringify(profile.data, null, 2)) }, [profile.data])
  const save = useMutation({
    mutationFn: async () => {
      const payload = JSON.parse(text)
      return api('/api/profile', { method: 'PUT', body: JSON.stringify(payload) })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
  const reset = useMutation({ mutationFn: () => api('/api/profile/reset-defaults', { method: 'POST' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }) })
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h1 className="text-xl font-semibold">Candidate Profile</h1>
        <p className="text-sm text-slate-600 mt-1">Editable profile seeded with prompt defaults. Facts should keep source/confidence. The system must not invent experience, certifications, degrees, publications, projects, or work authorization.</p>
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending || !text}>Save JSON</button>
          <button className="btn" onClick={() => reset.mutate()} disabled={reset.isPending}>Reset to Prompt Defaults</button>
        </div>
        {save.isError && <p className="text-sm text-red-700 mt-2">{String(save.error)}</p>}
        {save.isSuccess && <p className="text-sm text-teal-700 mt-2">Saved.</p>}
      </div>
      <div className="card p-4">
        <label>Profile JSON (all sections: personal/contact, education, skills, projects, experience, internships, certifications, achievements, publications, preferences, facts/provenance)</label>
        <textarea className="font-mono text-xs min-h-[520px]" value={text} onChange={e => setText(e.target.value)} />
      </div>
    </div>
  )
}
