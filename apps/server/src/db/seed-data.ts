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
                key: "widari-sup-a",
                name: "Supervisor Widari A",
                email: "supervisor.a@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111101",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sup-b",
                name: "Supervisor Widari B",
                email: "supervisor.b@widari.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111102",
                createdByKey: "widari-admin",
            },
            {
                key: "widari-sales-anto",
                name: "Anto Widari",
                email: "anto@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111101",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-andi",
                name: "Andi Widari",
                email: "andi@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111102",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-rudi",
                name: "Rudi Widari",
                email: "rudi@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111103",
                createdByKey: "widari-sup-a",
                supervisorKey: "widari-sup-a",
            },
            {
                key: "widari-sales-beni",
                name: "Beni Widari",
                email: "beni@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111104",
                createdByKey: "widari-sup-b",
                supervisorKey: "widari-sup-b",
            },
            {
                key: "widari-sales-dika",
                name: "Dika Widari",
                email: "dika@widari.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111105",
                createdByKey: "widari-sup-b",
                supervisorKey: "widari-sup-b",
            },
        ],
    },
    {
        id: "aryana",
        name: "Aryana",
        slug: "aryana",
        users: [
            {
                key: "aryana-admin",
                name: "Aryana Admin",
                email: "admin@aryana.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111201",
                createdByKey: "root",
            },
            {
                key: "aryana-sup-c",
                name: "Supervisor Aryana C",
                email: "supervisor.c@aryana.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111201",
                createdByKey: "aryana-admin",
            },
            {
                key: "aryana-sup-d",
                name: "Supervisor Aryana D",
                email: "supervisor.d@aryana.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111202",
                createdByKey: "aryana-admin",
            },
            {
                key: "aryana-sales-1",
                name: "Sales Aryana 1",
                email: "sales1@aryana.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111201",
                createdByKey: "aryana-sup-c",
                supervisorKey: "aryana-sup-c",
            },
            {
                key: "aryana-sales-2",
                name: "Sales Aryana 2",
                email: "sales2@aryana.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111202",
                createdByKey: "aryana-sup-c",
                supervisorKey: "aryana-sup-c",
            },
        ],
    },
    {
        id: "agung-sedayu",
        name: "Agung Sedayu",
        slug: "agung-sedayu",
        users: [
            {
                key: "agung-admin",
                name: "Agung Sedayu Admin",
                email: "admin@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "client_admin",
                phone: "+6281111111301",
                createdByKey: "root",
            },
            {
                key: "agung-sup-e",
                name: "Supervisor Agung E",
                email: "supervisor.e@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111301",
                createdByKey: "agung-admin",
            },
            {
                key: "agung-sup-f",
                name: "Supervisor Agung F",
                email: "supervisor.f@agungsedayu.propertylounge.id",
                password: "admin123",
                role: "supervisor",
                phone: "+6281211111302",
                createdByKey: "agung-admin",
            },
            {
                key: "agung-sales-1",
                name: "Sales Agung 1",
                email: "sales1@agungsedayu.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111301",
                createdByKey: "agung-sup-e",
                supervisorKey: "agung-sup-e",
            },
            {
                key: "agung-sales-2",
                name: "Sales Agung 2",
                email: "sales2@agungsedayu.propertylounge.id",
                password: "sales123",
                role: "sales",
                phone: "081111111302",
                createdByKey: "agung-sup-f",
                supervisorKey: "agung-sup-f",
            },
        ],
    },
];

export const ALL_SEED_USERS: SeedUser[] = [
    ROOT_USER,
    ...TENANTS.flatMap((tenant) => tenant.users),
];
