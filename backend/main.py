import sqlite3
from contextlib import contextmanager
from datetime import date
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

Category = Literal["Food", "Transport", "Home", "Health", "Other"]

app = FastAPI(title="Expense Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────────

class ExpenseBase(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: Category
    amount: float = Field(gt=0)
    date: str
    note: str = ""


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: Category | None = None
    amount: float | None = Field(default=None, gt=0)
    date: str | None = None
    note: str | None = None


class Expense(ExpenseBase):
    id: str


# ── Database ───────────────────────────────────────────────────────────────────

DB_PATH = "./expenses.db"

_SEED: list[tuple] = [
    ("1", "Milk and bread",     "Food",      8.70,  "2026-06-01", "Groceries after work"),
    ("2", "Metro card top-up",  "Transport", 15.00, "2026-06-03", "Weekly commute"),
    ("3", "Dish soap",          "Home",       4.50, "2026-06-05", ""),
]


def _init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id       TEXT PRIMARY KEY,
                title    TEXT NOT NULL,
                category TEXT NOT NULL,
                amount   REAL NOT NULL,
                date     TEXT NOT NULL,
                note     TEXT NOT NULL DEFAULT ''
            )
            """
        )
        if conn.execute("SELECT COUNT(*) FROM expenses").fetchone()[0] == 0:
            conn.executemany("INSERT INTO expenses VALUES (?,?,?,?,?,?)", _SEED)


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


def _row_to_expense(row: sqlite3.Row) -> Expense:
    return Expense(
        id=row["id"],
        title=row["title"],
        category=row["category"],
        amount=row["amount"],
        date=row["date"],
        note=row["note"],
    )


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/expenses", response_model=list[Expense])
def get_expenses(
    q: str | None = Query(default=None),
    category: Category | None = Query(default=None),
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
):
    with _db() as conn:
        rows = conn.execute(
            "SELECT * FROM expenses ORDER BY date DESC"
        ).fetchall()

    result = [_row_to_expense(r) for r in rows]

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
        row = conn.execute(
            "SELECT * FROM expenses WHERE id = ?", (expense_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _row_to_expense(row)


@app.post("/api/expenses", response_model=Expense, status_code=201)
def create_expense(payload: ExpenseCreate):
    new_id = str(uuid4())
    with _db() as conn:
        conn.execute(
            "INSERT INTO expenses VALUES (?,?,?,?,?,?)",
            (new_id, payload.title, payload.category, payload.amount, payload.date, payload.note),
        )
    return Expense(id=new_id, **payload.model_dump())


@app.put("/api/expenses/{expense_id}", response_model=Expense)
def update_expense(expense_id: str, payload: ExpenseUpdate):
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM expenses WHERE id = ?", (expense_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Expense not found")

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
        row = conn.execute(
            "SELECT id FROM expenses WHERE id = ?", (expense_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))


@app.get("/api/stats/summary")
def get_summary():
    with _db() as conn:
        rows = conn.execute(
            "SELECT amount, date, category FROM expenses"
        ).fetchall()

    total_spent = sum(r["amount"] for r in rows)
    current_month = date.today().strftime("%Y-%m")
    month_spent = sum(r["amount"] for r in rows if r["date"].startswith(current_month))
    average_expense = total_spent / len(rows) if rows else 0
    unique_categories = len({r["category"] for r in rows})

    by_category: dict[str, float] = {cat: 0.0 for cat in ["Food", "Transport", "Home", "Health", "Other"]}
    for r in rows:
        by_category[r["category"]] += r["amount"]

    return {
        "total_spent": total_spent,
        "month_spent": month_spent,
        "average_expense": average_expense,
        "unique_categories": unique_categories,
        "by_category": by_category,
    }
