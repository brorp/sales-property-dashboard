import {
    pgTable,
    text,
    timestamp,
    date,
    boolean,
    integer,
    uniqueIndex,
    index,
} from "drizzle-orm/pg-core";

// ─── Better Auth Core Tables ─────────────────────────────────────────────────

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("sales"),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Application Tables ──────────────────────────────────────────────────────

export const lead = pgTable(
    "lead",
    {
        id: text("id").primaryKey(),
        name: text("name").notNull(),
        phone: text("phone").notNull(),
        source: text("source").notNull().default("Manual Input"),
        metaLeadId: text("meta_lead_id"),
        entryChannel: text("entry_channel").notNull().default("meta_ads"),
        receivedAt: timestamp("received_at").notNull().defaultNow(),
        assignedTo: text("assigned_to").references(() => user.id, {
            onDelete: "set null",
        }),
        clientStatus: text("client_status").notNull().default("warm"),
        layer2Status: text("layer2_status").notNull().default("prospecting"),
        rejectedReason: text("rejected_reason"),
        rejectedNote: text("rejected_note"),
        progress: text("progress").notNull().default("pending"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        phoneIdx: index("lead_phone_idx").on(table.phone),
        assignedToIdx: index("lead_assigned_to_idx").on(table.assignedTo),
        metaLeadUnique: uniqueIndex("lead_meta_lead_id_unique").on(table.metaLeadId),
    })
);

export const activity = pgTable("activity", {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
        .notNull()
        .references(() => lead.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("note"),
    note: text("note").notNull(),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const appointment = pgTable("appointment", {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
        .notNull()
        .references(() => lead.id, { onDelete: "cascade" }),
    salesId: text("sales_id").references(() => user.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    time: text("time").notNull(),
    location: text("location").notNull(),
    notes: text("notes"),
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const salesQueue = pgTable(
    "sales_queue",
    {
        id: text("id").primaryKey(),
        salesId: text("sales_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        queueOrder: integer("queue_order").notNull(),
        label: text("label").notNull(),
        isActive: boolean("is_active").notNull().default(true),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        salesUnique: uniqueIndex("sales_queue_sales_id_unique").on(table.salesId),
        orderUnique: uniqueIndex("sales_queue_order_unique").on(table.queueOrder),
    })
);

export const distributionCycle = pgTable(
    "distribution_cycle",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        status: text("status").notNull().default("active"),
        currentQueueOrder: integer("current_queue_order").notNull().default(0),
        startedAt: timestamp("started_at").notNull().defaultNow(),
        finishedAt: timestamp("finished_at"),
    },
    (table) => ({
        leadIdx: index("distribution_cycle_lead_id_idx").on(table.leadId),
    })
);

export const distributionAttempt = pgTable(
    "distribution_attempt",
    {
        id: text("id").primaryKey(),
        cycleId: text("cycle_id")
            .notNull()
            .references(() => distributionCycle.id, { onDelete: "cascade" }),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        salesId: text("sales_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        queueOrder: integer("queue_order").notNull(),
        status: text("status").notNull().default("waiting_ok"),
        assignedAt: timestamp("assigned_at").notNull().defaultNow(),
        ackDeadline: timestamp("ack_deadline").notNull(),
        ackAt: timestamp("ack_at"),
        closedAt: timestamp("closed_at"),
        closeReason: text("close_reason"),
    },
    (table) => ({
        cycleIdx: index("distribution_attempt_cycle_id_idx").on(table.cycleId),
        leadIdx: index("distribution_attempt_lead_id_idx").on(table.leadId),
        waitingIdx: index("distribution_attempt_status_idx").on(table.status),
    })
);

export const waMessage = pgTable(
    "wa_message",
    {
        id: text("id").primaryKey(),
        providerMessageId: text("provider_message_id"),
        fromWa: text("from_wa").notNull(),
        toWa: text("to_wa").notNull(),
        body: text("body").notNull(),
        direction: text("direction").notNull(),
        leadId: text("lead_id").references(() => lead.id, { onDelete: "set null" }),
        salesId: text("sales_id").references(() => user.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        providerUnique: uniqueIndex("wa_message_provider_id_unique").on(
            table.providerMessageId
        ),
        fromWaIdx: index("wa_message_from_wa_idx").on(table.fromWa),
        leadIdx: index("wa_message_lead_id_idx").on(table.leadId),
    })
);

export const leadStatusHistory = pgTable(
    "lead_status_history",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        oldStatus: text("old_status"),
        newStatus: text("new_status").notNull(),
        changedBy: text("changed_by").references(() => user.id, {
            onDelete: "set null",
        }),
        changedAt: timestamp("changed_at").notNull().defaultNow(),
        note: text("note"),
    },
    (table) => ({
        leadIdx: index("lead_status_history_lead_id_idx").on(table.leadId),
    })
);

export const leadProgressHistory = pgTable(
    "lead_progress_history",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        oldProgress: text("old_progress"),
        newProgress: text("new_progress").notNull(),
        changedBy: text("changed_by").references(() => user.id, {
            onDelete: "set null",
        }),
        changedAt: timestamp("changed_at").notNull().defaultNow(),
        note: text("note"),
    },
    (table) => ({
        leadIdx: index("lead_progress_history_lead_id_idx").on(table.leadId),
    })
);
