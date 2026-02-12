import { NextResponse } from "next/server";

const BACKEND_API_BASE = process.env.BACKEND_API_URL?.trim() || "http://127.0.0.1:8000";
const BACKEND_UNREAD_ENDPOINT = `${BACKEND_API_BASE.replace(/\/$/, "")}/api/classify/unread`;

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const upstream = await fetch(BACKEND_UNREAD_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = (await upstream.json()) as unknown;
      return NextResponse.json(json, { status: upstream.status });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Could not connect to backend service.";

    return NextResponse.json(
      {
        detail: `Proxy error calling ${BACKEND_UNREAD_ENDPOINT}: ${detail}`,
      },
      { status: 502 },
    );
  }
}
