import base64
import os.path
from email.utils import parsedate_to_datetime
from typing import Any, Dict

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from .config import MAX_BODY_CHARS, SCOPES

TOKEN_PATH = "token.json"
CREDENTIALS_PATH = "credentials.json"

def _header_map(headers):
    mapped = {}
    for header in headers:
        name = header.get("name", "").lower()
        if name and name not in mapped:
            mapped[name] = header.get("value", "")
    return mapped


def iter_parts(payload):
    stack = [payload]
    while stack:
        part = stack.pop()
        yield part
        for subpart in part.get("parts", []) or []:
            stack.append(subpart)


def decode_body(data):
    if not data:
        return ""
    return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")


def _body_and_attachments(payload):
    plain_chunks = []
    html_chunks = []
    attachments = False
    for part in iter_parts(payload):
        body = part.get("body", {}) or {}
        if part.get("filename") or body.get("attachmentId"):
            attachments = True
        body_data = body.get("data")
        if not body_data:
            continue
        decoded = decode_body(body_data)
        mime_type = part.get("mimeType", "")
        if mime_type == "text/plain":
            plain_chunks.append(decoded)
        elif mime_type == "text/html":
            html_chunks.append(decoded)
    body = "\n\n".join(plain_chunks or html_chunks)
    return body, attachments


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n\n[truncated]"


def get_details(message):
    payload = message.get("payload", {})
    headers = _header_map(payload.get("headers", []))
    subject = headers.get("subject") or "No subject"
    sender = headers.get("from") or "Unknown sender"
    date_header = headers.get("date")
    date_time = ""
    if date_header:
        parsed = parsedate_to_datetime(date_header)
        if parsed:
            date_time = parsed.isoformat()
    snippet = message.get("snippet", "")
    body, attachments = _body_and_attachments(payload)
    return {
        "subject": subject,
        "sender": sender,
        "date_time": date_time or date_header or "Unknown date",
        "snippet": snippet,
        "attachments": attachments,
        "body": body,
    }


def normalize_email_details(details: Dict[str, Any]) -> Dict[str, Any]:
    body = details.get("body", "") or ""
    return {
        "id": details.get("message_id") or details.get("id") or "",
        "subject": details.get("subject", ""),
        "sender": details.get("sender", ""),
        "date_time": details.get("date_time", ""),
        "snippet": details.get("snippet", ""),
        "attachments": bool(details.get("attachments")),
        "body": _truncate(body, MAX_BODY_CHARS),
    }


def get_gmail_service(scopes=None):
    scopes = scopes or SCOPES
    creds = None
    # The file token.json stores the user's access and refresh tokens, and is
    # created automatically when the authorization flow completes for the first
    # time.
    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, scopes)

    def _run_oauth_flow():
        flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, scopes)
        return flow.run_local_server(port=0)

    # If there are no (valid) credentials available, let the user log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except RefreshError:
                # Token can become invalid/revoked; remove stale token and re-auth.
                if os.path.exists(TOKEN_PATH):
                    os.remove(TOKEN_PATH)
                creds = _run_oauth_flow()
        else:
            creds = _run_oauth_flow()
        # Save the credentials for the next run
        with open(TOKEN_PATH, "w", encoding="utf-8") as token:
            token.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def fetch_unread_message_details(max_results=2, user_id="me", label_ids=None):
    service = get_gmail_service()
    label_ids = label_ids or ["INBOX", "UNREAD"]
    results = (
        service.users()
        .messages()
        .list(userId=user_id, labelIds=label_ids, maxResults=max_results)
        .execute()
    )
    messages = results.get("messages", [])
    details_list = []
    for message in messages:
        msg = service.users().messages().get(userId=user_id, id=message["id"]).execute()
        details = get_details(msg)
        details["message_id"] = message["id"]
        details_list.append(details)
    return details_list
