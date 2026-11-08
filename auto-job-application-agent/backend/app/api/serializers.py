from __future__ import annotations

from datetime import date, datetime
from typing import Any


def to_dict(obj: Any) -> dict[str, Any]:
    if obj is None:
        return {}
    data = {k: v for k, v in obj.__dict__.items() if not k.startswith('_sa_')}
    for k, v in list(data.items()):
        if isinstance(v, (datetime, date)):
            data[k] = v.isoformat()
    return data
