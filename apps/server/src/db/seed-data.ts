export type UserRole = "root_admin" | "client_admin" | "supervisor" | "sales";

export type SeedUser = {
    key: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    phone: string;
    clientId?: string | null;
    createdByKey?: string;
    supervisorKey?: string;
};

export type SeedClient = {
    id: string;
    name: string;
    slug: string;
    users: SeedUser[];
};

export type SeedLead = {
    key: string;
    clientId: string;
    assignedToKey: string;
    name: string;
    phone: string;
    source: string;
    salesStatus: string;
    resultStatus: string;
    interestProjectType: string;
    interestUnitName: string;
    unitName?: string | null;
    flowStatus?: string;
    clientStatus?: string;
    layer2Status?: string;
    progress?: string;
    rejectedReason?: string | null;
    rejectedNote?: string | null;
    receivedAtOffsetDays?: number;
};

export const ROOT_USER: SeedUser = {
    key: "root",
    name: "Root Admin",
    email: "root@propertylounge.id",
    password: "admin123",
    role: "root_admin",
    phone: "+6280000000000",
    clientId: null,
};

export const TENANTS: SeedClient[] = [
    {
        id: "widari",
        name: "Widari",
        slug: "widari",
        users: [
            {
                key: "widari-admin",
                name: "Widari Admin",
                email: "admin@widari.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111101",
                createdByKey: "root",
            },
        ],
    },
];

export const TENANT_LEAD_SOURCE_OPTIONS: Record<string, string[]> = {
    widari: ["Online", "Offline", "Walk In", "Agent"],
};

export const TENANT_LEADS: Record<string, SeedLead[]> = {
    widari: [],
};

export const ALL_SEED_USERS: SeedUser[] = [
    ROOT_USER,
    ...TENANTS.flatMap((tenant) => tenant.users),
];
