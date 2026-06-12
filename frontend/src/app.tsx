import { useEffect, useMemo, useState } from 'react';

type Category = 'Food' | 'Transport' | 'Home' | 'Health' | 'Other';

interface Expense {
  id: string;
  title: string;
  category: Category;
  amount: number;
  date: string;
  note: string;
}

const categories: Category[] = ['Food', 'Transport', 'Home', 'Health', 'Other'];
const currency = 'USD';

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function App() {
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [loadError, setLoadError]   = useState('');
  const [query, setQuery]           = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | Category>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError]   = useState('');

  const [form, setForm] = useState({
    title:    '',
    category: 'Food' as Category,
    amount:   '',
    date:     todayISO(),
    note:     '',
  });

  // ── Fetch on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/expenses')
      .then((r) => {
        if (!r.ok) throw new Error(`Server error: ${r.status}`);
        return r.json() as Promise<Expense[]>;
      })
      .then((data) => {
        setExpenses(data);
        setIsLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message || 'Failed to load expenses.');
        setIsLoading(false);
      });
  }, []);

  // ── Filters ───────────────────────────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return expenses
      .filter((item) => {
        const matchesQuery =
          !needle ||
          item.title.toLowerCase().includes(needle) ||
          item.note.toLowerCase().includes(needle);
        const matchesCategory =
          categoryFilter === 'All' || item.category === categoryFilter;
        return matchesQuery && matchesCategory;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [expenses, query, categoryFilter]);

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const totalSpent = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses],
  );

  const currentMonthSpent = useMemo(() => {
    const month = todayISO().slice(0, 7);
    return expenses
      .filter((item) => item.date.startsWith(month))
      .reduce((sum, item) => sum + item.amount, 0);
  }, [expenses]);

  const averageExpense = useMemo(
    () => (expenses.length ? totalSpent / expenses.length : 0),
    [expenses, totalSpent],
  );

  const uniqueCategories = useMemo(
    () => new Set(expenses.map((item) => item.category)).size,
    [expenses],
  );

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openModal() {
    setFormError('');
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setFormError('');
    setForm({ title: '', category: 'Food', amount: '', date: todayISO(), note: '' });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setExpenses((prev) => prev.filter((item) => item.id !== id));
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title  = form.title.trim();
    const note   = form.note.trim();
    const amount = Number(form.amount);

    if (!title) {
      setFormError('Please enter an expense name.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount must be a positive number.');
      return;
    }

    const res = await fetch('/api/expenses', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, category: form.category, amount, date: form.date, note }),
    });

    if (res.ok) {
      const created: Expense = await res.json();
      setExpenses((prev) => [created, ...prev]);
      closeModal();
    } else {
      setFormError('Failed to save expense. Please try again.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <main className="app-card">
        <header className="hero">
          <div>
            <p className="eyebrow">Expense tracker</p>
            <h1>Track what you spend.</h1>
            <p className="hero-text">
              A clean single-page app for tracking expenses with filters,
              summary cards, and a modal form for adding new entries.
            </p>
          </div>
          <button className="primary-btn" onClick={openModal}>
            + Add expense
          </button>
        </header>

        <section className="stats-grid">
          <article className="stat-card">
            <span className="stat-label">Total spent</span>
            <strong className="stat-value">{formatMoney(totalSpent)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">This month</span>
            <strong className="stat-value">{formatMoney(currentMonthSpent)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Average expense</span>
            <strong className="stat-value">{formatMoney(averageExpense)}</strong>
          </article>
          <article className="stat-card">
            <span className="stat-label">Categories</span>
            <strong className="stat-value">{uniqueCategories}</strong>
          </article>
        </section>

        <section className="panel">
          <div className="toolbar">
            <label className="field">
              <span>Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or note..."
              />
            </label>
            <label className="field">
              <span>Category</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'All' | Category)}
              >
                <option value="All">All</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            {isLoading ? (
              <p className="empty-state">Loading expenses…</p>
            ) : loadError ? (
              <p className="empty-state error-state">{loadError}</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Note</th>
                    <th className="align-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty-state">
                        No expenses match your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map((item) => (
                      <tr key={item.id}>
                        <td>{item.date}</td>
                        <td className="strong-cell">{item.title}</td>
                        <td><span className="badge">{item.category}</span></td>
                        <td className="muted-cell">{item.note || '—'}</td>
                        <td className="align-right">{formatMoney(item.amount)}</td>
                        <td className="align-right">
                          <button
                            className="text-btn danger"
                            onClick={() => handleDelete(item.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {isModalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add expense</h2>
              <button className="icon-btn" onClick={closeModal} aria-label="Close">×</button>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              <label className="field">
                <span>Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Coffee"
                  autoFocus
                />
              </label>

              <label className="field">
                <span>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Amount</span>
                <input
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </label>

              <label className="field">
                <span>Date</span>
                <input
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  type="date"
                />
              </label>

              <label className="field field-full">
                <span>Note</span>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Optional note…"
                  rows={3}
                />
              </label>

              {formError && <p className="form-error">{formError}</p>}

              <div className="form-actions">
                <button type="button" className="secondary-btn" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Save expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
