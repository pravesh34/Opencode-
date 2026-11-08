export type Json = Record<string, any>

export interface Job {
  id: number
  source: string
  url: string
  title: string
  company: string
  location: string
  remote_type: string
  employment_type: string
  description: string
  requirements: string[]
  responsibilities: string[]
  salary_text: string
  status: string
  fingerprint?: string
  raw?: Json
  created_at?: string
  updated_at?: string
}

export interface JobMatchRow {
  match: {
    id: number
    job_id: number
    candidate_id: number
    score: number
    eligible: boolean
    eligibility_reason: string
    breakdown: Json
    recommended_resume: string
    recommended_action: string
    explanation: string
  }
  job: Job
}

export interface ApplicationRow {
  application: {
    id: number
    job_id: number
    candidate_id: number
    status: string
    approval_state: string
    resume_version: string
    cover_letter: string
    answers: Json
    form_mapping: Json
    submission_result: Json
    confirmation_id: string
    notes: string
    updated_at?: string
  }
  job: Job
}
