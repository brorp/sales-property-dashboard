CREATE TABLE IF NOT EXISTS "whatsapp_outbox" (
    "id" text PRIMARY KEY NOT NULL,
    "client_id" text NOT NULL REFERENCES "client"("id") ON DELETE CASCADE,
    "dedupe_key" text NOT NULL,
    "message_type" text NOT NULL,
    "recipient_wa" text NOT NULL,
    "body" text NOT NULL,
    "reconciliation_marker" text,
    "status" text DEFAULT 'pending' NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 288 NOT NULL,
    "available_at" timestamp DEFAULT now() NOT NULL,
    "processing_started_at" timestamp,
    "last_attempt_at" timestamp,
    "sent_at" timestamp,
    "provider_message_id" text,
    "last_error" text,
    "lead_id" text REFERENCES "lead"("id") ON DELETE SET NULL,
    "sales_id" text REFERENCES "user"("id") ON DELETE SET NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_outbox_dedupe_key_unique" ON "whatsapp_outbox" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_outbox_client_status_available_idx" ON "whatsapp_outbox" ("client_id", "status", "available_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_outbox_lead_id_idx" ON "whatsapp_outbox" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_outbox_sales_id_idx" ON "whatsapp_outbox" ("sales_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_operational_alert" (
    "id" text PRIMARY KEY NOT NULL,
    "fingerprint" text NOT NULL,
    "client_id" text REFERENCES "client"("id") ON DELETE CASCADE,
    "workspace_slug" text,
    "severity" text DEFAULT 'error' NOT NULL,
    "component" text NOT NULL,
    "event_code" text NOT NULL,
    "message" text NOT NULL,
    "status" text DEFAULT 'open' NOT NULL,
    "occurrence_count" integer DEFAULT 1 NOT NULL,
    "lead_id" text REFERENCES "lead"("id") ON DELETE SET NULL,
    "sales_id" text REFERENCES "user"("id") ON DELETE SET NULL,
    "metadata" text,
    "first_occurred_at" timestamp DEFAULT now() NOT NULL,
    "last_occurred_at" timestamp DEFAULT now() NOT NULL,
    "resolved_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_operational_alert_fingerprint_unique" ON "whatsapp_operational_alert" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_operational_alert_client_status_idx" ON "whatsapp_operational_alert" ("client_id", "status", "last_occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_operational_alert_lead_id_idx" ON "whatsapp_operational_alert" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "whatsapp_operational_alert_sales_id_idx" ON "whatsapp_operational_alert" ("sales_id");
