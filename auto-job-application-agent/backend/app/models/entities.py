from __future__ import annotations

from datetime import datetime, date
from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, Date, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CandidateProfile(Base, TimestampMixin):
    __tablename__ = "candidate_profiles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(100), default="")
    location: Mapped[str] = mapped_column(String(200), default="India")
    headline: Mapped[str] = mapped_column(String(300), default="B.Tech AI/ML student seeking AI/ML opportunities")
    summary: Mapped[str] = mapped_column(Text, default="")
    work_authorization: Mapped[str] = mapped_column(String(200), default="Unknown - user must verify")
    facts: Mapped[list] = mapped_column(JSON, default=list)  # {field,value,source,confidence,status}
    skills: Mapped[list] = mapped_column(JSON, default=list)
    education: Mapped[list] = mapped_column(JSON, default=list)
    projects: Mapped[list] = mapped_column(JSON, default=list)
    experience: Mapped[list] = mapped_column(JSON, default=list)
    internships: Mapped[list] = mapped_column(JSON, default=list)
    certifications: Mapped[list] = mapped_column(JSON, default=list)
    achievements: Mapped[list] = mapped_column(JSON, default=list)
    publications: Mapped[list] = mapped_column(JSON, default=list)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str | None] = mapped_column(String(255), index=True)
    source: Mapped[str] = mapped_column(String(100), default="manual")
    url: Mapped[str] = mapped_column(Text, default="")
    title: Mapped[str] = mapped_column(String(300), default="")
    company: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    remote_type: Mapped[str] = mapped_column(String(50), default="unknown")
    employment_type: Mapped[str] = mapped_column(String(100), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    requirements: Mapped[list] = mapped_column(JSON, default=list)
    responsibilities: Mapped[list] = mapped_column(JSON, default=list)
    salary_text: Mapped[str] = mapped_column(String(200), default="")
    posted_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="discovered")  # discovered,scored,queued,applied,rejected,expired,suspicious
    fingerprint: Mapped[str | None] = mapped_column(String(128), index=True)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    matches: Mapped[list["JobMatch"]] = relationship(back_populates="job", cascade="all,delete-orphan")


class JobMatch(Base, TimestampMixin):
    __tablename__ = "job_matches"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    eligible: Mapped[bool] = mapped_column(Boolean, default=False)
    eligibility_reason: Mapped[str] = mapped_column(Text, default="")
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    recommended_resume: Mapped[str] = mapped_column(String(200), default="default")
    recommended_action: Mapped[str] = mapped_column(String(100), default="review")  # apply,review,skip
    explanation: Mapped[str] = mapped_column(Text, default="")
    job: Mapped[Job] = relationship(back_populates="matches")


class Application(Base, TimestampMixin):
    __tablename__ = "applications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidate_profiles.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="draft")  # draft,needs_approval,submitted,failed,interview,rejected,offer
    approval_state: Mapped[str] = mapped_column(String(50), default="pending")
    resume_version: Mapped[str] = mapped_column(String(200), default="default")
    cover_letter: Mapped[str] = mapped_column(Text, default="")
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    form_mapping: Mapped[dict] = mapped_column(JSON, default=dict)
    submission_result: Mapped[dict] = mapped_column(JSON, default=dict)
    confirmation_id: Mapped[str] = mapped_column(String(200), default="")
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class AgentRun(Base, TimestampMixin):
    __tablename__ = "agent_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(100), default="pipeline")
    status: Mapped[str] = mapped_column(String(50), default="running")
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    logs: Mapped[list] = mapped_column(JSON, default=list)
    error: Mapped[str] = mapped_column(Text, default="")


class AIUsage(Base, TimestampMixin):
    __tablename__ = "ai_usage"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(100))
    model: Mapped[str] = mapped_column(String(200))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
