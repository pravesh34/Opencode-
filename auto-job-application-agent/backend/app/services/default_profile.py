from __future__ import annotations

from copy import deepcopy


def default_profile_payload() -> dict:
    # Editable defaults from the master prompt. No invented experience/certifications/projects.
    return {
        "full_name": "",
        "email": "",
        "phone": "",
        "location": "India",
        "headline": "B.Tech AI & ML undergraduate (NIT Sikkim, 2028) seeking AI/ML internships and remote roles",
        "summary": "Undergraduate AI/ML student with foundational skills in Python, machine learning, data analysis, and LLM/prompt workflows. Seeking paid internships, research, and remote AI opportunities where eligible.",
        "work_authorization": "Unknown - user must verify for each opportunity",
        "facts": [
            {"field": "degree", "value": "B.Tech", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
            {"field": "specialization", "value": "Artificial Intelligence and Machine Learning", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
            {"field": "institution", "value": "National Institute of Technology Sikkim", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
            {"field": "expected_graduation", "value": "2028", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
            {"field": "cgpa", "value": "7.87", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
            {"field": "academic_status", "value": "Undergraduate", "source": "user_prompt", "confidence": "high", "status": "verified_by_user_input"},
        ],
        "skills": [
            {"name": s, "source": "user_prompt", "confidence": "high", "status": "user_declared"}
            for s in [
                "Python", "C", "Data Structures and Algorithms", "NumPy", "Pandas", "Matplotlib",
                "Scikit-learn", "Machine learning fundamentals", "Deep learning fundamentals",
                "Neural networks", "Generative AI", "LLM APIs", "LangChain", "Prompt engineering",
                "SQL", "DBMS", "Data analysis", "AI evaluation", "Technical research",
                "Python-based development",
            ]
        ],
        "education": [{
            "degree": "B.Tech",
            "specialization": "Artificial Intelligence and Machine Learning",
            "institution": "National Institute of Technology Sikkim",
            "expected_graduation": "2028",
            "cgpa": "7.87",
            "status": "Undergraduate",
            "source": "user_prompt",
            "confidence": "high",
        }],
        "projects": [],
        "experience": [],
        "internships": [],
        "certifications": [],
        "achievements": [],
        "publications": [],
        "preferences": {
            "target_roles": [
                "AI internships", "Machine learning internships", "AI research internships",
                "AI evaluator roles", "LLM evaluator roles", "AI trainer roles", "AI data annotation",
                "Prompt evaluation", "AI quality assurance", "Python developer roles",
                "Junior data analyst roles", "Remote AI contractor roles", "Research assistant positions",
                "Generative AI internships",
            ],
            "locations": ["India", "Remote", "International remote (accepting applicants from India)"],
            "employment": ["Paid internships", "Remote contracts", "Part-time opportunities", "Full-time graduate opportunities where graduation eligibility permits"],
            "paid_internships_preferred": True,
            "assume_no_professional_experience": True,
        },
    }


def ensure_profile(db):
    from app.models.entities import CandidateProfile
    p = db.query(CandidateProfile).order_by(CandidateProfile.id.asc()).first()
    if p:
        return p
    p = CandidateProfile(**deepcopy(default_profile_payload()))
    db.add(p)
    db.commit()
    db.refresh(p)
    return p
