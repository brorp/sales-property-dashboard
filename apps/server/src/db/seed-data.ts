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
            {
                key: "widari-sup-aldi",
                name: "Aldi",
                email: "aldi@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111101",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sales-steven",
                name: "Steven",
                email: "steven@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111101",
                createdByKey: "widari-sup-aldi",
                supervisorKey: "widari-sup-aldi",
            },
            {
                key: "widari-sales-rudi",
                name: "Rudi",
                email: "rudi@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111102",
                createdByKey: "widari-sup-aldi",
                supervisorKey: "widari-sup-aldi",
            },
            {
                key: "widari-sup-nico",
                name: "Nico",
                email: "nico@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111102",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sales-rey",
                name: "Rey",
                email: "rey@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111103",
                createdByKey: "widari-sup-nico",
                supervisorKey: "widari-sup-nico",
            },
            {
                key: "widari-sales-amel",
                name: "Amel",
                email: "amel@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111104",
                createdByKey: "widari-sup-nico",
                supervisorKey: "widari-sup-nico",
            },
            {
                key: "widari-sup-pic-agent",
                name: "PIC Agent",
                email: "supervisor.picagent@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111103",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sales-agent",
                name: "Sales Agent",
                email: "picagent@gmail.com",
                password: "sales123",
                role: "sales",
                phone: "081111111105",
                createdByKey: "widari-sup-pic-agent",
                supervisorKey: "widari-sup-pic-agent",
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
