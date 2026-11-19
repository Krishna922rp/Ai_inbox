import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, BookOpen, ChevronDown, CircleHelp, FileText, Globe2, Inbox,
  LoaderCircle, Plus, Search, Send, Sparkles, Trash2, X
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiUrl = (path) => API_BASE + path;

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function ErrorBanner({ children, onDismiss }) {
  if (!children) return null;
  return (
    <div className="error-banner" role="alert">
      <span>{children}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss error">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ total: 0, notes: 0, links: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [kind, setKind] = useState('note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [modalError, setModalError] = useState('');

  const modalRef = useRef(null);
  const firstFieldRef = useRef(null);
  const addButtonRef = useRef(null);

  const refreshItems = useCallback(async (query = search, signal) => {
    setLoading(true);
    try {
      const response = await fetch(
        apiUrl('/api/items?q=' + encodeURIComponent(query.trim())),
        { signal }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load your library.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setCounts(data.counts || { total: data.items?.length || 0, notes: 0, links: 0 });
      setError('');
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || 'Could not load your library.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => refreshItems(search, controller.signal),
      search.trim() ? 250 : 0
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refreshItems, search]);

  useEffect(() => {
    if (!modal) return undefined;

    const previouslyFocused = document.activeElement;
    firstFieldRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setModal(false);
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;

      const focusable = modalRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [modal]);

  const visible = useMemo(
    () => items.filter((item) => filter === 'all' || item.type === filter),
    [items, filter]
  );
  const notes = counts.notes;
  const links = counts.links;

  function openModal() {
    setError('');
    setModalError('');
    setModal(true);
  }

  function closeModal() {
    if (saving) return;
    setModal(false);
    setModalError('');
  }

  async function saveItem(event) {
    event.preventDefault();
    setSaving(true);
    setModalError('');

    try {
      const payload = kind === 'note'
        ? { type: 'note', title: title.trim(), content: content.trim() }
        : { type: 'url', url: url.trim(), title: title.trim() };
      const response = await fetch(apiUrl('/api/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save this source.');

      setModal(false);
      setTitle('');
      setContent('');
      setUrl('');
      setSearch('');
      await refreshItems('');
    } catch (err) {
      setModalError(err.message || 'Unable to save this source.');
    } finally {
      setSaving(false);
    }
  }

  async function askQuestion(event) {
    event.preventDefault();
    if (!question.trim()) return;

    setAsking(true);
    setError('');
    setAnswer(null);
    try {
      const response = await fetch(apiUrl('/api/query'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to answer this question.');
      setAnswer(data);
    } catch (err) {
      setError(err.message || 'Unable to answer this question.');
    } finally {
      setAsking(false);
    }
  }

  async function removeItem(id) {
    if (!window.confirm('Delete this saved source? This cannot be undone.')) return;
    setError('');
    try {
      const response = await fetch(apiUrl('/api/items/' + id), { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Could not delete this source.');
      }
      const removed = items.find((item) => item.id === id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (removed) {
        setCounts((current) => ({
          total: Math.max(0, current.total - 1),
          notes: Math.max(0, current.notes - (removed.type === 'note' ? 1 : 0)),
          links: Math.max(0, current.links - (removed.type === 'url' ? 1 : 0))
        }));
      }
    } catch (err) {
      setError(err.message || 'Could not delete this source.');
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <span>recall<span className="brand-dot">.</span></span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button
          type="button"
          className={'nav-item ' + (filter === 'all' ? 'active' : '')}
          onClick={() => setFilter('all')}
          aria-current={filter === 'all' ? 'page' : undefined}
        >
          <Inbox size={17} /> All knowledge <span className="nav-count">{counts.total}</span>
        </button>
        <button
          type="button"
          className={'nav-item ' + (filter === 'note' ? 'active' : '')}
          onClick={() => setFilter('note')}
          aria-pressed={filter === 'note'}
        >
          <FileText size={17} /> Notes
        </button>
        <button
          type="button"
          className={'nav-item ' + (filter === 'url' ? 'active' : '')}
          onClick={() => setFilter('url')}
          aria-pressed={filter === 'url'}
        >
          <Globe2 size={17} /> Web pages
        </button>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><CircleHelp size={17} /></div>
            <strong>Your second brain</strong>
            <p>Save what matters. Find it when you need it.</p>
          </div>
          <div className="profile">
            <div className="avatar">R</div>
            <div><strong>My workspace</strong><span>Personal library</span></div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">Workspace <span>/</span> <strong>All knowledge</strong></div>
          <button ref={addButtonRef} type="button" className="add-button" onClick={openModal}>
            <Plus size={17} /> Add to library
          </button>
        </header>

        <section className="content">
          <div className="intro">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PERSONAL KNOWLEDGE SPACE</div>
              <h1>Good ideas deserve<br /><em>a place to live.</em></h1>
              <p>One home for your notes, articles, and everything worth remembering.</p>
            </div>
            <div className="intro-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="art-core"><Sparkles size={30} /></div>
              <span className="art-chip chip-a"><FileText size={14} /></span>
              <span className="art-chip chip-b"><Globe2 size={14} /></span>
              <span className="art-chip chip-c"><BookOpen size={14} /></span>
            </div>
          </div>

          <div className="stats" aria-label="Library summary">
            <div className="stat-card">
              <span className="stat-icon purple"><Archive size={17} /></span>
              <div><strong>{counts.total}</strong><span>Total sources</span></div>
              <small>In your library</small>
            </div>
            <div className="stat-card">
              <span className="stat-icon blue"><FileText size={17} /></span>
              <div><strong>{notes}</strong><span>Notes</span></div>
              <small>Thoughts &amp; ideas</small>
            </div>
            <div className="stat-card">
              <span className="stat-icon amber"><Globe2 size={17} /></span>
              <div><strong>{links}</strong><span>Web pages</span></div>
              <small>Saved to read</small>
            </div>
          </div>

          <section className="ask-card" aria-labelledby="ask-heading">
            <div className="ask-heading">
              <div className="ask-spark"><Sparkles size={18} /></div>
              <div><h2 id="ask-heading">Ask your knowledge</h2><p>Your library, with answers.</p></div>
              <span className="ai-pill">AI POWERED</span>
            </div>
            <form className="ask-form" onSubmit={askQuestion}>
              <label className="sr-only" htmlFor="knowledge-question">Ask a question about your saved knowledge</label>
              <input
                id="knowledge-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask anything about what you've saved..."
              />
              <button type="submit" disabled={asking || !question.trim()} aria-label="Submit question">
                {asking ? <LoaderCircle className="spin" size={18} /> : <Send size={17} />}
              </button>
            </form>
            {answer && (
              <div className="answer" aria-live="polite">
                <div className="answer-label"><Sparkles size={14} /> ANSWER</div>
                <p>{answer.answer}</p>
                {answer.sources?.length > 0 && (
                  <div className="sources">
                    <strong>Sources</strong>
                    {answer.sources.map((source, index) => (
                      <div className="source" key={source.chunk_id || index}>
                        <span>{index + 1}</span>
                        <div><b>{source.title}</b><small>{source.snippet}</small></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="library-head">
            <div><div className="eyebrow">YOUR COLLECTION</div><h2>Recently saved</h2></div>
            <div className="library-tools">
              <div className="search-box">
                <Search size={16} aria-hidden="true" />
                <label className="sr-only" htmlFor="library-search">Search all saved content</label>
                <input
                  id="library-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search all saved content..."
                />
              </div>
              <div className="filters" aria-label="Filter saved items">
                <button type="button" className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')} aria-pressed={filter === 'all'}>All</button>
                <button type="button" className={filter === 'note' ? 'selected' : ''} onClick={() => setFilter('note')} aria-pressed={filter === 'note'}>Notes</button>
                <button type="button" className={filter === 'url' ? 'selected' : ''} onClick={() => setFilter('url')} aria-pressed={filter === 'url'}>Links</button>
              </div>
            </div>
          </div>

          <ErrorBanner onDismiss={() => setError('')}>{error}</ErrorBanner>
          {loading ? (
            <div className="empty" role="status"><LoaderCircle className="spin" size={22} /> Loading your library...</div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><BookOpen size={23} /></div>
              <strong>{search ? 'No matching sources' : 'Your library starts here'}</strong>
              <p>{search ? 'Try a different search term or filter.' : 'Save a note or a web page. Your knowledge base will grow from here.'}</p>
              {!search && <button type="button" className="add-button" onClick={openModal}><Plus size={16} /> Add your first source</button>}
            </div>
          ) : (
            <div className="item-grid">
              {visible.map((item) => (
                <article className="item-card" key={item.id}>
                  <div className="item-top">
                    <span className={'type-icon ' + item.type} aria-label={item.type === 'note' ? 'Note' : 'Web page'}>
                      {item.type === 'note' ? <FileText size={16} /> : <Globe2 size={16} />}
                    </span>
                    <button type="button" className="icon-button" onClick={() => removeItem(item.id)} aria-label={'Delete ' + item.title}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <h3>
                    {item.url
                      ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a>
                      : item.title}
                  </h3>
                  <p>{item.content_preview || item.url || 'Saved source'}</p>
                  <div className="item-meta">
                    <span>{item.type === 'note' ? 'NOTE' : 'WEB PAGE'}</span>
                    <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                  </div>
                </article>
              ))}
            </div>
          )}
          <footer>Made for the things you don't want to forget. <span>Recall © {new Date().getFullYear()}</span></footer>
        </section>
      </main>

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <form
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-source-title"
            onSubmit={saveItem}
          >
            <div className="modal-head">
              <div><span className="eyebrow">GROW YOUR LIBRARY</span><h2 id="add-source-title">Add a source</h2></div>
              <button type="button" className="icon-button" onClick={closeModal} aria-label="Close add source dialog"><X size={18} /></button>
            </div>
            <div className="tabs" role="group" aria-label="Source type">
              <button type="button" className={kind === 'note' ? 'chosen' : ''} onClick={() => setKind('note')} aria-pressed={kind === 'note'}><FileText size={15} /> Note</button>
              <button type="button" className={kind === 'url' ? 'chosen' : ''} onClick={() => setKind('url')} aria-pressed={kind === 'url'}><Globe2 size={15} /> Web page</button>
            </div>
            {kind === 'note' ? (
              <>
                <label>Title
                  <input ref={firstFieldRef} required maxLength="160" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A thought worth keeping" />
                </label>
                <label>Your note
                  <textarea required rows="6" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write or paste your notes here..." />
                </label>
              </>
            ) : (
              <>
                <label>Web address
                  <input ref={firstFieldRef} required type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" />
                </label>
                <label>Title <span className="optional">(optional)</span>
                  <input maxLength="160" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Give this page a name" />
                </label>
              </>
            )}
            <ErrorBanner>{modalError}</ErrorBanner>
            <div className="modal-actions">
              <button type="button" className="cancel-button" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="submit" className="add-button" disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
                {saving ? 'Saving...' : 'Save source'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
