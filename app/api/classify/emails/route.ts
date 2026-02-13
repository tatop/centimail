import { NextResponse } from "next/server";

import { classifyAndSummarizeMessages } from "@/lib/backend/classifier";
import { BadRequestError, parseClassifyEmailsRequest } from "@/lib/backend/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const parsed = parseClassifyEmailsRequest(payload);
    const result = await classifyAndSummarizeMessages(parsed.emails, {
      model: parsed.model,
      labels: parsed.labels,
      max_tokens: parsed.max_tokens,
      exclude_reasoning: !parsed.include_reasoning,
      use_structured_output: parsed.use_structured_output,
      timeout: parsed.timeout,
      api_url: parsed.api_url,
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
