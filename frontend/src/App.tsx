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

  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

const getBadgeClass = (label?: string) => {
  if (!label) return ''
  const n = label.toLowerCase()
  if (n.includes('work') || n.includes('job')) return 'badge-work'
  if (n.includes('personal') || n.includes('private')) return 'badge-personal'
  if (n.includes('finance') || n.includes('money') || n.includes('bill')) return 'badge-finance'
  if (n.includes('urgent') || n.includes('important')) return 'badge-urgent'
  if (n.includes('news') || n.includes('update')) return 'badge-news'
  if (n.includes('social') || n.includes('promo')) return 'badge-social'
  return ''
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

  const labels = useMemo(() => {
    const labelSet = new Set<string>()
    items.forEach(item => {
      if (item.label) labelSet.add(item.label)
    })
    return Array.from(labelSet).sort()
  }, [items])

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return items
    return items.filter(item => item.label === activeTab)
  }, [items, activeTab])

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
    if (status === 'loading') return 'fetching...'
    if (status === 'error') return 'err: request failed'
    if (status === 'success') return `${filteredItems.length}/${items.length} items`
    return 'idle'
  }, [status, filteredItems.length, items.length])

  const statusSymbol = useMemo(() => {
    if (status === 'loading') return '~'
    if (status === 'error') return 'x'
    if (status === 'success') return '*'
    return '-'
  }, [status])

  const fetchUnread = async () => {
    setStatus('loading')
    setError('')
    setActiveTab('all')
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
        <div className="title-row">
          <span className="prompt-char">&gt;</span>
          <h1>centimail</h1>
        </div>
        <p className="sub">gmail classifier / unread brief</p>
        <div className="ascii-line">{'─'.repeat(80)}</div>

        <div className="controls">
          <label htmlFor="max-results">limit:</label>
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
              {status === 'loading' ? '...' : '[ fetch ]'}
            </button>
          </div>
          <span className="hint">{API_URL}</span>
        </div>
      </header>

      {labels.length > 0 && (
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            all
            <span className="tab-count">({labelCounts.all || 0})</span>
          </button>
          {labels.map(label => (
            <button
              key={label}
              className={`tab ${activeTab === label ? 'active' : ''}`}
              onClick={() => setActiveTab(label)}
            >
              {label.toLowerCase()}
              <span className="tab-count">({labelCounts[label] || 0})</span>
            </button>
          ))}
        </nav>
      )}

      <section className="status">
        <span className={`status-indicator ${status}`}>[{statusSymbol}]</span>
        <span>{statusText}</span>
        {lastFetchedAt && <span className="time">{formatRelativeTime(lastFetchedAt)}</span>}
      </section>

      {status === 'error' && (
        <section className="error">
          <strong>!! connection failed</strong>
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
            className="card"
            key={`${item.id ?? 'item'}-${index}`}
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <header className="card-header">
              <div>
                <p className="subject">{item.subject || '(no subject)'}</p>
                <p className="sender">{item.sender || '(unknown)'}</p>
              </div>
              {item.label && (
                <span className={`badge ${getBadgeClass(item.label)}`}>{item.label.toLowerCase()}</span>
              )}
            </header>
            <p className="summary">{item.summary || '—'}</p>
          </article>
        ))}

        {status === 'success' && filteredItems.length === 0 && (
          <div className="empty">
            <div className="empty-icon">---</div>
            <p className="empty-title">nothing here</p>
            <p className="empty-sub">
              {activeTab === 'all'
                ? 'no unread emails. inbox zero.'
                : `no "${activeTab}" emails. try another tab.`}
            </p>
          </div>
        )}
      </section>

      {response && (
        <details className="raw">
          <summary>+ raw json</summary>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </details>
      )}

      <div className="footer">{'─'.repeat(40)} eof {'─'.repeat(40)}</div>
    </div>
  )
}

export default App
