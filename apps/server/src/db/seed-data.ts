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
        ],
    },
];

export const ALL_SEED_USERS: SeedUser[] = [
    ROOT_USER,
    ...TENANTS.flatMap((tenant) => tenant.users),
];
