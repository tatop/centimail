import { NextResponse } from "next/server";

import { classifyUnreadGmail } from "@/lib/backend/classifier";
import { BadRequestError, parseClassifyUnreadRequest } from "@/lib/backend/http";
import { enforceRateLimit, RateLimitError } from "@/lib/backend/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    enforceRateLimit("classify-unread");
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { detail: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json({ detail: "Rate limit error." }, { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const parsed = parseClassifyUnreadRequest(payload);
    const result = await classifyUnreadGmail({
      max_results: parsed.max_results,
      label_ids: parsed.label_ids,
      model: parsed.model,
      labels: parsed.labels,
      max_tokens: parsed.max_tokens,
      exclude_reasoning: !parsed.include_reasoning,
      use_structured_output: parsed.use_structured_output,
      timeout: parsed.timeout,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BadRequestError) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.startsWith("MODEL is missing")) {
      return NextResponse.json({ detail: error.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Internal server error.",
      },
      { status: 500 },
    );
  }
}
