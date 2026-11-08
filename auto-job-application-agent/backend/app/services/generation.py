from __future__ import annotations

import json
from app.models.entities import CandidateProfile, Job
from app.providers.registry import run_task


async def generate_application_materials(candidate: CandidateProfile, job: Job) -> dict:
    profile = {
        "headline": candidate.headline,
        "summary": candidate.summary,
        "education": candidate.education,
        "skills": [s.get("name") if isinstance(s, dict) else s for s in candidate.skills or []],
        "projects": candidate.projects,
        "experience": candidate.experience,
        "internships": candidate.internships,
        "facts": candidate.facts,
        "preferences": candidate.preferences,
    }
    prompt = f"""Create tailored application materials using ONLY the verified/declared candidate facts below. Do not invent experience, certifications, degrees, publications, or projects.
Return JSON with keys: resume_summary, cover_letter, screening_answers (object), quality_warnings (array).

Candidate profile:
{json.dumps(profile, indent=2)}

Job:
Title: {job.title}
Company: {job.company}
Location: {job.location}
Description:
{job.description[:12000]}
"""
    result = await run_task("resume_generation", prompt, system="You are a careful career assistant. Output strict JSON.", json_mode=True)
    try:
        data = json.loads(result.text)
    except Exception:
        data = {
            "resume_summary": candidate.summary,
            "cover_letter": f"Dear Hiring Team at {job.company or 'your organization'},\n\nI am applying for the {job.title} role. As a B.Tech AI & ML undergraduate at NIT Sikkim (expected 2028, CGPA 7.87), I bring foundational skills in {', '.join([s.get('name','') if isinstance(s,dict) else str(s) for s in (candidate.skills or [])[:8]])}. I am eager to contribute and learn.\n\nSincerely,\n{candidate.full_name or '[Your Name]'}",
            "screening_answers": {"why_this_role": "Tailor this answer after reviewing the job description."},
            "quality_warnings": ["AI provider returned non-JSON; used safe template. Configure API keys in Settings/.env for tailored generation."],
            "provider_note": result.text[:500],
        }
    data["provider"] = result.provider
    data["model"] = result.model
    return data
