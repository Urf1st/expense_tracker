import sqlite3
from contextlib import contextmanager
from datetime import date
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Expense Tracker API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ─────────────────────────────────────────────────────────────────────

class Category(BaseModel):
    id: str
    name: str

class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)

class ExpenseBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: str
    amount: float = Field(gt=0)
    date: str
    note: str = ""

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = None
    amount: float | None = Field(default=None, gt=0)
    date: str | None = None
    note: str | None = None

class Expense(ExpenseBase):
    id: str

class Setting(BaseModel):
    key: str
    value: str

class SettingUpdate(BaseModel):
    value: str

# ── Database ───────────────────────────────────────────────────────────────────

DB_PATH = "./expenses.db"

_DEFAULT_CATEGORIES = ["Food", "Transport", "Home", "Health", "Other"]

def _init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id   TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS expenses (
                id       TEXT PRIMARY KEY,
                title    TEXT NOT NULL,
                category TEXT NOT NULL,
                amount   REAL NOT NULL,
                date     TEXT NOT NULL,
                note     TEXT NOT NULL DEFAULT ''
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
        """)

        if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
            for cat in _DEFAULT_CATEGORIES:
                conn.execute("INSERT INTO categories VALUES (?, ?)", (str(uuid4()), cat))

        if conn.execute("SELECT COUNT(*) FROM settings").fetchone()[0] == 0:
            conn.executemany("INSERT INTO settings VALUES (?, ?)", [
                ("currency", ""),
                ("header_text", ""),
            ])

        if conn.execute("SELECT COUNT(*) FROM expenses").fetchone()[0] == 0:
            seed = [
                (str(uuid4()), "Milk and bread",    "Food",      8.70,  "2026-06-01", "Groceries after work"),
                (str(uuid4()), "Metro card top-up", "Transport", 15.00, "2026-06-03", "Weekly commute"),
                (str(uuid4()), "Dish soap",          "Home",      4.50,  "2026-06-05", ""),
            ]
            conn.executemany("INSERT INTO expenses VALUES (?,?,?,?,?,?)", seed)

_init_db()


@contextmanager
def _db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _to_expense(row: sqlite3.Row) -> Expense:
    return Expense(
        id=row["id"], title=row["title"], category=row["category"],
        amount=row["amount"], date=row["date"], note=row["note"],
    )

def _to_category(row: sqlite3.Row) -> Category:
    return Category(id=row["id"], name=row["name"])

# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}

# ── Categories ─────────────────────────────────────────────────────────────────

@app.get("/api/categories", response_model=list[Category])
def get_categories():
    with _db() as conn:
        rows = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    return [_to_category(r) for r in rows]

@app.post("/api/categories", response_model=Category, status_code=201)
def create_category(payload: CategoryCreate):
    new_id = str(uuid4())
    try:
        with _db() as conn:
            conn.execute("INSERT INTO categories VALUES (?, ?)", (new_id, payload.name.strip()))
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Category already exists")
    return Category(id=new_id, name=payload.name.strip())

@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: str):
    with _db() as conn:
        row = conn.execute("SELECT name FROM categories WHERE id = ?", (category_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Category not found")
        in_use = conn.execute(
            "SELECT COUNT(*) FROM expenses WHERE category = ?", (row["name"],)
        ).fetchone()[0]
        if in_use:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete: {in_use} expense(s) use this category"
            )
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))

# ── Settings ───────────────────────────────────────────────────────────────────

@app.get("/api/settings", response_model=list[Setting])
def get_settings():
    with _db() as conn:
        rows = conn.execute("SELECT * FROM settings").fetchall()
    return [Setting(key=r["key"], value=r["value"]) for r in rows]

@app.put("/api/settings/{key}", response_model=Setting)
def update_setting(key: str, payload: SettingUpdate):
    with _db() as conn:
        row = conn.execute("SELECT key FROM settings WHERE key = ?", (key,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Setting not found")
        conn.execute("UPDATE settings SET value = ? WHERE key = ?", (payload.value, key))
    return Setting(key=key, value=payload.value)

# ── Expenses ───────────────────────────────────────────────────────────────────

@app.get("/api/expenses", response_model=list[Expense])
def get_expenses(
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
):
    with _db() as conn:
        rows = conn.execute("SELECT * FROM expenses ORDER BY date DESC").fetchall()

    result = [_to_expense(r) for r in rows]

    if q:
        needle = q.strip().lower()
        result = [i for i in result if needle in i.title.lower() or needle in i.note.lower()]
    if category:
        result = [i for i in result if i.category == category]
    if from_date:
        result = [i for i in result if i.date >= from_date]
    if to_date:
        result = [i for i in result if i.date <= to_date]

    return result

@app.get("/api/expenses/{expense_id}", response_model=Expense)
def get_expense(expense_id: str):
    with _db() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _to_expense(row)

@app.post("/api/expenses", response_model=Expense, status_code=201)
def create_expense(payload: ExpenseCreate):
    with _db() as conn:
        cat = conn.execute(
            "SELECT id FROM categories WHERE name = ?", (payload.category,)
        ).fetchone()
        if cat is None:
            raise HTTPException(status_code=400, detail="Category does not exist")
        new_id = str(uuid4())
        conn.execute(
            "INSERT INTO expenses VALUES (?,?,?,?,?,?)",
            (new_id, payload.title, payload.category, payload.amount, payload.date, payload.note),
        )
    return Expense(id=new_id, **payload.model_dump())

@app.put("/api/expenses/{expense_id}", response_model=Expense)
def update_expense(expense_id: str, payload: ExpenseUpdate):
    with _db() as conn:
        row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Expense not found")

        if payload.category:
            cat = conn.execute(
                "SELECT id FROM categories WHERE name = ?", (payload.category,)
            ).fetchone()
            if cat is None:
                raise HTTPException(status_code=400, detail="Category does not exist")

        updated = dict(row)
        updated.update(payload.model_dump(exclude_unset=True))

        conn.execute(
            "UPDATE expenses SET title=?, category=?, amount=?, date=?, note=? WHERE id=?",
            (updated["title"], updated["category"], updated["amount"],
             updated["date"], updated["note"], expense_id),
        )
    return Expense(**updated)

@app.delete("/api/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: str):
    with _db() as conn:
        row = conn.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))

# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get("/api/stats/summary")
def get_summary(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
):
    with _db() as conn:
        rows = conn.execute("SELECT amount, date, category FROM expenses").fetchall()

    filtered = [r for r in rows
                if (not from_date or r["date"] >= from_date)
                and (not to_date or r["date"] <= to_date)]

    total_spent = sum(r["amount"] for r in filtered)
    current_month = date.today().strftime("%Y-%m")
    month_spent = sum(r["amount"] for r in rows if r["date"].startswith(current_month))
    average_expense = total_spent / len(filtered) if filtered else 0

    by_category: dict[str, float] = {}
    for r in filtered:
        by_category[r["category"]] = by_category.get(r["category"], 0.0) + r["amount"]

    return {
        "total_spent":        round(total_spent, 2),
        "month_spent":        round(month_spent, 2),
        "average_expense":    round(average_expense, 2),
        "unique_categories":  len(set(r["category"] for r in filtered)),
        "by_category":        {k: round(v, 2) for k, v in by_category.items()},
    }

@app.get("/api/stats/by-month")
def get_by_month(
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
):
    with _db() as conn:
        rows = conn.execute(
            "SELECT amount, date FROM expenses ORDER BY date"
        ).fetchall()

    filtered = [r for r in rows
                if (not from_date or r["date"] >= from_date)
                and (not to_date or r["date"] <= to_date)]

    by_month: dict[str, float] = {}
    for r in filtered:
        month = r["date"][:7]
        by_month[month] = by_month.get(month, 0.0) + r["amount"]

    return [
        {"month": m, "total": round(t, 2)}
        for m, t in sorted(by_month.items())
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
