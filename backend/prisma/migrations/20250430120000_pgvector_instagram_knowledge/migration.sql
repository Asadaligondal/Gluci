-- Enable pgvector and knowledge table (run once per database)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS instagram_knowledge (
  id SERIAL PRIMARY KEY,
  account TEXT NOT NULL,
  date TEXT,
  caption TEXT,
  foods TEXT[],
  glucose_impact TEXT,
  spike_estimate_mg_dl INTEGER,
  verdict TEXT,
  score INTEGER,
  key_tip TEXT,
  likes INTEGER,
  url TEXT,
  embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS instagram_knowledge_embedding_idx
ON instagram_knowledge
USING ivfflat (embedding vector_cosine_ops);
