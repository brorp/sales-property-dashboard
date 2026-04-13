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

// ─── Multi-Tenant / Client Table ─────────────────────────────────────────────

export const client = pgTable("client", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    apiPrefix: text("api_prefix").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Better Auth Core Tables ─────────────────────────────────────────────────

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("sales"),
    clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
    supervisorId: text("supervisor_id").references((): any => user.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references((): any => user.id, {
        onDelete: "set null",
    }),
    phone: text("phone"),
    isActive: boolean("is_active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at"),
    deactivatedByUserId: text("deactivated_by_user_id").references((): any => user.id, {
        onDelete: "set null",
    }),
    reactivatedAt: timestamp("reactivated_at"),
    reactivatedByUserId: text("reactivated_by_user_id").references((): any => user.id, {
        onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
    roleIdx: index("user_role_idx").on(table.role),
    clientIdx: index("user_client_id_idx").on(table.clientId),
    supervisorIdx: index("user_supervisor_id_idx").on(table.supervisorId),
    createdByIdx: index("user_created_by_user_id_idx").on(table.createdByUserId),
    deactivatedByIdx: index("user_deactivated_by_user_id_idx").on(table.deactivatedByUserId),
    reactivatedByIdx: index("user_reactivated_by_user_id_idx").on(table.reactivatedByUserId),
}));

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

// ─── Supervisor → Sales Mapping ──────────────────────────────────────────────

export const supervisorSales = pgTable(
    "supervisor_sales",
    {
        id: text("id").primaryKey(),
        supervisorId: text("supervisor_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        salesId: text("sales_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        supervisorSalesUnique: uniqueIndex("supervisor_sales_unique").on(
            table.supervisorId,
            table.salesId
        ),
        supervisorIdx: index("supervisor_sales_supervisor_idx").on(table.supervisorId),
        salesIdx: index("supervisor_sales_sales_idx").on(table.salesId),
    })
);

// ─── Application Tables ──────────────────────────────────────────────────────

export const projectUnit = pgTable(
    "project_unit",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id")
            .references(() => client.id, { onDelete: "cascade" }),
        projectType: text("project_type").notNull(),
        unitName: text("unit_name").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        clientIdx: index("project_unit_client_id_idx").on(table.clientId),
        clientTypeNameUnique: uniqueIndex("project_unit_client_type_name_unique").on(
            table.clientId,
            table.projectType,
            table.unitName
        ),
    })
);

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
        clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
        assignedTo: text("assigned_to").references(() => user.id, {
            onDelete: "set null",
        }),
        flowStatus: text("flow_status").notNull().default("open"),
        acceptedAt: timestamp("accepted_at"),
        salesStatus: text("sales_status"),
        domicileCity: text("domicile_city"),
        interestUnitId: text("interest_unit_id").references(() => projectUnit.id, {
            onDelete: "set null",
        }),
        interestProjectType: text("interest_project_type"),
        interestUnitName: text("interest_unit_name"),
        resultStatus: text("result_status"),
        unitName: text("unit_name"),
        unitDetail: text("unit_detail"),
        paymentMethod: text("payment_method"),
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
        flowStatusIdx: index("lead_flow_status_idx").on(table.flowStatus),
        clientIdx: index("lead_client_id_idx").on(table.clientId),
        metaLeadUnique: uniqueIndex("lead_meta_lead_id_unique").on(table.metaLeadId),
    })
);

export const customerPipelineFollowUp = pgTable(
    "customer_pipeline_follow_up",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        stepNo: integer("step_no").notNull(),
        note: text("note"),
        isChecked: boolean("is_checked").notNull().default(false),
        checkedAt: timestamp("checked_at"),
        checkedBy: text("checked_by").references(() => user.id, { onDelete: "set null" }),
        isLocked: boolean("is_locked").notNull().default(false),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        leadIdx: index("customer_pipeline_follow_up_lead_id_idx").on(table.leadId),
        checkedByIdx: index("customer_pipeline_follow_up_checked_by_idx").on(table.checkedBy),
        leadStepUnique: uniqueIndex("customer_pipeline_follow_up_lead_step_unique").on(
            table.leadId,
            table.stepNo
        ),
    })
);

export const cancelReason = pgTable(
    "cancel_reason",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id")
            .notNull()
            .references(() => client.id, { onDelete: "cascade" }),
        code: text("code").notNull(),
        label: text("label").notNull(),
        isActive: boolean("is_active").notNull().default(true),
        sortOrder: integer("sort_order").notNull().default(0),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        clientIdx: index("cancel_reason_client_id_idx").on(table.clientId),
        activeIdx: index("cancel_reason_is_active_idx").on(table.isActive),
        clientCodeUnique: uniqueIndex("cancel_reason_client_code_unique").on(
            table.clientId,
            table.code
        ),
    })
);

export const leadPenalty = pgTable(
    "lead_penalty",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        salesId: text("sales_id").references(() => user.id, { onDelete: "set null" }),
        ruleCode: text("rule_code").notNull(),
        penaltyLayer: integer("penalty_layer").notNull().default(1),
        suspendedDays: integer("suspended_days").notNull().default(0),
        status: text("status").notNull().default("active"),
        note: text("note"),
        metadata: text("metadata"),
        triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        leadIdx: index("lead_penalty_lead_id_idx").on(table.leadId),
        salesIdx: index("lead_penalty_sales_id_idx").on(table.salesId),
        ruleIdx: index("lead_penalty_rule_code_idx").on(table.ruleCode),
        leadRuleUnique: uniqueIndex("lead_penalty_lead_rule_unique").on(
            table.leadId,
            table.ruleCode
        ),
    })
);

export const salesDistributionSuspension = pgTable(
    "sales_distribution_suspension",
    {
        id: text("id").primaryKey(),
        salesId: text("sales_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
        penaltyId: text("penalty_id")
            .notNull()
            .references(() => leadPenalty.id, { onDelete: "cascade" }),
        ruleCode: text("rule_code").notNull(),
        penaltyLayer: integer("penalty_layer").notNull().default(1),
        suspendedDays: integer("suspended_days").notNull().default(0),
        status: text("status").notNull().default("active"),
        note: text("note"),
        suspendedFrom: timestamp("suspended_from").notNull().defaultNow(),
        suspendedUntil: timestamp("suspended_until").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        salesIdx: index("sales_distribution_suspension_sales_id_idx").on(table.salesId),
        clientIdx: index("sales_distribution_suspension_client_id_idx").on(table.clientId),
        penaltyIdx: uniqueIndex("sales_distribution_suspension_penalty_id_unique").on(table.penaltyId),
        activeIdx: index("sales_distribution_suspension_status_idx").on(
            table.status,
            table.suspendedUntil
        ),
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
    status: text("status").notNull().default("mau_survey"),
    location: text("location").notNull(),
    notes: text("notes"),
    googleEventId: text("google_event_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const salesQueue = pgTable(
    "sales_queue",
    {
        id: text("id").primaryKey(),
        salesId: text("sales_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
        queueOrder: integer("queue_order").notNull(),
        label: text("label").notNull(),
        isActive: boolean("is_active").notNull().default(true),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        salesUnique: uniqueIndex("sales_queue_sales_id_unique").on(table.salesId),
        orderUnique: uniqueIndex("sales_queue_client_order_unique").on(
            table.clientId,
            table.queueOrder
        ),
        clientIdx: index("sales_queue_client_id_idx").on(table.clientId),
    })
);

export const appSetting = pgTable(
    "app_setting",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id").references(() => client.id, { onDelete: "set null" }),
        distributionAckTimeoutMinutes: integer("distribution_ack_timeout_minutes")
            .notNull()
            .default(5),
        operationalStartMinute: integer("operational_start_minute")
            .notNull()
            .default(9 * 60),
        operationalEndMinute: integer("operational_end_minute")
            .notNull()
            .default(21 * 60),
        operationalTimezone: text("operational_timezone")
            .notNull()
            .default("Asia/Jakarta"),
        outsideOfficeReply: text("outside_office_reply")
            .notNull()
            .default(
                "Terima kasih sudah menghubungi kami. Jam operasional kami 09.00 - 21.00 WIB. Tim kami akan merespons saat jam operasional."
            ),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        clientUnique: uniqueIndex("app_setting_client_id_unique").on(table.clientId),
        clientIdx: index("app_setting_client_id_idx").on(table.clientId),
    })
);

export const leadSourceOption = pgTable(
    "lead_source_option",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id")
            .notNull()
            .references(() => client.id, { onDelete: "cascade" }),
        value: text("value").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
        clientIdx: index("lead_source_option_client_id_idx").on(table.clientId),
        clientValueUnique: uniqueIndex("lead_source_option_client_value_unique").on(
            table.clientId,
            table.value
        ),
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

export const leadReassignmentAudit = pgTable(
    "lead_reassignment_audit",
    {
        id: text("id").primaryKey(),
        leadId: text("lead_id")
            .notNull()
            .references(() => lead.id, { onDelete: "cascade" }),
        fromSalesId: text("from_sales_id").references(() => user.id, { onDelete: "set null" }),
        toSalesId: text("to_sales_id").references(() => user.id, { onDelete: "set null" }),
        triggeredByUserId: text("triggered_by_user_id").references(() => user.id, {
            onDelete: "set null",
        }),
        source: text("source").notNull().default("manual_reassign"),
        importBatchId: text("import_batch_id"),
        metadata: text("metadata"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
        leadIdx: index("lead_reassignment_audit_lead_id_idx").on(table.leadId),
        fromSalesIdx: index("lead_reassignment_audit_from_sales_id_idx").on(table.fromSalesId),
        toSalesIdx: index("lead_reassignment_audit_to_sales_id_idx").on(table.toSalesId),
        triggeredByIdx: index("lead_reassignment_audit_triggered_by_user_id_idx").on(
            table.triggeredByUserId
        ),
        batchIdx: index("lead_reassignment_audit_import_batch_id_idx").on(table.importBatchId),
    })
);
