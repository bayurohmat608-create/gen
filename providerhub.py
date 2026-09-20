from __future__ import annotations
import json, os, urllib.error, urllib.parse, urllib.request
from typing import Any

class ProviderHubError(RuntimeError):
    pass

def _get_json(url: str, headers: dict[str, str], timeout: int = 30) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={**headers, "User-Agent": "blind-agent-room/0.3.0"}, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:900]
        raise ProviderHubError(f"Provider menolak koneksi (HTTP {exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise ProviderHubError(f"Gagal menghubungi provider: {exc.reason}") from exc
    except json.JSONDecodeError as exc:
        raise ProviderHubError("Provider mengembalikan JSON yang tidak valid") from exc

def _normalize_v1(base_url: str) -> str:
    base = base_url.rstrip("/")
    return base if base.endswith("/v1") else base + "/v1"

def _safe_base(provider: str, base_url: str | None) -> str:
    if provider == "openai":
        return "https://api.openai.com"
    if provider == "anthropic":
        return "https://api.anthropic.com"
    if provider == "gemini":
        return "https://generativelanguage.googleapis.com"
    if provider == "openai-compatible":
        base = (base_url or "").strip()
        if not base.startswith(("https://", "http://127.0.0.1", "http://localhost")):
            raise ProviderHubError("OpenAI-compatible base URL harus HTTPS atau localhost")
        return base.rstrip("/")
    raise ProviderHubError(f"Provider tidak didukung: {provider}")

def _openai_rank(model_id: str) -> tuple[int, str]:
    mid = model_id.lower()
    generative = mid.startswith(("gpt-", "chatgpt-", "o1", "o3", "o4", "o5", "codex"))
    return (0 if generative else 1, mid)

def discover_models(provider: str, key: str, base_url: str | None = None) -> list[dict[str, Any]]:
    provider = provider.strip().lower()
    if not key:
        raise ProviderHubError("API key kosong")
    base = _safe_base(provider, base_url)
    if provider in {"openai", "openai-compatible"}:
        data = _get_json(
            f"{_normalize_v1(base)}/models",
            {"Authorization": f"Bearer {key}", "Accept": "application/json"},
        )
        rows = []
        for item in data.get("data", []) or []:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            mid = str(item["id"])
            rows.append({
                "id": mid,
                "display_name": mid,
                "owned_by": item.get("owned_by"),
                "kind": "generative" if _openai_rank(mid)[0] == 0 else "other",
            })
        rows.sort(key=lambda x: _openai_rank(x["id"]))
        return rows[:500]

    if provider == "anthropic":
        data = _get_json(
            f"{base}/v1/models?limit=1000",
            {"x-api-key": key, "anthropic-version": "2023-06-01", "Accept": "application/json"},
        )
        rows = []
        for item in data.get("data", []) or []:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            rows.append({
                "id": str(item["id"]),
                "display_name": str(item.get("display_name") or item["id"]),
                "max_input_tokens": item.get("max_input_tokens"),
                "max_output_tokens": item.get("max_tokens"),
                "kind": "generative",
            })
        return rows[:500]

    if provider == "gemini":
        data = _get_json(
            f"{base}/v1beta/models?pageSize=1000",
            {"x-goog-api-key": key, "Accept": "application/json"},
        )
        rows = []
        for item in data.get("models", []) or []:
            if not isinstance(item, dict) or not item.get("name"):
                continue
            methods = item.get("supportedGenerationMethods") or item.get("supportedActions") or []
            if methods and "generateContent" not in methods:
                continue
            mid = str(item.get("baseModelId") or item["name"]).removeprefix("models/")
            rows.append({
                "id": mid,
                "display_name": str(item.get("displayName") or mid),
                "input_token_limit": item.get("inputTokenLimit"),
                "output_token_limit": item.get("outputTokenLimit"),
                "kind": "generative",
            })
        rows.sort(key=lambda x: x["id"], reverse=True)
        return rows[:500]

    raise ProviderHubError(f"Provider tidak didukung: {provider}")

def connect_provider(provider: str, env_name: str, key: str, base_url: str | None = None) -> list[dict[str, Any]]:
    env_name = env_name.strip()
    if not env_name or not env_name.replace("_", "A").isalnum():
        raise ProviderHubError("Nama environment variable tidak valid")
    models = discover_models(provider, key, base_url)
    os.environ[env_name] = key
    return models

def discover_from_env(provider: str, env_name: str, base_url: str | None = None) -> list[dict[str, Any]]:
    key = os.getenv(env_name)
    if not key:
        raise ProviderHubError(f"Belum terhubung: {env_name} belum tersedia")
    return discover_models(provider, key, base_url)

def connection_summary(provider: str, env_name: str) -> dict[str, Any]:
    return {
        "provider": provider,
        "auth_method": "api_key",
        "env": env_name,
        "connected": bool(os.getenv(env_name)),
    }
