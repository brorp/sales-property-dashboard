import type { ClientStatus, LeadProgress, ActivityType, UserRole } from "./constants";

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    phone?: string | null;
    image?: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Lead {
    id: string;
    name: string;
    phone: string;
    source: string;
    assignedTo?: string | null;
    metaLeadId?: string | null;
    entryChannel?: string;
    receivedAt?: Date;
    clientStatus: ClientStatus;
    progress: LeadProgress;
    createdAt: Date;
    updatedAt: Date;
}

export interface Activity {
    id: string;
    leadId: string;
    type: ActivityType;
    note: string;
    timestamp: Date;
}

export interface Appointment {
    id: string;
    leadId: string;
    date: string;
    time: string;
    location: string;
    notes?: string | null;
    createdAt: Date;
}

// API response types
export interface LeadWithRelations extends Lead {
    activities: Activity[];
    appointments: Appointment[];
    assignedUser?: Pick<User, "id" | "name" | "email"> | null;
}

export interface DashboardStats {
    total: number;
    hot: number;
    warm: number;
    cold: number;
    closed: number;
    pending: number;
    followUp: number;
    appointment: number;
    new: number;
}

export interface SalesPerformance {
    id: string;
    name: string;
    email: string;
    total: number;
    closed: number;
    hot: number;
    pending: number;
    closeRate: number;
}

export interface TeamMember extends SalesPerformance { }

export interface CreateLeadInput {
    name: string;
    phone: string;
    source: string;
    assignedTo?: string;
}

export interface UpdateLeadInput {
    clientStatus?: ClientStatus;
    progress?: LeadProgress;
    assignedTo?: string;
    activityNote?: string;
}

export interface CreateAppointmentInput {
    date: string;
    time: string;
    location: string;
    notes?: string;
}

export interface CreateActivityInput {
    note: string;
}
