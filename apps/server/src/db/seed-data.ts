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
    apiPrefix?: string;
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

export type SeedCancelReason = {
    code: string;
    label: string;
    sortOrder: number;
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
        id: "wr-001",
        name: "Widari Residence",
        slug: "widari-residence",
        apiPrefix: "",
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
    {
        id: "wv-001",
        name: "Widari Village",
        slug: "widari-village",
        apiPrefix: "/wv",
        users: [
            {
                key: "wv-admin",
                name: "WV Admin",
                email: "admin-wv@widari.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111109",
                createdByKey: "root",
            }
        ],
    }
];

export const TENANT_LEAD_SOURCE_OPTIONS: Record<string, string[]> = {
    "wr-001": ["Online", "Offline", "Walk In", "Agent", "Old", "Pribadi"],
    "wv-001": ["Online", "Offline", "Walk In", "Agent"],
};

export const TENANT_CANCEL_REASONS: Record<string, SeedCancelReason[]> = {
    "wr-001": [
        { code: "harga", label: "Harga", sortOrder: 1 },
        { code: "lokasi", label: "Lokasi", sortOrder: 2 },
        { code: "kompetitor", label: "Pilih Kompetitor", sortOrder: 3 },
        { code: "belum_siap", label: "Belum Siap Beli", sortOrder: 4 },
        { code: "tidak_responsif", label: "Tidak Responsif", sortOrder: 5 },
        { code: "tidak_cocok", label: "Produk Tidak Cocok", sortOrder: 6 },
        { code: "lainnya", label: "Lainnya", sortOrder: 7 },
    ],
    "wv-001": [],
};

export const TENANT_LEADS: Record<string, SeedLead[]> = {
    "wr-001": [],
    "wv-001": [],
};

export const ALL_SEED_USERS: SeedUser[] = [
    ROOT_USER,
    ...TENANTS.flatMap((tenant) => tenant.users),
];
