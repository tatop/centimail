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
  if (!label) return "text-[var(--badge-none-text)] border-[var(--badge-none-border)]";
  const n = label.toLowerCase();
  if (n.includes("work") || n.includes("job"))
    return "text-[var(--badge-work-text)] border-[var(--badge-work-border)]";
  if (n.includes("personal") || n.includes("private"))
    return "text-[var(--badge-personal-text)] border-[var(--badge-personal-border)]";
  if (n.includes("finance") || n.includes("money") || n.includes("bill"))
    return "text-[var(--badge-finance-text)] border-[var(--badge-finance-border)]";
  if (n.includes("urgent") || n.includes("important"))
    return "text-[var(--badge-urgent-text)] border-[var(--badge-urgent-border)]";
  if (n.includes("news") || n.includes("update"))
    return "text-[var(--badge-news-text)] border-[var(--badge-news-border)]";
  if (n.includes("social") || n.includes("promo"))
    return "text-[var(--badge-social-text)] border-[var(--badge-social-border)]";
  return "text-[var(--badge-default-text)] border-[var(--badge-default-border)]";
};

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (!mounted) return <div className="h-7 w-14" />;

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-7 items-center gap-1.5 border border-[var(--border)] px-2 text-[11px] tracking-wide text-[var(--text-muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--text-secondary)]"
      aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
    >
      {dark ? "☀" : "☾"}
      <span className="hidden sm:inline">{dark ? "light" : "dark"}</span>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-none border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 sm:px-3.5 sm:py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="h-4 w-44 animate-pulse bg-[var(--skeleton)]" />
        <div className="h-5 w-16 animate-pulse border border-[var(--border)] bg-[var(--bg-secondary)]" />
      </div>
      <div className="mb-1 h-3 w-full animate-pulse bg-[var(--skeleton)]" />
      <div className="h-3 w-2/3 animate-pulse bg-[var(--skeleton)]" />
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
    <div className="min-h-screen bg-[var(--bg-primary)] px-4 pb-16 pt-6 text-[13px] leading-relaxed text-[var(--text-secondary)] sm:px-6 sm:pb-24 sm:pt-8">
      <div className="mx-auto w-full max-w-[760px] font-mono">
        <header className="mb-5 overflow-hidden border border-[var(--header-border)] bg-[var(--header-bg)] sm:mb-6">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--header-border)] bg-[var(--accent-subtle)] px-3.5 py-2.5 sm:px-4 sm:py-3">
            <div>
              <h1 className="m-0 text-sm font-semibold leading-tight tracking-[0.02em] lowercase text-[var(--text-primary)]">
                centimail
              </h1>
              <p className="m-0 text-[10px] leading-tight text-[var(--text-muted)]">gmail classifier</p>
            </div>
            <div className="flex items-center gap-2">
              {lastFetchedAt && (
                <span className="hidden text-[10px] text-[var(--text-dimmed)] sm:inline">
                  {formatRelativeTime(lastFetchedAt)}
                </span>
              )}
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-col gap-2 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
            <div className="flex items-center gap-2">
              <label htmlFor="max-results" className="text-[11px] uppercase tracking-widest text-[var(--text-dimmed)]">
                fetch
              </label>
              <input
                id="max-results"
                type="number"
                min={1}
                value={maxResults}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setMaxResults(Number.isNaN(nextValue) || nextValue < 1 ? 1 : nextValue);
                }}
                className="w-11 border border-[var(--border)] bg-[var(--input-bg)] px-1 py-0.5 text-center text-[12px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
              />
              <span className="text-[11px] text-[var(--text-dimmed)]">unread</span>
            </div>
            <button
              type="button"
              onClick={() => void fetchUnread(maxResults)}
              disabled={status === "loading"}
              className="cursor-pointer bg-[var(--accent)] px-4 py-1 text-[11px] font-medium uppercase tracking-widest text-[var(--bg-primary)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:opacity-80 sm:ml-auto"
            >
              {status === "loading" ? "···" : "run"}
            </button>
          </div>
        </header>

        {labels.length > 0 && (
          <nav className="mb-3 flex gap-0 overflow-x-auto border-b border-[var(--border)] sm:mb-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <button
              className={`mb-[-1px] flex shrink-0 cursor-pointer items-center gap-1.5 border-b px-3 py-1.5 text-xs tracking-[0.02em] lowercase transition-colors sm:px-3.5 ${
                activeTab === "all"
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
              onClick={() => setActiveTab("all")}
              type="button"
            >
              all
              <span className={activeTab === "all" ? "text-[var(--accent-dim)]" : "text-[var(--text-dimmed)]"}>
                ({labelCounts.all || 0})
              </span>
            </button>
            {labels.map((label) => (
              <button
                key={label}
                className={`mb-[-1px] flex shrink-0 cursor-pointer items-center gap-1.5 border-b px-3 py-1.5 text-xs tracking-[0.02em] lowercase transition-colors sm:px-3.5 ${
                  activeTab === label
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
                onClick={() => setActiveTab(label)}
                type="button"
              >
                {label.toLowerCase()}
                <span className={activeTab === label ? "text-[var(--accent-dim)]" : "text-[var(--text-dimmed)]"}>
                  ({labelCounts[label] || 0})
                </span>
              </button>
            ))}
          </nav>
        )}

        <section className="mb-3 flex items-center gap-2 text-xs text-[var(--text-muted)] sm:mb-4">
          <span
            className={`font-semibold tracking-[0.02em] ${
              status === "loading"
                ? "text-[var(--status-loading)]"
                : status === "success"
                  ? "text-[var(--accent)]"
                  : status === "error"
                    ? "text-[var(--status-error)]"
                    : "text-[var(--text-dimmed)]"
            }`}
          >
            [{statusSymbol}]
          </span>
          <span>{statusText}</span>
        </section>

        {status === "error" && (
          <section className="mb-3 border border-[var(--status-error)] px-3 py-2 text-xs text-[var(--status-error)] sm:mb-4">
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
                className="border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 transition-colors hover:border-[var(--border-hover)] sm:px-3.5 sm:py-3"
                key={`${item.id ?? "item"}-${index}`}
              >
                <header className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {item.subject || "(no subject)"}
                    </p>
                    <p className="m-0 truncate text-[11px] text-[var(--text-muted)]">{item.sender || "(unknown)"}</p>
                  </div>
                  {item.label && (
                    <span
                      className={`self-start border px-2 py-0.5 text-[10px] tracking-[0.03em] lowercase sm:shrink-0 ${getBadgeClass(item.label)}`}
                    >
                      {item.label.toLowerCase()}
                    </span>
                  )}
                </header>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.summary || "—"}</p>
              </article>
            ))}

          {status === "success" && filteredItems.length === 0 && (
            <div className="border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-4 text-center">
              <div className="text-sm text-[var(--text-dimmed)]">---</div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">nothing here</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {activeTab === "all"
                  ? "no unread emails. inbox zero."
                  : `no "${activeTab}" emails. try another tab.`}
              </p>
            </div>
          )}
        </section>

        {response && (
          <details className="mt-3 border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs sm:mt-4">
            <summary className="cursor-pointer text-[var(--text-muted)]">+ raw json</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-[var(--text-secondary)]">
              {JSON.stringify(response, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
