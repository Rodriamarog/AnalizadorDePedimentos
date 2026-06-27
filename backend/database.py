from pathlib import Path
from sqlmodel import SQLModel, Session, create_engine

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "db.sqlite"
DB_PATH.parent.mkdir(exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def _setup_fts(conn) -> None:
    conn.execute("CREATE TABLE IF NOT EXISTS _fts_initialized (name TEXT PRIMARY KEY)")
    for base, fts in [("sat_claves", "sat_claves_fts"), ("sat_unidades", "sat_unidades_fts")]:
        conn.execute(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS {fts}
            USING fts5(key UNINDEXED, description, content='{base}', content_rowid='rowid')
        """)
        row = conn.execute(
            "SELECT 1 FROM _fts_initialized WHERE name=?", (fts,)
        ).fetchone()
        if not row:
            conn.execute(f"INSERT INTO {fts}({fts}) VALUES('rebuild')")
            conn.execute("INSERT INTO _fts_initialized(name) VALUES(?)", (fts,))
    conn.commit()


def _migrate(conn) -> None:
    """Add new columns to existing tables without losing data."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(pedimento)").fetchall()}
    for col, ddl in [("dta", "INTEGER"), ("igi", "INTEGER"), ("prv", "INTEGER")]:
        if col not in existing:
            conn.execute(f"ALTER TABLE pedimento ADD COLUMN {col} {ddl}")
    conn.commit()


def create_db():
    SQLModel.metadata.create_all(engine)
    raw = engine.raw_connection()
    try:
        _migrate(raw)
        _setup_fts(raw)
    finally:
        raw.close()


def get_session():
    with Session(engine) as session:
        yield session
