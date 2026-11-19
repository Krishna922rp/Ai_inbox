import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowUpRight, BookOpen, Check, ChevronDown, CircleHelp, FileText, Globe2, Inbox, LoaderCircle, Plus, Search, Send, Sparkles, Trash2, X } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;

const fmt = (date) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
export default function App() {
  const [items, setItems] = useState([]);
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

  async function loadItems() {
    try { const res = await fetch(apiUrl('/api/items')); if (!res.ok) throw new Error('Could not load your library'); const data = await res.json(); setItems(data.items || []); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { loadItems(); }, []);
  const visible = useMemo(() => items.filter(item => (filter === 'all' || item.type === filter) && (item.title + ' ' + (item.content_preview || '')).toLowerCase().includes(search.toLowerCase())), [items, filter, search]);
  async function saveItem(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const payload = kind === 'note' ? { type: 'note', title: title.trim(), content: content.trim() } : { type: 'url', url: url.trim(), title: title.trim() };
      const res = await fetch(apiUrl('/api/ingest'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to save this source');
      setModal(false); setTitle(''); setContent(''); setUrl(''); await loadItems();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  async function askQuestion(e) {
    e.preventDefault(); if (!question.trim()) return; setAsking(true); setError(''); setAnswer(null);
    try { const res = await fetch(apiUrl('/api/query'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Unable to answer'); setAnswer(data); }
    catch (e) { setError(e.message); } finally { setAsking(false); }
  }
  async function removeItem(id) {
    if (!window.confirm('Delete this saved source?')) return;
    const res = await fetch(apiUrl('/api/items/' + id), { method: 'DELETE' }); if (res.ok) setItems(current => current.filter(item => item.id !== id));
  }
  const notes = items.filter(i => i.type === 'note').length, links = items.filter(i => i.type === 'url').length;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={19}/></div><span>recall<span className="brand-dot">.</span></span></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav-item active"><Inbox size={17}/> All knowledge <span className="nav-count">{items.length}</span></button>
      <button className="nav-item" onClick={() => setFilter('note')}><FileText size={17}/> Notes</button>
      <button className="nav-item" onClick={() => setFilter('url')}><Globe2 size={17}/> Web pages</button>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17}/></div><strong>Your second brain</strong><p>Save what matters. Find it when you need it.</p></div><div className="profile"><div className="avatar">R</div><div><strong>My workspace</strong><span>Personal library</span></div><ChevronDown size={15}/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>All knowledge</strong></div><button className="add-button" onClick={() => {setError('');setModal(true)}}><Plus size={17}/> Add to library</button></header>
      <section className="content">
        <div className="intro"><div><div className="eyebrow"><span className="eyebrow-dot"/> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>Good ideas deserve<br/><em>a place to live.</em></h1><p>One home for your notes, articles, and everything worth remembering.</p></div><div className="intro-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core"><Sparkles size={30}/></div><span className="art-chip chip-a"><FileText size={14}/></span><span className="art-chip chip-b"><Globe2 size={14}/></span><span className="art-chip chip-c"><BookOpen size={14}/></span></div></div>
        <div className="stats"><div className="stat-card"><span className="stat-icon purple"><Archive size={17}/></span><div><strong>{items.length}</strong><span>Total sources</span></div><small>In your library</small></div><div className="stat-card"><span className="stat-icon blue"><FileText size={17}/></span><div><strong>{notes}</strong><span>Notes</span></div><small>Thoughts & ideas</small></div><div className="stat-card"><span className="stat-icon amber"><Globe2 size={17}/></span><div><strong>{links}</strong><span>Web pages</span></div><small>Saved to read</small></div></div>
        <section className="ask-card"><div className="ask-heading"><div className="ask-spark"><Sparkles size={18}/></div><div><h2>Ask your knowledge</h2><p>Your library, with answers.</p></div><span className="ai-pill">AI POWERED</span></div><form className="ask-form" onSubmit={askQuestion}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask anything about what you've saved..." aria-label="Ask a question about your saved knowledge"/><button disabled={asking || !question.trim()} aria-label="Submit question">{asking ? <LoaderCircle className="spin" size={18}/> : <Send size={17}/>}</button></form>{answer && <div className="answer"><div className="answer-label"><Sparkles size={14}/> ANSWER</div><p>{answer.answer}</p>{answer.sources?.length > 0 && <div className="sources"><strong>Sources</strong>{answer.sources.map((s,i)=><div className="source" key={s.chunk_id || i}><span>{i+1}</span><div><b>{s.title}</b><small>{s.snippet}</small></div></div>)}</div>}</div>}</section>
        <div className="library-head"><div><div className="eyebrow">YOUR COLLECTION</div><h2>Recently saved</h2></div><div className="library-tools"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search your library..."/></div><div className="filters"><button className={filter==='all'?'selected':''} onClick={()=>setFilter('all')}>All</button><button className={filter==='note'?'selected':''} onClick={()=>setFilter('note')}>Notes</button><button className={filter==='url'?'selected':''} onClick={()=>setFilter('url')}>Links</button></div></div></div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
        {loading ? <div className="empty"><LoaderCircle className="spin" size={22}/> Loading your library...</div> : visible.length === 0 ? <div className="empty"><div className="empty-icon"><BookOpen size={23}/></div><strong>{items.length ? 'No matching sources' : 'Your library starts here'}</strong><p>{items.length ? 'Try another search or filter.' : 'Save a note or a web page. Your AI knowledge base will grow from here.'}</p>{!items.length && <button className="add-button" onClick={()=>setModal(true)}><Plus size={16}/> Add your first source</button>}</div> : <div className="item-grid">{visible.map(item=><article className="item-card" key={item.id}><div className="item-top"><span className={'type-icon '+item.type}>{item.type==='note'?<FileText size={16}/>:<Globe2 size={16}/>}</span><button className="icon-button" onClick={()=>removeItem(item.id)} aria-label="Delete source"><Trash2 size={15}/></button></div><h3>{item.title}</h3><p>{item.content_preview || item.url || 'Saved source'}</p><div className="item-meta"><span>{item.type==='note'?'NOTE':'WEB PAGE'}</span><time>{fmt(item.created_at)}</time></div></article>)}</div>}
        <footer>Made for the things you don't want to forget. <span>Recall © {new Date().getFullYear()}</span></footer>
      </section>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><form className="modal" onSubmit={saveItem}><div className="modal-head"><div><span className="eyebrow">GROW YOUR LIBRARY</span><h2>Add a source</h2></div><button type="button" className="icon-button" onClick={()=>setModal(false)}><X size={18}/></button></div><div className="tabs"><button type="button" className={kind==='note'?'chosen':''} onClick={()=>setKind('note')}><FileText size={15}/> Note</button><button type="button" className={kind==='url'?'chosen':''} onClick={()=>setKind('url')}><Globe2 size={15}/> Web page</button></div>{kind==='note'?<><label>Title<input required maxLength="160" value={title} onChange={e=>setTitle(e.target.value)} placeholder="A thought worth keeping"/></label><label>Your note<textarea required rows="6" value={content} onChange={e=>setContent(e.target.value)} placeholder="Write or paste your notes here..."/></label></>:<><label>Web address<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/article"/></label><label>Title <span className="optional">(optional)</span><input maxLength="160" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Give this page a name"/></label></>}{error && <div className="error-banner">{error}</div>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={()=>setModal(false)}>Cancel</button><button className="add-button" disabled={saving}>{saving?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>} Save source</button></div></form></div>}
  </div>;
}