-- ==========================================================================
-- DENTALCARE PRO - DATABASE SCHEMA EXTENSIONS (SUPABASE POSTGRESQL)
-- Run this in your Supabase SQL Editor to support the new features
-- ==========================================================================

-- 1. Extend patients table for full metadata and arrays
ALTER TABLE patients ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_minor BOOLEAN DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS clinical_notes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;

-- 2. Extend baremo_services table for hygienist bonus
ALTER TABLE baremo_services ADD COLUMN IF NOT EXISTS hygienist_bonus NUMERIC(10,2) DEFAULT 0.00;

-- 3. Extend users table for doctor commissions and schedule profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS doctor_profile JSONB DEFAULT '{}'::jsonb;

-- 4. INVOICES TABLE
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    patient_id TEXT REFERENCES patients(id) ON DELETE CASCADE,
    invoice_date DATE NOT NULL,
    payment_method TEXT NOT NULL, -- Zelle, Bs, Dolares
    payment_terms TEXT NOT NULL,  -- Contado, Credito
    currency TEXT NOT NULL DEFAULT 'REF', -- REF, BS
    items JSONB DEFAULT '[]'::jsonb,
    total_ref NUMERIC(15,2) NOT NULL,
    total_bcv NUMERIC(15,2) NOT NULL,
    status TEXT DEFAULT 'Emitida',
    footer_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PROVIDER BILLS TABLE (Cuentas por Pagar)
CREATE TABLE IF NOT EXISTS provider_bills (
    id TEXT PRIMARY KEY,
    provider_name TEXT NOT NULL,
    service_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT DEFAULT 'Pendiente', -- Pendiente, Pagado
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. STATIONERY CONFIG TABLE
CREATE TABLE IF NOT EXISTS stationery_config (
    id TEXT PRIMARY KEY,
    header_text TEXT,
    footer_text TEXT,
    logo_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed default stationery
INSERT INTO stationery_config (id, header_text, footer_text, logo_url)
VALUES ('default', 'DentalCare Pro - Clínica Odontológica Especializada', 'Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.', NULL)
ON CONFLICT (id) DO NOTHING;
