import { useEffect, useMemo, useState } from 'react'
import './App.css'

type ApiItem = {
  id?: string
  label?: string
  summary?: string
  subject?: string
  sender?: string
}

type LegacyApiItem = {
  id?: string
  message_id?: string
  email_id?: string
  label?: string
  classificazione?: string
  classification?: string
  category?: string
  summary?: string
  riassunto?: string
  sommario?: string
  description?: string
  subject?: string
  oggetto?: string
  sender?: string
  mittente?: string
  from?: string
}

type ApiResponse = {
  items?: ApiItem[]
  emails?: LegacyApiItem[]
  results?: LegacyApiItem[]
  error?: string
  details?: unknown
  raw_content?: string
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const asString = (value: unknown) => (typeof value === 'string' ? value : '')

const normalizeItem = (item: LegacyApiItem): ApiItem => ({
  id: asString(item.id ?? item.message_id ?? item.email_id),
  label: asString(item.label ?? item.classificazione ?? item.classification ?? item.category),
  summary: asString(item.summary ?? item.riassunto ?? item.sommario ?? item.description),
  subject: asString(item.subject ?? item.oggetto),
  sender: asString(item.sender ?? item.mittente ?? item.from),
})

const normalizeResponse = (payload: ApiResponse): ApiResponse => {
  const directItems = Array.isArray(payload.items)
    ? payload.items.map(item => normalizeItem(item as LegacyApiItem))
    : []

  if (directItems.length > 0 || payload.items) {
    return { ...payload, items: directItems }
  }

  const listCandidate = Array.isArray(payload.emails)
    ? payload.emails
    : Array.isArray(payload.results)
      ? payload.results
      : []

  return {
    ...payload,
    items: listCandidate.map(item => normalizeItem(item)),
  }
}

const formatRelativeTime = (date: Date) => {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} min ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

const getLabelColorClass = (label?: string) => {
  if (!label) return ''
  const normalized = label.toLowerCase()
  if (normalized.includes('work') || normalized.includes('job')) return 'label-work'
  if (normalized.includes('personal') || normalized.includes('private')) return 'label-personal'
  if (normalized.includes('finance') || normalized.includes('money') || normalized.includes('bill')) return 'label-finance'
  if (normalized.includes('urgent') || normalized.includes('important')) return 'label-urgent'
  if (normalized.includes('news') || normalized.includes('update')) return 'label-news'
  if (normalized.includes('social') || normalized.includes('promo')) return 'label-social'
  return 'label-default'
}

function SkeletonCard() {
  return (
    <div className="card skeleton">
      <div className="skeleton-header">
        <div className="skeleton-text skeleton-title" />
        <div className="skeleton-badge" />
      </div>
      <div className="skeleton-text skeleton-line" />
      <div className="skeleton-text skeleton-line short" />
    </div>
  )
}

function App() {
  const [maxResults, setMaxResults] = useState(5)
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [error, setError] = useState('')
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<string>('all')

  const items = response?.items ?? []

  // Extract unique labels from items
  const labels = useMemo(() => {
    const labelSet = new Set<string>()
    items.forEach(item => {
      if (item.label) labelSet.add(item.label)
    })
    return Array.from(labelSet).sort()
  }, [items])

  // Filter items by active tab
  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return items
    return items.filter(item => item.label === activeTab)
  }, [items, activeTab])

  // Count items per label
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length }
    items.forEach(item => {
      if (item.label) {
        counts[item.label] = (counts[item.label] || 0) + 1
      }
    })
    return counts
  }, [items])

  const statusText = useMemo(() => {
    if (status === 'loading') return 'Fetching unread mail…'
    if (status === 'error') return 'Request failed'
    if (status === 'success') return `${filteredItems.length} of ${items.length} items`
    return 'Ready'
  }, [status, filteredItems.length, items.length])

  const fetchUnread = async () => {
    setStatus('loading')
    setError('')
    setActiveTab('all') // Reset to all when refreshing
    try {
      const res = await fetch(`${API_URL}/api/classify/unread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_results: maxResults }),
      })

      const json = (await res.json()) as ApiResponse | { detail?: string }
      if (!res.ok) {
        const detail = 'detail' in json ? json.detail : undefined
        throw new Error(detail || `Request failed (${res.status})`)
      }

      setResponse(normalizeResponse(json as ApiResponse))
      setLastFetchedAt(new Date())
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  useEffect(() => {
    void fetchUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Gmail Classifier</p>
          <h1>Today's Brief</h1>
          <p className="sub">Minimal view of the API response.</p>
        </div>
        <div className="controls">
          <label htmlFor="max-results">Max results</label>
          <div className="control-row">
            <input
              id="max-results"
              type="number"
              min={1}
              value={maxResults}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                setMaxResults(Number.isNaN(nextValue) || nextValue < 1 ? 1 : nextValue)
              }}
            />
            <button type="button" onClick={fetchUnread} disabled={status === 'loading'}>
              {status === 'loading' ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <p className="hint">API: {API_URL}</p>
        </div>
      </header>

      {labels.length > 0 && (
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
            <span className="tab-count">{labelCounts.all || 0}</span>
          </button>
          {labels.map(label => (
            <button
              key={label}
              className={`tab ${activeTab === label ? 'active' : ''} ${getLabelColorClass(label)}`}
              onClick={() => setActiveTab(label)}
            >
              {label}
              <span className="tab-count">{labelCounts[label] || 0}</span>
            </button>
          ))}
        </nav>
      )}

      <section className="status">
        <span className={`dot ${status}`} aria-hidden="true" />
        <span>{statusText}</span>
        {lastFetchedAt && <span className="time">{formatRelativeTime(lastFetchedAt)}</span>}
      </section>

      {status === 'error' && (
        <section className="error">
          <strong>Could not reach the API.</strong>
          <span>{error}</span>
        </section>
      )}

      <section className="list">
        {status === 'loading' && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {status === 'success' && filteredItems.map((item, index) => (
          <article
            className={`card ${getLabelColorClass(item.label)}`}
            key={`${item.id ?? 'item'}-${index}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <header className="card-header">
              <div>
                <p className="subject">{item.subject || 'Untitled message'}</p>
                <p className="sender">{item.sender || 'Unknown sender'}</p>
                <p className="meta">{item.id || 'No id'}</p>
              </div>
              {item.label && <span className="badge">{item.label}</span>}
            </header>
            <p className="summary">{item.summary || 'No summary returned.'}</p>
          </article>
        ))}

        {status === 'success' && filteredItems.length === 0 && (
          <div className="empty">
            <div className="empty-icon">✨</div>
            <p className="empty-title">All caught up!</p>
            <p className="empty-sub">
              {activeTab === 'all' 
                ? 'No unread emails found. Check back later or increase the limit.'
                : `No ${activeTab} emails found. Try a different tab.`}
            </p>
          </div>
        )}
      </section>

      {response && (
        <details className="raw">
          <summary>Raw JSON</summary>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </details>
      )}
    </div>
  )
}

export default App
