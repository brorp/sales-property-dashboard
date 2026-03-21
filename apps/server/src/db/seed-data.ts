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
            {
                key: "widari-sales-agent",
                name: "Sales Agent",
                email: "salesagent@gmail.com",
                password: "sales123",
                role: "sales",
                phone: "081111111106",
                createdByKey: "widari-admin",
            },
        ],
    },
];

export const TENANT_LEAD_SOURCE_OPTIONS: Record<string, string[]> = {
    widari: [
        "Agent",
        "Meta Ads",
        "Instagram Ads",
        "TikTok Ads",
        "Website",
        "Walk In",
        "Referral",
    ],
};

export const TENANT_LEADS: Record<string, SeedLead[]> = {
    widari: [
        {
            key: "widari-agent-akad-1",
            clientId: "widari",
            assignedToKey: "widari-sales-agent",
            name: "Agent Lead Akad 1",
            phone: "6289000000001",
            source: "Agent",
            salesStatus: "hot",
            resultStatus: "akad",
            interestProjectType: "Studio",
            interestUnitName: "Aster 01",
            receivedAtOffsetDays: 15,
        },
        {
            key: "widari-agent-akad-2",
            clientId: "widari",
            assignedToKey: "widari-sales-agent",
            name: "Agent Lead Akad 2",
            phone: "6289000000002",
            source: "Agent",
            salesStatus: "hot",
            resultStatus: "akad",
            interestProjectType: "2BR",
            interestUnitName: "Aster 02",
            receivedAtOffsetDays: 14,
        },
        {
            key: "widari-agent-onprocess-1",
            clientId: "widari",
            assignedToKey: "widari-sales-agent",
            name: "Agent Lead On Process 1",
            phone: "6289000000003",
            source: "Agent",
            salesStatus: "warm",
            resultStatus: "on_process",
            interestProjectType: "1BR",
            interestUnitName: "Birch 01",
            receivedAtOffsetDays: 13,
        },
        {
            key: "widari-agent-onprocess-2",
            clientId: "widari",
            assignedToKey: "widari-sales-agent",
            name: "Agent Lead On Process 2",
            phone: "6289000000004",
            source: "Agent",
            salesStatus: "warm",
            resultStatus: "on_process",
            interestProjectType: "Townhouse",
            interestUnitName: "Cedar 02",
            receivedAtOffsetDays: 12,
        },
        {
            key: "widari-agent-cancel-1",
            clientId: "widari",
            assignedToKey: "widari-sales-agent",
            name: "Agent Lead Cancel 1",
            phone: "6289000000005",
            source: "Agent",
            salesStatus: "cold",
            resultStatus: "cancel",
            interestProjectType: "Penthouse",
            interestUnitName: "Orchid 01",
            rejectedReason: "No Budget",
            rejectedNote: "Dummy seed cancel",
            receivedAtOffsetDays: 11,
        },
        {
            key: "widari-sup-a-reserve-1",
            clientId: "widari",
            assignedToKey: "widari-sales-anto",
            name: "Supervisor A Reserve 1",
            phone: "6289000000011",
            source: "Meta Ads",
            salesStatus: "hot",
            resultStatus: "reserve",
            interestProjectType: "Studio",
            interestUnitName: "Lotus 01",
            receivedAtOffsetDays: 10,
        },
        {
            key: "widari-sup-a-onprocess-1",
            clientId: "widari",
            assignedToKey: "widari-sales-andi",
            name: "Supervisor A On Process 1",
            phone: "6289000000012",
            source: "Website",
            salesStatus: "warm",
            resultStatus: "on_process",
            interestProjectType: "2BR",
            interestUnitName: "Maple 03",
            receivedAtOffsetDays: 9,
        },
        {
            key: "widari-sup-a-fullbook-1",
            clientId: "widari",
            assignedToKey: "widari-sales-rudi",
            name: "Supervisor A Full Book 1",
            phone: "6289000000013",
            source: "Referral",
            salesStatus: "hot",
            resultStatus: "full_book",
            interestProjectType: "Townhouse",
            interestUnitName: "Palm 02",
            receivedAtOffsetDays: 8,
        },
        {
            key: "widari-sup-a-cancel-1",
            clientId: "widari",
            assignedToKey: "widari-sales-anto",
            name: "Supervisor A Cancel 1",
            phone: "6289000000014",
            source: "Instagram Ads",
            salesStatus: "cold",
            resultStatus: "cancel",
            interestProjectType: "1BR",
            interestUnitName: "Pine 04",
            rejectedReason: "Belum Cocok",
            rejectedNote: "Dummy seed cancel",
            receivedAtOffsetDays: 7,
        },
        {
            key: "widari-sup-a-akad-1",
            clientId: "widari",
            assignedToKey: "widari-sales-andi",
            name: "Supervisor A Akad 1",
            phone: "6289000000015",
            source: "Walk In",
            salesStatus: "hot",
            resultStatus: "akad",
            interestProjectType: "3BR",
            interestUnitName: "Rose 05",
            receivedAtOffsetDays: 6,
        },
        {
            key: "widari-sup-b-reserve-1",
            clientId: "widari",
            assignedToKey: "widari-sales-beni",
            name: "Supervisor B Reserve 1",
            phone: "6289000000021",
            source: "TikTok Ads",
            salesStatus: "warm",
            resultStatus: "reserve",
            interestProjectType: "Studio",
            interestUnitName: "Sage 01",
            receivedAtOffsetDays: 5,
        },
        {
            key: "widari-sup-b-onprocess-1",
            clientId: "widari",
            assignedToKey: "widari-sales-dika",
            name: "Supervisor B On Process 1",
            phone: "6289000000022",
            source: "Website",
            salesStatus: "hot",
            resultStatus: "on_process",
            interestProjectType: "1BR",
            interestUnitName: "Spruce 02",
            receivedAtOffsetDays: 4,
        },
        {
            key: "widari-sup-b-fullbook-1",
            clientId: "widari",
            assignedToKey: "widari-sales-beni",
            name: "Supervisor B Full Book 1",
            phone: "6289000000023",
            source: "Referral",
            salesStatus: "hot",
            resultStatus: "full_book",
            interestProjectType: "Penthouse",
            interestUnitName: "Tulip 06",
            receivedAtOffsetDays: 3,
        },
        {
            key: "widari-sup-b-cancel-1",
            clientId: "widari",
            assignedToKey: "widari-sales-dika",
            name: "Supervisor B Cancel 1",
            phone: "6289000000024",
            source: "Meta Ads",
            salesStatus: "cold",
            resultStatus: "cancel",
            interestProjectType: "2BR",
            interestUnitName: "Willow 03",
            rejectedReason: "Tidak Lolos",
            rejectedNote: "Dummy seed cancel",
            receivedAtOffsetDays: 2,
        },
        {
            key: "widari-sup-b-akad-1",
            clientId: "widari",
            assignedToKey: "widari-sales-beni",
            name: "Supervisor B Akad 1",
            phone: "6289000000025",
            source: "Walk In",
            salesStatus: "hot",
            resultStatus: "akad",
            interestProjectType: "Townhouse",
            interestUnitName: "Yarrow 02",
            receivedAtOffsetDays: 1,
        },
    ],
};

export const ALL_SEED_USERS: SeedUser[] = [
    ROOT_USER,
    ...TENANTS.flatMap((tenant) => tenant.users),
];
