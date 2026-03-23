-- 001-extensions.sql
-- Enable required PostgreSQL extensions for Open Brain.

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: vector similarity search
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- pgcrypto: gen_random_uuid(), hashing utilities
