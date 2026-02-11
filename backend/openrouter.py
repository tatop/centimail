"""OpenRouter API client (stdlib-only HTTP)."""

import json
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional

from .config import OPENROUTER_KEY, API_URL


def _content_from_parts(content: Any) -> Optional[str]:
    if isinstance(content, str) and content:
        return content
    if isinstance(content, dict):
        return json.dumps(content)
    if isinstance(content, list):
        parts = []
        for item in content:
            if (
                isinstance(item, dict)
                and item.get("type") in {"text", "output_text"}
            ):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        if parts:
            return "".join(parts)
    return None


def _extract_parsed_json(response: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(response, dict):
        return None

    if isinstance(response.get("parsed"), dict):
        return response.get("parsed")

    choices = response.get("choices", [])
    if not choices or not isinstance(choices[0], dict):
        return None
    message = choices[0].get("message", {})
    if not isinstance(message, dict):
        return None

    parsed = message.get("parsed")
    if isinstance(parsed, dict):
        return parsed

    content = message.get("content")
    if isinstance(content, dict):
        return content
    return None


def _extract_content(response: Dict[str, Any]) -> Optional[str]:
    if not isinstance(response, dict):
        return None
    content = _content_from_parts(response.get("content"))
    if content:
        return content
    choices = response.get("choices", [])
    if not choices:
        return None
    first = choices[0] if isinstance(choices[0], dict) else {}
    message = first.get("message", {}) if isinstance(first.get("message"), dict) else {}
    content = _content_from_parts(message.get("content"))
    if content:
        return content
    return first.get("text") if isinstance(first.get("text"), str) else None


def _strip_code_fences(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1]
    if stripped.endswith("```"):
        stripped = stripped.rsplit("\n", 1)[0]
    return stripped.strip()


def _parse_json_content(content: str) -> Optional[Dict[str, Any]]:
    if not content:
        return None
    text = _strip_code_fences(content)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None


def call_openrouter(
    model: str,
    messages: List[Dict[str, str]],
    *,
    max_tokens: Optional[int] = None,
    reasoning: Optional[Dict[str, Any]] = None,
    response_format: Optional[Dict[str, Any]] = None,
    provider: Optional[Dict[str, Any]] = None,
    api_url: Optional[str] = None,
    timeout: float = 120.0,
    headers: Optional[Dict[str, str]] = None,
) -> Optional[Dict[str, Any]]:
    """Call OpenRouter with chat messages and return raw JSON response."""
    if not OPENROUTER_KEY:
        print("OPENROUTER_API_KEY is missing.")
        return None

    target_url = api_url or API_URL
    if not target_url:
        print("OPENROUTER_API_URL is missing.")
        return None

    request_headers = {
        "Authorization": f"Bearer {OPENROUTER_KEY}",
        "Content-Type": "application/json",
        **(headers or {}),
    }

    payload: Dict[str, Any] = {"model": model, "messages": messages}
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    if reasoning is not None:
        payload["reasoning"] = reasoning
    if response_format is not None:
        payload["response_format"] = response_format
    if provider is not None:
        payload["provider"] = provider

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            target_url,
            data=data,
            headers=request_headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            body = ""
        print(f"Error querying OpenRouter: HTTP {e.code} {e.reason}")
        if body:
            print(f"OpenRouter error body: {body}")
        return {
            "error": "HTTPError",
            "status": e.code,
            "reason": str(e.reason),
            "body": body,
        }
    except urllib.error.URLError as e:
        print(f"Error querying OpenRouter: {e}")
        return {
            "error": "URLError",
            "reason": str(getattr(e, "reason", e)),
        }
    except Exception as e:
        print(f"Unexpected error querying OpenRouter: {e}")
        return {"error": "UnexpectedError", "message": str(e)}


def parse_openrouter_json(response: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], str]:
    """Extract JSON content from an OpenRouter response."""
    parsed_json = _extract_parsed_json(response)
    if isinstance(parsed_json, dict):
        return parsed_json, json.dumps(parsed_json)

    content = _extract_content(response) or ""
    parsed = _parse_json_content(content)
    return parsed, content
