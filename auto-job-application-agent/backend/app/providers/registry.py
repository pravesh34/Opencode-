from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import yaml
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from app.core.config import settings
from app.providers.base import AIResult


class ProviderError(RuntimeError):
    pass


def load_ai_config() -> dict[str, Any]:
    path: Path = settings.ai_config_path
    if not path.exists():
        return {"ai": {"default_provider": settings.default_provider, "providers": {}, "tasks": {}}}
    return yaml.safe_load(path.read_text()) or {}


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, name: str, api_key: str | None, base_url: str | None, default_model: str):
        self.name = name
        self.api_key = api_key
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self.default_model = default_model

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(min=1, max=4), reraise=True)
    async def generate(self, prompt: str, *, model: str, system: str | None = None, json_mode: bool = False, temperature: float = 0.2) -> AIResult:
        if not self.api_key:
            return self._fallback(prompt, model)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload: dict[str, Any] = {"model": model or self.default_model, "messages": messages, "temperature": temperature}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{self.base_url}/chat/completions", headers={"Authorization": f"Bearer {self.api_key}"}, json=payload)
            if r.status_code >= 400:
                raise ProviderError(f"{self.name} error {r.status_code}: {r.text[:300]}")
            data = r.json()
        text = data["choices"][0]["message"].get("content") or ""
        usage = data.get("usage") or {}
        return AIResult(text=text, provider=self.name, model=payload["model"], usage=usage, raw=data)

    def _fallback(self, prompt: str, model: str) -> AIResult:
        # Safe deterministic fallback when no key is configured.
        snippet = prompt.strip().replace("\n", " ")[:500]
        return AIResult(text=f"[No API key configured for {self.name}. Configure provider in .env/Settings. Prompt summary: {snippet}]", provider=self.name, model=model or self.default_model, usage={"fallback": True})

    async def health(self) -> dict[str, Any]:
        return {"provider": self.name, "configured": bool(self.api_key), "base_url": self.base_url}


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str | None, default_model: str):
        self.api_key = api_key
        self.default_model = default_model

    async def generate(self, prompt: str, *, model: str, system: str | None = None, json_mode: bool = False, temperature: float = 0.2) -> AIResult:
        if not self.api_key:
            return AIResult(text=f"[No GEMINI_API_KEY configured. Prompt summary: {prompt[:400]}]", provider=self.name, model=model or self.default_model, usage={"fallback": True})
        try:
            from google import genai
            client = genai.Client(api_key=self.api_key)
            contents = prompt if not system else f"System: {system}\n\nUser: {prompt}"
            cfg: dict[str, Any] = {"temperature": temperature}
            if json_mode:
                cfg["response_mime_type"] = "application/json"
            resp = client.models.generate_content(model=model or self.default_model, contents=contents, config=cfg)
            text = getattr(resp, "text", None) or ""
            usage = {}
            um = getattr(resp, "usage_metadata", None)
            if um:
                usage = {"prompt_tokens": getattr(um, "prompt_token_count", None), "completion_tokens": getattr(um, "candidates_token_count", None)}
            return AIResult(text=text, provider=self.name, model=model or self.default_model, usage=usage, raw=None)
        except Exception as e:
            raise ProviderError(f"Gemini provider failed: {e}") from e

    async def health(self) -> dict[str, Any]:
        return {"provider": self.name, "configured": bool(self.api_key)}


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str | None, default_model: str):
        self.api_key = api_key
        self.default_model = default_model

    async def generate(self, prompt: str, *, model: str, system: str | None = None, json_mode: bool = False, temperature: float = 0.2) -> AIResult:
        if not self.api_key:
            return AIResult(text=f"[No ANTHROPIC_API_KEY configured. Prompt summary: {prompt[:400]}]", provider=self.name, model=model or self.default_model, usage={"fallback": True})
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=self.api_key)
            msg = await client.messages.create(
                model=model or self.default_model,
                max_tokens=4096,
                temperature=temperature,
                system=system or "",
                messages=[{"role": "user", "content": prompt + ("\nReturn valid JSON only." if json_mode else "")}],
            )
            text = "".join(getattr(b, "text", "") for b in msg.content)
            usage = {"input_tokens": getattr(msg.usage, "input_tokens", None), "output_tokens": getattr(msg.usage, "output_tokens", None)}
            return AIResult(text=text, provider=self.name, model=model or self.default_model, usage=usage, raw=None)
        except Exception as e:
            raise ProviderError(f"Anthropic provider failed: {e}") from e

    async def health(self) -> dict[str, Any]:
        return {"provider": self.name, "configured": bool(self.api_key)}


def get_provider_registry() -> dict[str, Any]:
    cfg = load_ai_config().get("ai", {})
    providers_cfg = cfg.get("providers", {})
    reg = {
        "gemini": GeminiProvider(settings.gemini_api_key, providers_cfg.get("gemini", {}).get("default_model", "gemini-1.5-flash")),
        "openai": OpenAICompatibleProvider("openai", settings.openai_api_key, "https://api.openai.com/v1", providers_cfg.get("openai", {}).get("default_model", "gpt-4o-mini")),
        "anthropic": AnthropicProvider(settings.anthropic_api_key, providers_cfg.get("anthropic", {}).get("default_model", "claude-3-5-haiku-latest")),
        "groq": OpenAICompatibleProvider("groq", settings.groq_api_key, "https://api.groq.com/openai/v1", providers_cfg.get("groq", {}).get("default_model", "llama-3.1-8b-instant")),
        "openai_compatible": OpenAICompatibleProvider("openai_compatible", settings.openai_compatible_api_key, settings.openai_compatible_base_url, providers_cfg.get("openai_compatible", {}).get("default_model", "configurable")),
    }
    return reg


async def run_task(task: str, prompt: str, *, system: str | None = None, json_mode: bool = False) -> AIResult:
    cfg = load_ai_config().get("ai", {})
    tasks = cfg.get("tasks", {})
    providers_cfg = cfg.get("providers", {})
    primary_name = tasks.get(task) or cfg.get("default_provider") or settings.default_provider
    fallback_name = cfg.get("default_provider") or "openai"
    reg = get_provider_registry()
    for name in [primary_name, fallback_name, "gemini", "openai"]:
        if not name or name not in reg:
            continue
        provider = reg[name]
        model = providers_cfg.get(name, {}).get("default_model") or getattr(provider, "default_model", "")
        try:
            return await provider.generate(prompt, model=model, system=system, json_mode=json_mode)
        except Exception:
            continue
    return AIResult(text="[All AI providers failed or are unconfigured.]", provider="none", model="", usage={"fallback": True})
