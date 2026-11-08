from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class AIResult:
    text: str
    provider: str
    model: str
    usage: dict[str, Any] = field(default_factory=dict)
    estimated_cost_usd: float = 0.0
    raw: Any = None


class Provider(Protocol):
    name: str

    async def generate(self, prompt: str, *, model: str, system: str | None = None, json_mode: bool = False, temperature: float = 0.2) -> AIResult: ...

    async def health(self) -> dict[str, Any]: ...
