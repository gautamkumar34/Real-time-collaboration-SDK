-- 002_create_operations.sql
-- 
-- Operations table: append-only log of document operations.
-- Used for replay between snapshots. Trimmed after each snapshot.
-- 
-- Each op has a per-document sequence number (seq) assigned by the server.
-- The (doc_id, seq) pair is unique and monotonically increasing.

CREATE TABLE IF NOT EXISTS operations (
    id BIGSERIAL PRIMARY KEY,
    doc_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    op_data TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (doc_id, seq)
);

-- Fast tail reads: get all ops for a doc after a certain seq
CREATE INDEX IF NOT EXISTS idx_operations_doc_seq ON operations (doc_id, seq);
