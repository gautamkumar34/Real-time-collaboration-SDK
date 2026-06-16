-- 001_create_documents.sql
-- 
-- Documents table: stores the latest snapshot of each collaborative document.
-- One row per document. Upserted on each snapshot.

CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    snapshot_data TEXT NOT NULL DEFAULT '{}',
    snapshot_metadata TEXT NOT NULL DEFAULT '{}',
    snapshot_version INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing documents by most recently updated
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at DESC);
