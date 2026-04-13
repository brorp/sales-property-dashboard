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
            // ── Admin ────────────────────────────────────────
            {
                key: "wr-admin",
                name: "Widari Residence Admin",
                email: "admin@widariresidence.co.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6280000000001",
                createdByKey: "root",
            },

            // ── Supervisor Aldi ──────────────────────────────
            {
                key: "wr-spv-aldi",
                name: "Spv Aldi",
                email: "aliashadi@widariresidence.co.id",
                password: "supervisor123",
                role: "supervisor",
                phone: "+6287888096023",
                createdByKey: "wr-admin",
            },
            {
                key: "wr-sales-mila",
                name: "Mila",
                email: "mila@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6285711128017",
                createdByKey: "wr-spv-aldi",
                supervisorKey: "wr-spv-aldi",
            },
            {
                key: "wr-sales-deassy",
                name: "Deassy",
                email: "deassy@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6281212201497",
                createdByKey: "wr-spv-aldi",
                supervisorKey: "wr-spv-aldi",
            },
            {
                key: "wr-sales-iqbal",
                name: "Iqbal",
                email: "iqbal@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6281222991621",
                createdByKey: "wr-spv-aldi",
                supervisorKey: "wr-spv-aldi",
            },

            // ── Supervisor Niko ──────────────────────────────
            {
                key: "wr-spv-niko",
                name: "Spv Niko",
                email: "niko@widariresidence.co.id",
                password: "supervisor123",
                role: "supervisor",
                phone: "+62811860870",
                createdByKey: "wr-admin",
            },
            {
                key: "wr-sales-rudi",
                name: "Rudi",
                email: "rudi@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6289629679369",
                createdByKey: "wr-spv-niko",
                supervisorKey: "wr-spv-niko",
            },
            {
                key: "wr-sales-chandra",
                name: "Chandra",
                email: "chandra@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6282125663065",
                createdByKey: "wr-spv-niko",
                supervisorKey: "wr-spv-niko",
            },
            {
                key: "wr-sales-boby",
                name: "Boby",
                email: "boby@widariresidence.co.id",
                password: "sales123",
                role: "sales",
                phone: "+6282379222289",
                createdByKey: "wr-spv-niko",
                supervisorKey: "wr-spv-niko",
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
            },
        ],
    },
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
