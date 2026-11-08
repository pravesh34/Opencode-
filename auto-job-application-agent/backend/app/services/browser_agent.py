from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from app.core.config import settings
from app.providers.registry import run_task


async def map_form_fields(page_text: str, candidate: dict, job: dict) -> dict[str, Any]:
    prompt = f"""Map application form fields to candidate data. Return JSON with keys: fields (array of {{selector_hint,label,type,value,confidence,requires_user_input,reason}}), warnings (array), submit_selector_hint.
Use only candidate facts. Mark unknown/sensitive fields requires_user_input=true.

Candidate: {json.dumps(candidate)[:8000]}
Job: {json.dumps(job)[:4000]}
Page/form text/labels: {page_text[:12000]}
"""
    res = await run_task("browser_form_mapping", prompt, system="You are a browser form-mapping assistant. Output strict JSON.", json_mode=True)
    try:
        return json.loads(res.text)
    except Exception:
        return {"fields": [], "warnings": ["Could not parse AI form mapping; review manually."], "raw": res.text[:1000]}


async def run_browser_apply(url: str, candidate: dict, job: dict, approval_mode: str, headless: bool | None = None) -> dict[str, Any]:
    headless = settings.browser_headless if headless is None else headless
    logs: list[str] = []
    result: dict[str, Any] = {"url": url, "status": "not_submitted", "logs": logs, "screenshots": []}
    try:
        from playwright.async_api import async_playwright
    except Exception as e:
        return {"url": url, "status": "failed", "error": f"Playwright unavailable: {e}. Run: pip install playwright && playwright install chromium", "logs": logs}

    profile_dir = settings.browser_profiles_dir / "default"
    profile_dir.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(str(profile_dir), headless=headless)
        page = await context.new_page()
        try:
            logs.append(f"Opening {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
            await page.wait_for_timeout(1500)
            body = await page.locator("body").inner_text()
            mapping = await map_form_fields(body, candidate, job)
            result["mapping"] = mapping
            shot = settings.exports_dir / f"apply-{Path(url).name[:40].replace('/','_') or 'page'}.png"
            try:
                await page.screenshot(path=str(shot), full_page=True)
                result["screenshots"].append(str(shot))
            except Exception:
                pass
            # Conservative fill: only fill obvious inputs by label/name/id heuristics when values are simple.
            filled = []
            for field in mapping.get("fields", [])[:30]:
                if field.get("requires_user_input") or not field.get("value"):
                    continue
                hint = (field.get("selector_hint") or field.get("label") or "").lower()
                value = str(field.get("value"))
                candidates = [
                    f"input[name*='{hint}']", f"input[id*='{hint}']", f"textarea[name*='{hint}']", f"textarea[id*='{hint}']",
                ]
                ok = False
                for sel in candidates:
                    try:
                        loc = page.locator(sel).first
                        if await loc.count() > 0 and await loc.is_visible():
                            await loc.fill(value)
                            filled.append({"selector": sel, "label": field.get("label")})
                            ok = True
                            break
                    except Exception:
                        continue
                if not ok:
                    logs.append(f"Skipped ambiguous field: {field.get('label')}")
            result["filled"] = filled
            if approval_mode != "auto_submit_allowlisted":
                result["status"] = "needs_approval"
                result["message"] = "Form opened and mapped. Submission blocked by approval policy; review mapping/screenshots and submit manually or change policy."
            else:
                result["status"] = "ready_unsubmitted"
                result["message"] = "Auto-submit is allowlist-gated in this build for safety; no generic submit was executed."
        except Exception as e:
            result["status"] = "failed"
            result["error"] = str(e)
            logs.append(f"Error: {e}")
        finally:
            await context.close()
    return result
