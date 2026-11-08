from __future__ import annotations

import hashlib
import re
from datetime import datetime
from app.models.entities import CandidateProfile, Job, JobMatch


def fingerprint_job(source: str, company: str, title: str, url: str) -> str:
    key = "|".join([source or "", company or "", title or "", url or ""]).lower().strip()
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def _text(job: Job) -> str:
    return " ".join([job.title, job.company, job.location, job.description, " ".join(job.requirements or []), " ".join(job.responsibilities or [])]).lower()


def score_job(candidate: CandidateProfile, job: Job) -> JobMatch:
    text = _text(job)
    prefs = candidate.preferences or {}
    target_roles = [r.lower() for r in prefs.get("target_roles", [])]
    skills = [s.get("name", "").lower() if isinstance(s, dict) else str(s).lower() for s in (candidate.skills or [])]
    breakdown = {}
    role_hits = sum(1 for r in target_roles if any(tok in text for tok in r.split()[:3] if len(tok) > 3))
    role_score = min(35.0, role_hits * 7.0)
    breakdown["role_relevance"] = role_score
    skill_hits = sum(1 for s in skills if s and s in text)
    skill_score = min(35.0, skill_hits * 3.5)
    breakdown["skill_match"] = skill_score
    loc = (job.location or "").lower()
    remote_ok = "remote" in text or "remote" in loc or (job.remote_type or "").lower() == "remote"
    india_ok = "india" in loc or "india" in text
    loc_score = 15.0 if (remote_ok or india_ok) else 5.0
    breakdown["location_fit"] = loc_score
    exp_penalty = 0.0
    years = re.findall(r"(\d+)\+?\s*(?:years|yrs)", text)
    if years and max(int(y) for y in years) >= 3 and not (candidate.experience or candidate.internships):
        exp_penalty = -20.0
        eligible = False
        reason = "Role appears to require multiple years of experience; candidate has no declared professional experience/internships."
    else:
        eligible = True
        reason = "Candidate appears broadly eligible based on declared profile; verify specific requirements before applying."
    breakdown["experience_gate"] = exp_penalty
    suspicious = any(w in text for w in ["registration fee", "pay to apply", "whatsapp only", "telegram investment", "crypto payout guaranteed"])
    if suspicious:
        breakdown["safety_penalty"] = -50.0
        eligible = False
        reason = "Listing contains suspicious/scam indicators."
    score = max(0.0, min(100.0, 10.0 + role_score + skill_score + loc_score + exp_penalty + breakdown.get("safety_penalty", 0.0)))
    action = "apply" if eligible and score >= 70 else "review" if eligible and score >= 45 else "skip"
    explanation = (
        f"Score {score:.1f}/100. Role relevance {role_score:.1f}, skill match {skill_score:.1f}, "
        f"location fit {loc_score:.1f}. {reason}"
    )
    return JobMatch(
        job_id=job.id,
        candidate_id=candidate.id,
        score=score,
        eligible=eligible,
        eligibility_reason=reason,
        breakdown=breakdown,
        recommended_resume="ai-ml-internship" if "intern" in (job.title or "").lower() else "default",
        recommended_action=action,
        explanation=explanation,
    )
