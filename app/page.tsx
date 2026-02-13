"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ApiItem = {
  id?: string;
  label?: string;
  summary?: string;
  subject?: string;
  sender?: string;
};

type LegacyApiItem = {
  id?: string;
  message_id?: string;
  email_id?: string;
  label?: string;
  classificazione?: string;
  classification?: string;
  category?: string;
  summary?: string;
  riassunto?: string;
  sommario?: string;
  description?: string;
  subject?: string;
  oggetto?: string;
  sender?: string;
  mittente?: string;
  from?: string;
};

type ApiResponse = {
  items?: ApiItem[];
  emails?: LegacyApiItem[];
  results?: LegacyApiItem[];
  error?: string;
  details?: unknown;
  raw_content?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const UNREAD_ENDPOINT = API_BASE
  ? `${API_BASE.replace(/\/$/, "")}/api/classify/unread`
  : "/api/classify/unread";

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const normalizeItem = (item: LegacyApiItem): ApiItem => ({
  id: asString(item.id ?? item.message_id ?? item.email_id),
  label: asString(
    item.label ?? item.classificazione ?? item.classification ?? item.category,
  ),
  summary: asString(
    item.summary ?? item.riassunto ?? item.sommario ?? item.description,
  ),
  subject: asString(item.subject ?? item.oggetto),
  sender: asString(item.sender ?? item.mittente ?? item.from),
});

const normalizeResponse = (payload: ApiResponse): ApiResponse => {
  const directItems = Array.isArray(payload.items)
    ? payload.items.map((item) => normalizeItem(item as LegacyApiItem))
    : [];

  if (directItems.length > 0 || payload.items) {
    return { ...payload, items: directItems };
  }

  const listCandidate = Array.isArray(payload.emails)
    ? payload.emails
    : Array.isArray(payload.results)
      ? payload.results
      : [];

  return {
    ...payload,
    items: listCandidate.map((item) => normalizeItem(item)),
  };
};

const formatRelativeTime = (date: Date) => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const getBadgeClass = (label?: string) => {
  if (!label) return "text-[#666666] border-[#2a2a2a]";
  const n = label.toLowerCase();
  if (n.includes("work") || n.includes("job")) return "text-[#8ab0ff] border-[#38507a]";
  if (n.includes("personal") || n.includes("private")) return "text-[#ddb3ff] border-[#66507a]";
  if (n.includes("finance") || n.includes("money") || n.includes("bill")) {
    return "text-[#ffd88a] border-[#6f5a31]";
  }
  if (n.includes("urgent") || n.includes("important")) return "text-[#ff9898] border-[#7a3e3e]";
  if (n.includes("news") || n.includes("update")) return "text-[#7fd6d6] border-[#2f6666]";
  if (n.includes("social") || n.includes("promo")) return "text-[#b6d48c] border-[#52663a]";
  return "text-[#88cc88] border-[#3a5a3a]";
};

function SkeletonCard() {
  return (
    <div className="rounded-none border border-[#2a2a2a] bg-[#111111] px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="h-4 w-44 animate-pulse bg-[#2a2a2a]" />
        <div className="h-5 w-16 animate-pulse border border-[#2a2a2a] bg-[#0f0f0f]" />
      </div>
      <div className="mb-1 h-3 w-full animate-pulse bg-[#2a2a2a]" />
      <div className="h-3 w-2/3 animate-pulse bg-[#2a2a2a]" />
    </div>
  );
}

export default function Home() {
  const [maxResults, setMaxResults] = useState(5);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [error, setError] = useState("");
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState("all");

  const items = useMemo(() => response?.items ?? [], [response]);

  const labels = useMemo(() => {
    const labelSet = new Set<string>();
    items.forEach((item) => {
      if (item.label) labelSet.add(item.label);
    });
    return Array.from(labelSet).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeTab === "all") return items;
    return items.filter((item) => item.label === activeTab);
  }, [items, activeTab]);

  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    items.forEach((item) => {
      if (item.label) counts[item.label] = (counts[item.label] || 0) + 1;
    });
    return counts;
  }, [items]);

  const statusText = useMemo(() => {
    if (status === "loading") return "fetching...";
    if (status === "error") return "err: request failed";
    if (status === "success") return `${filteredItems.length}/${items.length} items`;
    return "idle";
  }, [status, filteredItems.length, items.length]);

  const statusSymbol = useMemo(() => {
    if (status === "loading") return "~";
    if (status === "error") return "x";
    if (status === "success") return "*";
    return "-";
  }, [status]);

  const fetchUnread = useCallback(async (limit: number) => {
    setStatus("loading");
    setError("");
    setActiveTab("all");

    try {
      const res = await fetch(UNREAD_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ max_results: limit }),
      });

      const json = (await res.json()) as ApiResponse | { detail?: string };
      if (!res.ok) {
        const detail = "detail" in json ? json.detail : undefined;
        throw new Error(detail || `Request failed (${res.status})`);
      }

      setResponse(normalizeResponse(json as ApiResponse));
      setLastFetchedAt(new Date());
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  useEffect(() => {
    void fetchUnread(5);
  }, [fetchUnread]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 pb-24 pt-8 text-[13px] leading-relaxed text-[#d4d4d4]">
      <div className="mx-auto w-full max-w-[760px] font-mono">
        <header className="mb-6">
          <div className="mb-1 flex items-baseline gap-3">
            <span className="text-base font-semibold text-[#88cc88]">&gt;</span>
            <h1 className="m-0 text-base font-semibold tracking-[0.02em] lowercase text-[#e8e8e8]">
              centimail
            </h1>
          </div>
          <p className="m-0 pl-5 text-xs text-[#666666]">gmail classifier / unread brief</p>
          <div className="my-3 overflow-hidden whitespace-nowrap text-xs select-none text-[#444444]">
            {"─".repeat(80)}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2.5">
            <label htmlFor="max-results" className="text-xs text-[#666666]">
              limit:
            </label>
            <div className="flex items-center gap-2">
              <input
                id="max-results"
                type="number"
                min={1}
                value={maxResults}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setMaxResults(Number.isNaN(nextValue) || nextValue < 1 ? 1 : nextValue);
                }}
                className="w-12 border border-[#2a2a2a] bg-[#0a0a0a] px-1.5 py-1 text-center text-[13px] text-[#d4d4d4] outline-none focus:border-[#88cc88]"
              />
              <button
                type="button"
                onClick={() => void fetchUnread(maxResults)}
                disabled={status === "loading"}
                className="cursor-pointer border border-[#2a2a2a] bg-transparent px-3 py-1 text-xs tracking-[0.02em] lowercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 enabled:hover:border-[#d4d4d4] enabled:hover:bg-[#d4d4d4] enabled:hover:text-[#0a0a0a]"
              >
                {status === "loading" ? "..." : "[ fetch ]"}
              </button>
            </div>
            <span className="ml-auto text-[11px] text-[#444444]">
              {API_BASE || "next api"}
            </span>
          </div>
        </header>

        {labels.length > 0 && (
          <nav className="mb-4 flex gap-0 overflow-x-auto border-b border-[#2a2a2a] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              className={`mb-[-1px] flex cursor-pointer items-center gap-1.5 border-b px-3.5 py-1.5 text-xs tracking-[0.02em] lowercase transition-colors ${
                activeTab === "all"
                  ? "border-[#88cc88] text-[#88cc88]"
                  : "border-transparent text-[#666666] hover:text-[#d4d4d4]"
              }`}
              onClick={() => setActiveTab("all")}
              type="button"
            >
              all
              <span className={activeTab === "all" ? "text-[#3a5a3a]" : "text-[#444444]"}>
                ({labelCounts.all || 0})
              </span>
            </button>
            {labels.map((label) => (
              <button
                key={label}
                className={`mb-[-1px] flex cursor-pointer items-center gap-1.5 border-b px-3.5 py-1.5 text-xs tracking-[0.02em] lowercase transition-colors ${
                  activeTab === label
                    ? "border-[#88cc88] text-[#88cc88]"
                    : "border-transparent text-[#666666] hover:text-[#d4d4d4]"
                }`}
                onClick={() => setActiveTab(label)}
                type="button"
              >
                {label.toLowerCase()}
                <span className={activeTab === label ? "text-[#3a5a3a]" : "text-[#444444]"}>
                  ({labelCounts[label] || 0})
                </span>
              </button>
            ))}
          </nav>
        )}

        <section className="mb-4 flex items-center gap-2 text-xs text-[#666666]">
          <span
            className={`font-semibold tracking-[0.02em] ${
              status === "loading"
                ? "text-[#ccaa44]"
                : status === "success"
                  ? "text-[#88cc88]"
                  : status === "error"
                    ? "text-[#cc5555]"
                    : "text-[#444444]"
            }`}
          >
            [{statusSymbol}]
          </span>
          <span>{statusText}</span>
          {lastFetchedAt && (
            <span className="ml-auto text-[11px] text-[#444444]">
              {formatRelativeTime(lastFetchedAt)}
            </span>
          )}
        </section>

        {status === "error" && (
          <section className="mb-4 border border-[#cc5555] px-3 py-2 text-xs text-[#cc5555]">
            <strong className="mb-0.5 block">!! connection failed</strong>
            <span>{error}</span>
          </section>
        )}

        <section className="flex flex-col gap-0.5">
          {status === "loading" && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {status === "success" &&
            filteredItems.map((item, index) => (
              <article
                className="border border-[#2a2a2a] bg-[#111111] px-3.5 py-3 transition-colors hover:border-[#444444]"
                key={`${item.id ?? "item"}-${index}`}
              >
                <header className="mb-1.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="mb-0.5 text-[13px] font-medium text-[#e8e8e8]">
                      {item.subject || "(no subject)"}
                    </p>
                    <p className="m-0 text-[11px] text-[#666666]">{item.sender || "(unknown)"}</p>
                  </div>
                  {item.label && (
                    <span
                      className={`border px-2 py-0.5 text-[10px] tracking-[0.03em] lowercase ${getBadgeClass(item.label)}`}
                    >
                      {item.label.toLowerCase()}
                    </span>
                  )}
                </header>
                <p className="text-xs text-[#d4d4d4]">{item.summary || "—"}</p>
              </article>
            ))}

          {status === "success" && filteredItems.length === 0 && (
            <div className="border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-4 text-center">
              <div className="text-sm text-[#444444]">---</div>
              <p className="mt-1 text-xs text-[#d4d4d4]">nothing here</p>
              <p className="mt-0.5 text-xs text-[#666666]">
                {activeTab === "all"
                  ? "no unread emails. inbox zero."
                  : `no "${activeTab}" emails. try another tab.`}
              </p>
            </div>
          )}
        </section>

        {response && (
          <details className="mt-4 border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2 text-xs">
            <summary className="cursor-pointer text-[#666666]">+ raw json</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-[#d4d4d4]">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        )}

        <div className="mt-6 overflow-hidden whitespace-nowrap text-center text-xs text-[#444444]">
          {"─".repeat(40)} eof {"─".repeat(40)}
        </div>
      </div>
    </div>
  );
}
