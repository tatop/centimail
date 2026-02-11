"""FastAPI server for Gmail classifier."""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import classifier


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
]


def _parse_cors_origins(value: Optional[str]) -> List[str]:
    if not value:
        return DEFAULT_CORS_ORIGINS
    items = [item.strip() for item in value.split(",")]
    return [item for item in items if item]


class EmailInput(BaseModel):
    id: Optional[str] = None
    message_id: Optional[str] = None
    subject: Optional[str] = None
    sender: Optional[str] = None
    date_time: Optional[str] = None
    snippet: Optional[str] = None
    attachments: Optional[bool] = None
    body: Optional[str] = None


class ClassifyUnreadRequest(BaseModel):
    max_results: int = Field(default=5, ge=1)
    label_ids: Optional[List[str]] = None
    model: Optional[str] = None
    labels: Optional[List[str]] = None
    max_tokens: int = Field(default=800, ge=1)
    include_reasoning: bool = False
    use_structured_output: bool = True
    timeout: float = Field(default=120.0, gt=0)
    api_url: Optional[str] = None


class ClassifyEmailsRequest(BaseModel):
    emails: List[EmailInput] = Field(default_factory=list)
    model: Optional[str] = None
    labels: Optional[List[str]] = None
    max_tokens: int = Field(default=800, ge=1)
    include_reasoning: bool = False
    use_structured_output: bool = True
    timeout: float = Field(default=120.0, gt=0)
    api_url: Optional[str] = None


app = FastAPI(title="Gmail Classifier API", version="0.1.0")

cors_origins = _parse_cors_origins(os.getenv("CORS_ORIGINS"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/classify/unread")
def classify_unread(payload: ClassifyUnreadRequest) -> Dict[str, Any]:
    try:
        return classifier.classify_unread_gmail(
            max_results=payload.max_results,
            label_ids=payload.label_ids,
            model=payload.model,
            labels=payload.labels,
            max_tokens=payload.max_tokens,
            exclude_reasoning=not payload.include_reasoning,
            use_structured_output=payload.use_structured_output,
            api_url=payload.api_url,
            timeout=payload.timeout,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/classify/emails")
def classify_emails(payload: ClassifyEmailsRequest) -> Dict[str, Any]:
    try:
        email_details = [email.model_dump() for email in payload.emails]
        return classifier.classify_and_summarize_messages(
            email_details,
            model=payload.model,
            labels=payload.labels,
            max_tokens=payload.max_tokens,
            exclude_reasoning=not payload.include_reasoning,
            use_structured_output=payload.use_structured_output,
            api_url=payload.api_url,
            timeout=payload.timeout,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("backend.server:app", host="0.0.0.0", port=port, reload=True)
