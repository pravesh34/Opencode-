from __future__ import annotations

from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.session import get_db
from app.models.entities import CandidateProfile, Job, JobMatch, Application, AgentRun, AIUsage
from app.providers.registry import get_provider_registry, load_ai_config
from app.services.default_profile import ensure_profile, default_profile_payload
from app.services.matching import score_job, fingerprint_job
from app.services.generation import generate_application_materials
from app.services.browser_agent import run_browser_apply

router = APIRouter()


@router.get("/health")
async def health():
    return {"ok": True, "time": datetime.utcnow().isoformat(), "env": settings.env}


@router.get("/settings")
async def get_settings(db: Session = Depends(get_db)):
    ensure_profile(db)
    cfg = load_ai_config()
    reg = get_provider_registry()
    providers = []
    for name, p in reg.items():
        providers.append(await p.health() | {"name": name, "models": cfg.get("ai", {}).get("providers", {}).get(name, {}).get("models", []), "default_model": cfg.get("ai", {}).get("providers", {}).get(name, {}).get("default_model")})
    return {
        "approval_mode": settings.approval_mode,
        "browser_headless": settings.browser_headless,
        "default_provider": settings.default_provider,
        "ai_config": cfg.get("ai", {}),
        "providers": providers,
    }


@router.get("/profile")
def get_profile(db: Session = Depends(get_db)):
    p = ensure_profile(db)
    return p.__dict__ | {"_sa_instance_state": None}


@router.put("/profile")
def update_profile(payload: dict[str, Any], db: Session = Depends(get_db)):
    p = ensure_profile(db)
    for k, v in payload.items():
        if k in {"id", "created_at", "updated_at", "_sa_instance_state"}:
            continue
        if hasattr(p, k):
            setattr(p, k, v)
    db.commit(); db.refresh(p)
    return {"ok": True, "profile": p.id}


@router.post("/profile/reset-defaults")
def reset_profile(db: Session = Depends(get_db)):
    p = ensure_profile(db)
    for k, v in default_profile_payload().items():
        setattr(p, k, v)
    db.commit()
    return {"ok": True}


@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.updated_at.desc()).limit(500).all()
    return [j.__dict__ | {"_sa_instance_state": None} for j in jobs]


@router.post("/jobs/import")
def import_jobs(payload: dict[str, Any], db: Session = Depends(get_db)):
    items = payload.get("jobs") or []
    created = 0
    for item in items:
        fp = fingerprint_job(item.get("source", "import"), item.get("company", ""), item.get("title", ""), item.get("url", ""))
        if db.query(Job).filter(Job.fingerprint == fp).first():
            continue
        job = Job(
            external_id=item.get("external_id"), source=item.get("source", "import"), url=item.get("url", ""),
            title=item.get("title", ""), company=item.get("company", ""), location=item.get("location", ""),
            remote_type=item.get("remote_type", "unknown"), employment_type=item.get("employment_type", ""),
            description=item.get("description", ""), requirements=item.get("requirements") or [],
            responsibilities=item.get("responsibilities") or [], salary_text=item.get("salary_text", ""),
            status="discovered", fingerprint=fp, raw=item,
        )
        db.add(job); created += 1
    db.commit()
    return {"ok": True, "created": created, "received": len(items)}


@router.post("/jobs/sample")
def create_sample_jobs(db: Session = Depends(get_db)):
    sample = [
        {"source": "sample", "title": "AI/ML Intern", "company": "Example Labs", "location": "Remote, India", "remote_type": "remote", "employment_type": "Internship", "url": "https://example.com/jobs/ai-ml-intern", "description": "Looking for an AI/ML intern with Python, machine learning fundamentals, NumPy, Pandas, and prompt engineering interest. Students graduating 2027-2029 welcome. Paid internship."},
        {"source": "sample", "title": "LLM Evaluator (Remote Contractor)", "company": "Model QA Co", "location": "International remote", "remote_type": "remote", "employment_type": "Contract", "url": "https://example.com/jobs/llm-evaluator", "description": "Evaluate LLM responses for quality, safety, and prompt adherence. Strong writing, AI evaluation, and prompt engineering skills helpful. Accepting applicants from India."},
        {"source": "sample", "title": "Senior ML Engineer", "company": "BigCorp", "location": "Bengaluru, India", "remote_type": "onsite", "employment_type": "Full-time", "url": "https://example.com/jobs/senior-mle", "description": "Senior ML Engineer with 5+ years experience leading production ML systems. PhD preferred."},
    ]
    return import_jobs({"jobs": sample}, db)


@router.post("/pipeline/score")
def run_scoring(db: Session = Depends(get_db)):
    candidate = ensure_profile(db)
    jobs = db.query(Job).all()
    # clear old matches for simplicity in MVP
    db.query(JobMatch).delete()
    results = []
    for job in jobs:
        m = score_job(candidate, job)
        db.add(m)
        job.status = "scored"
        results.append({"job_id": job.id, "score": m.score, "action": m.recommended_action, "eligible": m.eligible})
    db.commit()
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"ok": True, "scored": len(results), "results": results}


@router.get("/matches")
def list_matches(db: Session = Depends(get_db)):
    rows = db.query(JobMatch, Job).join(Job, JobMatch.job_id == Job.id).order_by(JobMatch.score.desc()).limit(500).all()
    return [{"match": m.__dict__ | {"_sa_instance_state": None}, "job": j.__dict__ | {"_sa_instance_state": None}} for m, j in rows]


@router.post("/applications/prepare")
async def prepare_application(payload: dict[str, Any], db: Session = Depends(get_db)):
    job_id = payload.get("job_id")
    job = db.query(Job).get(job_id)
    candidate = ensure_profile(db)
    if not job:
        raise HTTPException(404, "Job not found")
    materials = await generate_application_materials(candidate, job)
    app = Application(job_id=job.id, candidate_id=candidate.id, status="needs_approval", approval_state="pending", resume_version=payload.get("resume_version", "default"), cover_letter=materials.get("cover_letter", ""), answers=materials.get("screening_answers", {}) or {}, notes="\n".join(materials.get("quality_warnings", []) or []))
    db.add(app); db.commit(); db.refresh(app)
    return {"ok": True, "application_id": app.id, "materials": materials}


@router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    rows = db.query(Application, Job).join(Job, Application.job_id == Job.id).order_by(Application.updated_at.desc()).all()
    return [{"application": a.__dict__ | {"_sa_instance_state": None}, "job": j.__dict__ | {"_sa_instance_state": None}} for a, j in rows]


@router.post("/applications/{app_id}/run-browser")
async def run_browser(app_id: int, db: Session = Depends(get_db)):
    row = db.query(Application, Job).join(Job, Application.job_id == Job.id).filter(Application.id == app_id).first()
    if not row:
        raise HTTPException(404, "Application not found")
    app, job = row
    candidate = ensure_profile(db)
    if not job.url:
        raise HTTPException(400, "Job has no URL")
    run = AgentRun(kind="browser_apply", status="running", input={"application_id": app_id, "url": job.url})
    db.add(run); db.commit(); db.refresh(run)
    result = await run_browser_apply(job.url, candidate.__dict__, job.__dict__, settings.approval_mode, settings.browser_headless)
    app.form_mapping = result.get("mapping", {})
    app.submission_result = result
    app.status = "needs_approval" if result.get("status") in {"needs_approval", "ready_unsubmitted"} else "failed" if result.get("status") == "failed" else app.status
    run.status = "completed" if result.get("status") != "failed" else "failed"
    run.output = result
    run.logs = result.get("logs", [])
    db.commit()
    return {"ok": True, "run_id": run.id, "result": result, "application_status": app.status}


@router.post("/applications/{app_id}/approve")
def approve_application(app_id: int, payload: dict[str, Any], db: Session = Depends(get_db)):
    app = db.query(Application).get(app_id)
    if not app: raise HTTPException(404, "Not found")
    app.approval_state = "approved" if payload.get("approved") else "rejected"
    if payload.get("mark_submitted"):
        app.status = "submitted"
        app.confirmation_id = payload.get("confirmation_id", "")
    db.commit()
    return {"ok": True}


@router.get("/agent-runs")
def list_runs(db: Session = Depends(get_db)):
    runs = db.query(AgentRun).order_by(AgentRun.created_at.desc()).limit(100).all()
    return [r.__dict__ | {"_sa_instance_state": None} for r in runs]
