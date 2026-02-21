export const USER_ROLES = ["admin", "sales"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const CLIENT_STATUSES = [
    { key: "hot", label: "Hot Client", icon: "🔥" },
    { key: "warm", label: "Warm Client", icon: "🌡️" },
    { key: "cold", label: "Cold Client", icon: "🧊" },
    { key: "lost", label: "Lost Client", icon: "❌" },
    { key: "closed_deal", label: "Closed/Deal", icon: "✅" },
] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number]["key"];

export const PROGRESS_STEPS = [
    { key: "new", label: "New", icon: "📥" },
    { key: "follow-up", label: "Follow-up", icon: "📞" },
    { key: "pending", label: "Pending", icon: "⏳" },
    { key: "appointment", label: "Appointment", icon: "📅" },
    { key: "rejected", label: "Rejected", icon: "❌" },
    { key: "closed", label: "Closed", icon: "✅" },
] as const;
export type LeadProgress = (typeof PROGRESS_STEPS)[number]["key"];

export const ACTIVITY_TYPES = [
    "new",
    "follow-up",
    "pending",
    "appointment",
    "rejected",
    "closed",
    "note",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
