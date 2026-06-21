import { useEffect, useMemo, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'title' | 'category' | 'amount';
type SortDir = 'asc' | 'desc';

interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  currency: string;
}

interface Category {
  id: string;
  name: string;
}

interface AppSettings {
  currency: string;
  header_text: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function fmt(amount: number, currency: string) {
  return `${amount.toFixed(2)}${currency ? ' ' + currency : ''}`;
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-');
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  // Data
  const [expenses,   setExpenses]   = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings,   setSettings]   = useState<AppSettings>({ currency: '', header_text: '' });
  const [isLoading,  setIsLoading]  = useState(true);
  const [loadError,  setLoadError]  = useState('');

  // Filters
  const [query,          setQuery]          = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [fromDate,       setFromDate]       = useState('');
  const [toDate,         setToDate]         = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // UI
  const [isAddOpen,      setIsAddOpen]      = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportsOpen,  setIsReportsOpen]  = useState(false);

  // Add form
  const [form, setForm] = useState({
    title: '', category: '', amount: '', date: todayISO(), note: '', currency: '',
  });
  const [formError, setFormError] = useState('');

  // Settings form
  const [settingsForm,    setSettingsForm]    = useState<AppSettings>({ currency: '', header_text: '' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [settingsMsg,     setSettingsMsg]     = useState('');

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ])
      .then(([expData, catData, settingsData]) => {
        setExpenses(expData);
        setCategories(catData);
        const s: AppSettings = { currency: '', header_text: '' };
        (settingsData as Array<{ key: string; value: string }>).forEach(item => {
          if (item.key === 'currency')    s.currency    = item.value;
          if (item.key === 'header_text') s.header_text = item.value;
        });
        setSettings(s);
        setSettingsForm(s);
        if (catData.length > 0) setForm(f => ({ ...f, category: catData[0].name }));
        setIsLoading(false);
      })
      .catch(() => {
        setLoadError('Failed to load data. Is the backend running?');
        setIsLoading(false);
      });
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses
      .filter(e => {
        if (needle && !e.title.toLowerCase().includes(needle) && !e.note.toLowerCase().includes(needle)) return false;
        if (categoryFilter !== 'All' && e.category !== categoryFilter) return false;
        if (fromDate && e.date < fromDate) return false;
        if (toDate   && e.date > toDate)   return false;
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        if      (sortKey === 'amount') cmp = a.amount - b.amount;
        else if (sortKey === 'date')   cmp = a.date.localeCompare(b.date);
        else                           cmp = (a[sortKey] as string).localeCompare(b[sortKey] as string);
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [expenses, query, categoryFilter, fromDate, toDate, sortKey, sortDir]);

  const totalSpent = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
  const monthSpent = useMemo(() => {
    const month = todayISO().slice(0, 7);
    return expenses.filter(e => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0);
  }, [expenses]);
  const avgExpense = useMemo(
    () => (filtered.length ? totalSpent / filtered.length : 0),
    [filtered, totalSpent],
  );

  const byMonth = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { const m = e.date.slice(0, 7); map[m] = (map[m] || 0) + e.amount; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort(([, a], [, b]) => b - a);
  }, [filtered]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (col !== sortKey) return <span className="sort-icon">↕</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  function resolveCurrency(exp: Expense) {
    return exp.currency || settings.currency;
  }

  function clearFilters() {
    setQuery(''); setCategoryFilter('All'); setFromDate(''); setToDate('');
  }

  const hasFilters = query || categoryFilter !== 'All' || fromDate || toDate;

  async function handleDelete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) setExpenses(prev => prev.filter(e => e.id !== id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const title  = form.title.trim();
    const amount = Number(form.amount);
    if (!title)              { setFormError('Enter a title.');         return; }
    if (!amount || amount <= 0) { setFormError('Enter a valid amount.'); return; }

    const res = await fetch('/api/expenses', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, category: form.category, amount, date: form.date, note: form.note.trim(), currency: form.currency.trim() }),
    });

    if (res.ok) {
      const created: Expense = await res.json();
      setExpenses(prev => [created, ...prev]);
      setIsAddOpen(false);
      setForm({ title: '', category: categories[0]?.name ?? '', amount: '', date: todayISO(), note: '', currency: '' });
      setFormError('');
    } else {
      setFormError('Failed to save. Try again.');
    }
  }

  async function saveSettings() {
    await Promise.all([
      fetch('/api/settings/currency',    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: settingsForm.currency }) }),
      fetch('/api/settings/header_text', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: settingsForm.header_text }) }),
    ]);
    setSettings(settingsForm);
    setIsSettingsOpen(false);
    setSettingsMsg('');
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    const res = await fetch('/api/categories', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name }),
    });
    if (res.ok) {
      const created: Category = await res.json();
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName('');
      setSettingsMsg('');
    } else if (res.status === 409) {
      setSettingsMsg('Category already exists.');
    }
  }

  async function deleteCategory(id: string) {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setCategories(prev => prev.filter(c => c.id !== id));
      setSettingsMsg('');
    } else {
      const data = await res.json().catch(() => ({}));
      setSettingsMsg(data.detail ?? 'Cannot delete this category.');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-shell">
      <main className="app-card">

        {/* Header */}
        <header className="hero">
          <div className="hero-text">
            <p className="eyebrow">Expense Tracker</p>
            {settings.header_text && <h1>{settings.header_text}</h1>}
          </div>
          <div className="hero-actions">
            <button
              className="icon-btn gear-btn"
              title="Settings"
              onClick={() => { setSettingsForm(settings); setSettingsMsg(''); setIsSettingsOpen(true); }}
            >⚙</button>
            <button className="primary-btn" onClick={() => { setFormError(''); setIsAddOpen(true); }}>
              + Add expense
            </button>
          </div>
        </header>

        {/* Stats */}
        <section className="stats-grid">
          <article className="stat-card stat-1">
            <span className="stat-label">Filtered total</span>
            <strong className="stat-value">{fmt(totalSpent, settings.currency)}</strong>
          </article>
          <article className="stat-card stat-2">
            <span className="stat-label">This month</span>
            <strong className="stat-value">{fmt(monthSpent, settings.currency)}</strong>
          </article>
          <article className="stat-card stat-3">
            <span className="stat-label">Average</span>
            <strong className="stat-value">{fmt(avgExpense, settings.currency)}</strong>
          </article>
          <article className="stat-card stat-4">
            <span className="stat-label">Showing</span>
            <strong className="stat-value">{filtered.length} / {expenses.length}</strong>
          </article>
        </section>

        {/* Filters + Table */}
        <section className="panel">
          <div className="toolbar">
            <label className="field">
              <span>Search</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Title or note…" />
            </label>
            <label className="field">
              <span>Category</span>
              <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="All">All</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>From</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
            </label>
            {hasFilters && (
              <button className="text-btn" style={{ alignSelf: 'flex-end', marginBottom: '2px' }} onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          <div className="table-wrap">
            {isLoading ? (
              <p className="empty-state">Loading…</p>
            ) : loadError ? (
              <p className="empty-state error-state">{loadError}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('date')}>Date <SortIcon col="date" /></th>
                    <th className="sortable" onClick={() => handleSort('title')}>Title <SortIcon col="title" /></th>
                    <th className="sortable" onClick={() => handleSort('category')}>Category <SortIcon col="category" /></th>
                    <th>Note</th>
                    <th className="sortable align-right" onClick={() => handleSort('amount')}>Amount <SortIcon col="amount" /></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">No expenses match your filters.</td></tr>
                  ) : filtered.map(item => (
                    <tr key={item.id}>
                      <td className="date-cell">{item.date}</td>
                      <td className="strong-cell">{item.title}</td>
                      <td><span className={`badge badge-${slugify(item.category)}`}>{item.category}</span></td>
                      <td className="muted-cell">{item.note || '—'}</td>
                      <td className="align-right mono">{fmt(item.amount, resolveCurrency(item))}</td>
                      <td className="align-right">
                        <button className="text-btn danger" onClick={() => handleDelete(item.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Reports */}
        <section className="panel">
          <div className="reports-toggle" onClick={() => setIsReportsOpen(o => !o)}>
            <h3>Reports</h3>
            <span className={`chevron${isReportsOpen ? ' open' : ''}`}>›</span>
          </div>
          {isReportsOpen && (
            <div className="reports-body">
              {filtered.length === 0 ? (
                <p className="empty-state">No data for current filters.</p>
              ) : (
                <div className="reports-grid">
                  <div className="report-block">
                    <h4>By month</h4>
                    <table>
                      <thead><tr><th>Month</th><th className="align-right">Total</th></tr></thead>
                      <tbody>
                        {byMonth.map(([m, t]) => (
                          <tr key={m}>
                            <td className="date-cell">{m}</td>
                            <td className="align-right mono">{fmt(t, settings.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="report-block">
                    <h4>By category</h4>
                    <table>
                      <thead><tr><th>Category</th><th className="align-right">Total</th></tr></thead>
                      <tbody>
                        {byCategory.map(([cat, t]) => (
                          <tr key={cat}>
                            <td><span className={`badge badge-${slugify(cat)}`}>{cat}</span></td>
                            <td className="align-right mono">{fmt(t, settings.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

      </main>

      {/* ── Add expense modal ─────────────────────────────────────────────── */}
      {isAddOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add expense</h2>
              <button className="icon-btn" onClick={() => setIsAddOpen(false)}>×</button>
            </div>
            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>Title</span>
                <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Coffee" />
              </label>
              <label className="field">
                <span>Category</span>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Amount</span>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
              </label>
              <label className="field">
                <span>Currency</span>
                <input
                  value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value })}
                  placeholder={settings.currency || 'e.g. USD'}
                  maxLength={10}
                />
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </label>
              <label className="field field-full">
                <span>Note</span>
                <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Optional…" rows={3} />
              </label>
              {formError && <p className="form-error field-full">{formError}</p>}
              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={() => setIsAddOpen(false)}>Cancel</button>
                <button type="submit" className="primary-btn">Save expense</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Settings modal ────────────────────────────────────────────────── */}
      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-card modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="icon-btn" onClick={() => setIsSettingsOpen(false)}>×</button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Default currency</span>
                <input value={settingsForm.currency} onChange={e => setSettingsForm({ ...settingsForm, currency: e.target.value })} placeholder="e.g. USD, ₴, грн" maxLength={10} />
              </label>
              <label className="field">
                <span>Header text</span>
                <input value={settingsForm.header_text} onChange={e => setSettingsForm({ ...settingsForm, header_text: e.target.value })} placeholder="Leave empty to hide" />
              </label>

              <div className="field field-full">
                <span className="field-section-label">Categories</span>
                <div className="category-list">
                  {categories.map(c => (
                    <div key={c.id} className="category-item">
                      <span className={`badge badge-${slugify(c.name)}`}>{c.name}</span>
                      <button className="text-btn danger" onClick={() => deleteCategory(c.id)}>Remove</button>
                    </div>
                  ))}
                </div>
                <div className="category-add">
                  <input
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="New category name"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  />
                  <button type="button" className="secondary-btn" onClick={addCategory}>Add</button>
                </div>
              </div>

              {settingsMsg && <p className="form-error field-full">{settingsMsg}</p>}

              <div className="form-actions">
                <button className="secondary-btn" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                <button className="primary-btn" onClick={saveSettings}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
