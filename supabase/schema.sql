-- ==========================================================================
-- DENTALCARE PRO - SUPABASE POSTGRESQL DATABASE SCHEMA
-- Execute this SQL script in your Supabase SQL Editor to provision tables
-- ==========================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    license TEXT,
    status TEXT DEFAULT 'Activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. PATIENTS TABLE
CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    fullname TEXT NOT NULL,
    birthdate DATE NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    occupation TEXT,
    allergies JSONB DEFAULT '[]'::jsonb,
    systemic JSONB DEFAULT '[]'::jsonb,
    medication TEXT,
    emergency_contact TEXT,
    status TEXT DEFAULT 'Activo',
    odontogram_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. BAREMO PRICING TABLE
CREATE TABLE IF NOT EXISTS baremo_services (
    code TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price_usd NUMERIC(10,2) NOT NULL,
    chair_time_min INTEGER DEFAULT 30,
    materials JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. KARDEX INVENTORY TABLE
CREATE TABLE IF NOT EXISTS kardex_inventory (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    unit TEXT DEFAULT 'Unidades',
    expiry_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. CLINICAL NOTES (EHR EVOLUTIONS)
CREATE TABLE IF NOT EXISTS clinical_notes (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
    datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    content TEXT NOT NULL,
    payment_usd NUMERIC(10,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PAYMENTS & TRANSACTIONS
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
    payment_date DATE NOT NULL,
    concept TEXT NOT NULL,
    total_usd NUMERIC(10,2) NOT NULL,
    paid_usd NUMERIC(10,2) NOT NULL,
    balance_usd NUMERIC(10,2) NOT NULL,
    status TEXT DEFAULT 'Pagado',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. APPOINTMENTS AGENDA
CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
    patient_name TEXT NOT NULL,
    appointment_time TEXT NOT NULL,
    treatment TEXT NOT NULL,
    status TEXT DEFAULT 'Programada',
    is_tomorrow BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SEED INITIAL USERS
INSERT INTO users (id, fullname, email, password, role, license, status)
VALUES 
    ('usr-01', 'Dr. Alejandro Silva', 'doctor@dentalcare.com', '123456', 'Odontólogo Principal', 'MPPS-84920 / C.O.V-14920', 'Activo'),
    ('usr-02', 'Lic. Carla Benítez', 'asistente@dentalcare.com', '123456', 'Asistente Dental', 'MPPS-99201', 'Activo')
ON CONFLICT (email) DO NOTHING;
