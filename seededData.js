/* ==========================================================================
   DENTALCARE PRO - INITIAL SEEDED DATA (PERSISTENT DB MOCK)
   ========================================================================== */

const DEFAULT_EXCHANGE_RATE = 36.5; // 1 USD = 36.5 Bs.

const INITIAL_USERS = [
    {
        id: "usr-01",
        fullname: "Dr. Alejandro Silva",
        email: "doctor@dentalcare.com",
        password: "123456",
        role: "Odontólogo Principal",
        license: "MPPS-84920 / C.O.V-14920",
        status: "Activo",
        createdAt: "2026-01-10"
    },
    {
        id: "usr-02",
        fullname: "Lic. Carla Benítez",
        email: "asistente@dentalcare.com",
        password: "123456",
        role: "Asistente Dental",
        license: "MPPS-99201",
        status: "Activo",
        createdAt: "2026-02-15"
    },
    {
        id: "usr-03",
        fullname: "Administrador General",
        email: "admin@dentalcare.com",
        password: "123456",
        role: "Super Administrador",
        license: "ADMIN-01",
        status: "Activo",
        createdAt: "2026-01-01"
    }
];

const INITIAL_BAREMO = [
    { code: "OD-01", category: "Diagnóstico", name: "Consulta y Diagnóstico Clínico + Rx Periapical", priceUSD: 25.00, chairTimeMin: 20, materials: [{ code: "INS-03", qty: 1 }] },
    { code: "OD-02", category: "Diagnóstico", name: "Limpieza Ultrasonica + Profilaxis Fluorada", priceUSD: 40.00, chairTimeMin: 30, materials: [{ code: "INS-04", qty: 1 }, { code: "INS-05", qty: 1 }] },
    { code: "OP-01", category: "Operatoria", name: "Restauración Fotocurada (Resina Clase I / V)", priceUSD: 45.00, chairTimeMin: 45, materials: [{ code: "INS-01", qty: 1 }, { code: "INS-02", qty: 1 }, { code: "INS-06", qty: 1 }] },
    { code: "OP-02", category: "Operatoria", name: "Restauración Fotocurada Compleja (Clase II / Estética)", priceUSD: 60.00, chairTimeMin: 60, materials: [{ code: "INS-01", qty: 2 }, { code: "INS-02", qty: 1 }] },
    { code: "EN-01", category: "Endodoncia", name: "Tratamiento de Conducto Unirradicular", priceUSD: 120.00, chairTimeMin: 60, materials: [{ code: "INS-02", qty: 2 }, { code: "INS-07", qty: 1 }] },
    { code: "EN-02", category: "Endodoncia", name: "Tratamiento de Conducto Multirradicular (Molar)", priceUSD: 180.00, chairTimeMin: 90, materials: [{ code: "INS-02", qty: 3 }, { code: "INS-07", qty: 2 }] },
    { code: "CI-01", category: "Cirugía", name: "Exodoncia Simple de Pieza Permanente", priceUSD: 50.00, chairTimeMin: 30, materials: [{ code: "INS-02", qty: 2 }] },
    { code: "CI-02", category: "Cirugía", name: "Cirugía de Tercer Molar / Cordales Impactadas", priceUSD: 150.00, chairTimeMin: 60, materials: [{ code: "INS-02", qty: 3 }] },
    { code: "PR-01", category: "Prótesis", name: "Corona Metal-Cerámica / Zirconio", priceUSD: 250.00, chairTimeMin: 45, materials: [] },
    { code: "ES-01", category: "Estética", name: "Blanqueamiento Dental LED en Consultorio", priceUSD: 160.00, chairTimeMin: 60, materials: [] }
];

const INITIAL_INVENTORY = [
    { code: "INS-01", name: "Resina Nanohíbrida A2 (Jeringa 4g)", category: "Material de Restauración", currentStock: 8, minStock: 3, expiryDate: "2027-05-15", unit: "Jeringa" },
    { code: "INS-02", name: "Cartuchos Anestesia Lidocaína 2% c/Epinefrina", category: "Anestésicos", currentStock: 45, minStock: 20, expiryDate: "2026-11-30", unit: "Cartuchos" },
    { code: "INS-03", name: "Películas Radiográficas Periapicales Carestream", category: "Diagnóstico", currentStock: 12, minStock: 15, expiryDate: "2026-09-10", unit: "Unidades" },
    { code: "INS-04", name: "Pasta Profiláctica Mentolada (100g)", category: "Desechables", currentStock: 4, minStock: 2, expiryDate: "2027-01-20", unit: "Tubo" },
    { code: "INS-05", name: "Copa de Goma para Profilaxis", category: "Desechables", currentStock: 60, minStock: 30, expiryDate: "2028-06-01", unit: "Piezas" },
    { code: "INS-06", name: "Ácido Grabador Ortofosfórico 37%", category: "Material de Restauración", currentStock: 2, minStock: 4, expiryDate: "2026-08-25", unit: "Jeringa" },
    { code: "INS-07", name: "Limas Endodónticas K-File #15-40 25mm", category: "Instrumental", currentStock: 15, minStock: 5, expiryDate: "2029-10-10", unit: "Cajas" }
];

const INITIAL_PATIENTS = [
    {
        id: "V-18492102",
        fullname: "María Elena Rodríguez",
        birthdate: "1988-04-12",
        phone: "+584141234567",
        email: "maria.rodriguez@gmail.com",
        occupation: "Ingeniero de Sistemas",
        allergies: ["Penicilina"],
        systemic: ["Hipertensión"],
        medication: "Enalapril 10mg diario por la mañana",
        emergencyContact: "Carlos Rodríguez (Esposo) - 0412-9876543",
        status: "En Tratamiento",
        createdAt: "2026-06-10",
        odontogramData: {
            "18-Oclusal": "patology",
            "18-Mesial": "patology",
            "36-Oclusal": "treated",
            "46-Oclusal": "proposed"
        },
        clinicalNotes: [
            { id: "note-1", datetime: "2026-06-15 10:30", content: "Consulta inicial. Se realiza profilaxis y evaluación radiográfica. Se observa caries profunda en pieza 18 por mesio-oclusal. Paciente asintomática.", paymentUSD: 40.00 },
            { id: "note-2", datetime: "2026-07-02 11:00", content: "Aislamiento relativo. Limpieza y preparación cavitaria en pieza 36. Obturación con resina fotocurada A2.", paymentUSD: 45.00 }
        ],
        photos: [
            { url: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=400&q=80", caption: "Rx Periapical Inicial 18" }
        ],
        payments: [
            { date: "2026-06-15", concept: "Consulta + Limpieza", totalUSD: 40.00, paidUSD: 40.00, balanceUSD: 0.00, status: "Pagado" },
            { date: "2026-07-02", concept: "Resina 36 Oclusal", totalUSD: 45.00, paidUSD: 45.00, balanceUSD: 0.00, status: "Pagado" },
            { date: "2026-08-01", concept: "Presupuesto Tratamiento 18 & 46", totalUSD: 105.00, paidUSD: 40.00, balanceUSD: 65.00, status: "Pendiente" }
        ]
    },
    {
        id: "V-22105894",
        fullname: "Carlos Eduardo Mendoza",
        birthdate: "1994-09-25",
        phone: "+584249876543",
        email: "carlos.mendoza@hotmail.com",
        occupation: "Diseñador Gráfico",
        allergies: ["Látex"],
        systemic: [],
        medication: "Ninguna",
        emergencyContact: "Ana Mendoza (Madre) - 0416-1112233",
        status: "Presupuesto Pendiente",
        createdAt: "2026-07-20",
        odontogramData: {
            "26-Oclusal": "patology",
            "26-Distal": "patology",
            "47-Oclusal": "patology"
        },
        clinicalNotes: [
            { id: "note-101", datetime: "2026-07-20 15:00", content: "Evaluación estética y diagnóstico. Caries en 26 y 47. Se emite presupuesto.", paymentUSD: 25.00 }
        ],
        photos: [],
        payments: []
    },
    {
        id: "V-14552019",
        fullname: "Roberto José Gomez",
        birthdate: "1976-12-05",
        phone: "+584125554433",
        email: "roberto.gomez@empresa.com",
        occupation: "Contador Público",
        allergies: ["Anestésicos"],
        systemic: ["Diabetes", "Coagulopatías"],
        medication: "Metformina 850mg y Aspirina 100mg",
        emergencyContact: "Laura Gomez (Hija) - 0414-9998877",
        status: "Activo",
        createdAt: "2026-05-01",
        odontogramData: {},
        clinicalNotes: [],
        photos: [],
        payments: []
    }
];

const INITIAL_APPOINTMENTS = [
    { time: "09:00 AM", patientName: "María Elena Rodríguez", patientId: "V-18492102", treatment: "Restauración Resina 46 Oclusal", status: "Confirmada" },
    { time: "10:30 AM", patientName: "Carlos Eduardo Mendoza", patientId: "V-22105894", treatment: "Inicio Plan de Tratamiento 26", status: "En Espera" },
    { time: "02:00 PM", patientName: "Roberto José Gomez", patientId: "V-14552019", treatment: "Control y Profilaxis Ultrasonica", status: "Programada" },
    { time: "04:00 PM", patientName: "Patricia Lucía Fernandez", patientId: "V-25889012", treatment: "Evaluación Diagnóstica", status: "Programada" }
];
