-- Whop payment integration metadata.
-- Keeps the existing subscriptions table as the local entitlement source.

CREATE TABLE IF NOT EXISTS payment_webhook_events (
    provider TEXT NOT NULL,
    id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    event_created TEXT NOT NULL,
    received_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (provider, id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_received
    ON payment_webhook_events(received_at);
