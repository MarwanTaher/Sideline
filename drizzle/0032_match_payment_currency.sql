-- Per-match currency for self-service match payments (amounts stay whole numbers).
ALTER TABLE matches
    ADD COLUMN IF NOT EXISTS payment_currency text NOT NULL DEFAULT 'PLN';
