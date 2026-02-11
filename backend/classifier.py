"""Classify and summarize Gmail messages."""

import json
from typing import Any, Dict, List, Optional

from . import gmail, openrouter
from .config import DEFAULT_LABELS, MODEL


def _safe_str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _normalize_result_item(raw: Dict[str, Any]) -> Dict[str, str]:
    return {
        "id": _safe_str(raw.get("id") or raw.get("message_id") or raw.get("email_id")),
        "label": _safe_str(
            raw.get("label")
            or raw.get("classificazione")
            or raw.get("classification")
            or raw.get("category")
        ),
        "summary": _safe_str(
            raw.get("summary")
            or raw.get("riassunto")
            or raw.get("sommario")
            or raw.get("description")
        ),
        "subject": _safe_str(raw.get("subject") or raw.get("oggetto")),
        "sender": _safe_str(raw.get("sender") or raw.get("mittente") or raw.get("from")),
    }


def _extract_items_from_parsed(parsed: Dict[str, Any]) -> List[Dict[str, str]]:
    list_candidate: Any = None
    for key in ("items", "emails", "results"):
        value = parsed.get(key)
        if isinstance(value, list):
            list_candidate = value
            break

    if list_candidate is None:
        if any(
            key in parsed
            for key in ("label", "summary", "classificazione", "riassunto", "subject", "sender")
        ):
            list_candidate = [parsed]
        else:
            return []

    normalized: List[Dict[str, str]] = []
    for item in list_candidate:
        if isinstance(item, dict):
            normalized.append(_normalize_result_item(item))
    return normalized


def _build_system_prompt(labels: List[str]) -> str:
    label_list = ", ".join(labels)
    return (
        "Sei un assistente esperto in triage di email e gestione documentale. "
        "Il tuo compito è analizzare le email e trasformarle in dati strutturati. "
        f"\n\n1. CLASSIFICAZIONE: Usa esclusivamente UN label scelto tra: [{label_list}]. "
        "Non inventare mai etichette non presenti in lista. "
        "\n2. RIASSUNTO: Scrivi una sintesi professionale di 1-2 frasi (max 280 caratteri). "
        "Focus sull'obiettivo del mittente e sulle eventuali azioni richieste. "
        "\n3. CAMPI: Includi sempre subject e sender esattamente come presenti nell'input. "
        "\n4. FORMATO: Segui rigorosamente lo schema JSON richiesto da response_format."
    )


def _build_messages(
    email_payloads: List[Dict[str, Any]], labels: List[str]
) -> List[Dict[str, str]]:
    system_prompt = _build_system_prompt(labels)
    user_content = json.dumps({"emails": email_payloads}, ensure_ascii=True)
    combined = f"{system_prompt}\n\nInput JSON:\n{user_content}"
    return [{"role": "user", "content": combined}]


def _build_structured_output_format(labels: List[str]) -> Dict[str, Any]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "gmail_triage_output",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "required": ["items"],
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "required": [
                                "id",
                                "label",
                                "summary",
                                "subject",
                                "sender",
                            ],
                            "properties": {
                                "id": {"type": "string"},
                                "label": {"type": "string", "enum": labels},
                                "summary": {
                                    "type": "string",
                                    "maxLength": 280,
                                },
                                "subject": {"type": "string"},
                                "sender": {"type": "string"},
                            },
                        },
                    }
                },
            },
        },
    }


def classify_and_summarize_messages(
    email_details: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    labels: Optional[List[str]] = None,
    max_tokens: Optional[int] = 800,
    exclude_reasoning: bool = True,
    use_structured_output: bool = True,
    api_url: Optional[str] = None,
    timeout: float = 120.0,
) -> Dict[str, Any]:
    """Classify + summarize a list of Gmail message detail dicts."""
    if not email_details:
        return {"items": []}

    chosen_model = model or MODEL
    if not chosen_model:
        raise ValueError("MODEL is missing. Set MODEL in .env or pass model=...")

    chosen_labels = labels or DEFAULT_LABELS
    payloads = [gmail.normalize_email_details(details) for details in email_details]
    messages = _build_messages(payloads, chosen_labels)
    reasoning = {"exclude": True} if exclude_reasoning else None
    response_format = (
        _build_structured_output_format(chosen_labels)
        if use_structured_output
        else None
    )
    provider = {"require_parameters": True} if use_structured_output else None
    response = openrouter.call_openrouter(
        chosen_model,
        messages,
        max_tokens=max_tokens,
        reasoning=reasoning,
        response_format=response_format,
        provider=provider,
        api_url=api_url,
        timeout=timeout,
    )
    if not response:
        return {"items": [], "error": "No response from OpenRouter."}
    if (
        isinstance(response, dict)
        and response.get("error")
        and "choices" not in response
    ):
        return {"items": [], "error": "OpenRouter error", "details": response}

    parsed, content = openrouter.parse_openrouter_json(response)
    if isinstance(parsed, dict):
        items = _extract_items_from_parsed(parsed)
        subject_by_id = {
            item.get("id", ""): item.get("subject", "") for item in payloads
        }
        sender_by_id = {
            item.get("id", ""): item.get("sender", "") for item in payloads
        }
        for item in items:
            item_id = item.get("id", "")
            if item_id and not item.get("subject"):
                item["subject"] = subject_by_id.get(item_id, "")
            if item_id and not item.get("sender"):
                item["sender"] = sender_by_id.get(item_id, "")
        return {"items": items}

    return {
        "items": [],
        "error": "Failed to parse JSON response.",
        "raw_content": content,
        "raw_response": response,
    }


def classify_unread_gmail(
    *,
    max_results: int = 5,
    label_ids: Optional[List[str]] = None,
    model: Optional[str] = None,
    labels: Optional[List[str]] = None,
    max_tokens: Optional[int] = 800,
    exclude_reasoning: bool = True,
    use_structured_output: bool = True,
    api_url: Optional[str] = None,
    timeout: float = 120.0,
) -> Dict[str, Any]:
    """Fetch unread Gmail messages via gmail.py and classify them."""
    details = gmail.fetch_unread_message_details(
        max_results=max_results,
        label_ids=label_ids,
    )
    return classify_and_summarize_messages(
        details,
        model=model,
        labels=labels,
        max_tokens=max_tokens,
        exclude_reasoning=exclude_reasoning,
        use_structured_output=use_structured_output,
        api_url=api_url,
        timeout=timeout,
    )
