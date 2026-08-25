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

const INITIAL_PATIENTS = [];

const INITIAL_APPOINTMENTS = [];

