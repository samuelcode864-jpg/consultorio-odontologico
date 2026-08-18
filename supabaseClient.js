/* ==========================================================================
   DENTALCARE PRO - SUPABASE LIVE DATABASE CLIENT CONNECTOR
   Realtime Cloud Persistence for Patients, EHR, Appointments, Inventory, Baremo & Users
   ========================================================================== */

const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://tudymiytiwcyrjtptfvi.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHltaXl0aXdjeXJqdHB0ZnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjMxNzQsImV4cCI6MjEwMTg5OTE3NH0.wP-vsBmc7ezIx8Uq_hTqye44Gxl75jkGZSxDDg-3Aj8';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase Cloud Database Connected Successfully! Project: tudymiytiwcyrjtptfvi');
    } catch (e) {
        console.warn('⚠️ Supabase connection fallback:', e);
    }
}

class SupabaseDataService {
    static isCloudConnected() {
        return supabaseClient !== null;
    }

    // ==========================================
    // 1. SYSTEM USERS
    // ==========================================
    static async getUsers() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_users')) || INITIAL_USERS;
        }
        try {
            const { data, error } = await supabaseClient.from('users').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(u => ({
                    id: u.id,
                    fullname: u.fullname,
                    email: u.email,
                    password: u.password,
                    role: u.role,
                    license: u.license || '',
                    status: u.status || 'Activo',
                    createdAt: u.created_at ? u.created_at.split('T')[0] : '2026-01-10',
                    doctorProfile: u.doctor_profile || {}
                }));
                localStorage.setItem('dental_users', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_users')) || INITIAL_USERS;
        } catch (err) {
            console.error('Supabase getUsers Error:', err);
            return JSON.parse(localStorage.getItem('dental_users')) || INITIAL_USERS;
        }
    }

    static async saveUser(userObj) {
        let localUsers = JSON.parse(localStorage.getItem('dental_users')) || INITIAL_USERS;
        const idx = localUsers.findIndex(u => u.id === userObj.id || u.email.toLowerCase() === userObj.email.toLowerCase());
        if (idx >= 0) localUsers[idx] = userObj;
        else localUsers.push(userObj);
        localStorage.setItem('dental_users', JSON.stringify(localUsers));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('users').upsert({
                    id: userObj.id,
                    fullname: userObj.fullname,
                    email: userObj.email,
                    password: userObj.password,
                    role: userObj.role,
                    license: userObj.license || null,
                    status: userObj.status || 'Activo',
                    doctor_profile: userObj.doctorProfile || {}
                });
                if (error) console.error('Supabase saveUser Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveUser Exception:', err);
            }
        }
    }

    static async deleteUser(userId) {
        let localUsers = JSON.parse(localStorage.getItem('dental_users')) || INITIAL_USERS;
        localUsers = localUsers.filter(u => u.id !== userId);
        localStorage.setItem('dental_users', JSON.stringify(localUsers));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('users').delete().eq('id', userId);
            } catch (err) {
                console.error('Supabase deleteUser Error:', err);
            }
        }
    }

    // ==========================================
    // 2. BAREMO SERVICES
    // ==========================================
    static async getBaremo() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_baremo')) || INITIAL_BAREMO;
        }
        try {
            const { data, error } = await supabaseClient.from('baremo_services').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(d => ({
                    code: d.code,
                    category: d.category,
                    name: d.name,
                    priceUSD: parseFloat(d.price_usd),
                    chairTimeMin: d.chair_time_min,
                    materials: d.materials || [],
                    hygienistBonus: parseFloat(d.hygienist_bonus || 0)
                }));
                localStorage.setItem('dental_baremo', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_baremo')) || INITIAL_BAREMO;
        } catch (err) {
            console.error('Supabase getBaremo Error:', err);
            return JSON.parse(localStorage.getItem('dental_baremo')) || INITIAL_BAREMO;
        }
    }

    static async saveBaremoService(srvObj) {
        let localBaremo = JSON.parse(localStorage.getItem('dental_baremo')) || INITIAL_BAREMO;
        const idx = localBaremo.findIndex(s => s.code === srvObj.code);
        if (idx >= 0) localBaremo[idx] = srvObj;
        else localBaremo.push(srvObj);
        localStorage.setItem('dental_baremo', JSON.stringify(localBaremo));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('baremo_services').upsert({
                    code: srvObj.code,
                    category: srvObj.category,
                    name: srvObj.name,
                    price_usd: srvObj.priceUSD,
                    chair_time_min: srvObj.chairTimeMin,
                    materials: srvObj.materials || [],
                    hygienist_bonus: srvObj.hygienistBonus || 0
                });
                if (error) console.error('Supabase saveBaremoService Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveBaremoService Exception:', err);
            }
        }
    }

    static async deleteBaremoService(code) {
        let localBaremo = JSON.parse(localStorage.getItem('dental_baremo')) || INITIAL_BAREMO;
        localBaremo = localBaremo.filter(s => s.code !== code);
        localStorage.setItem('dental_baremo', JSON.stringify(localBaremo));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('baremo_services').delete().eq('code', code);
            } catch (err) {
                console.error('Supabase deleteBaremoService Error:', err);
            }
        }
    }

    // ==========================================
    // 3. PATIENTS & EHR
    // ==========================================
    static async getPatients() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS;
        }
        try {
            const { data, error } = await supabaseClient.from('patients').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(p => ({
                    id: p.id,
                    fullname: p.fullname,
                    birthdate: p.birthdate,
                    phone: p.phone,
                    email: p.email || '',
                    occupation: p.occupation || '',
                    allergies: p.allergies || [],
                    systemic: p.systemic || [],
                    medication: p.medication || '',
                    emergencyContact: p.emergency_contact || '',
                    status: p.status || 'Activo',
                    odontogramData: p.odontogram_data || {},
                    clinicalNotes: p.clinical_notes || (p.metadata && p.metadata._fallback_clinical_notes) || [],
                    photos: p.photos || (p.metadata && p.metadata._fallback_photos) || [],
                    payments: p.payments || (p.metadata && p.metadata._fallback_payments) || [],
                    metadata: p.metadata || {}
                }));
                localStorage.setItem('dental_patients', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS;
        } catch (err) {
            console.error('Supabase getPatients Error:', err);
            return JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS;
        }
    }

    static async savePatient(patientObj) {
        let localPatients = JSON.parse(localStorage.getItem('dental_patients')) || [];
        const idx = localPatients.findIndex(p => p.id === patientObj.id);
        if (idx >= 0) localPatients[idx] = patientObj;
        else localPatients.push(patientObj);
        localStorage.setItem('dental_patients', JSON.stringify(localPatients));

        if (this.isCloudConnected()) {
            try {
                // Try saving with the full schema first
                const { error } = await supabaseClient.from('patients').upsert({
                    id: patientObj.id,
                    fullname: patientObj.fullname,
                    birthdate: patientObj.birthdate,
                    phone: patientObj.phone,
                    email: patientObj.email || null,
                    occupation: patientObj.occupation || null,
                    allergies: patientObj.allergies || [],
                    systemic: patientObj.systemic || [],
                    medication: patientObj.medication || null,
                    emergency_contact: patientObj.emergencyContact || null,
                    status: patientObj.status || 'Activo',
                    odontogram_data: patientObj.odontogramData || {},
                    clinical_notes: patientObj.clinicalNotes || [],
                    photos: patientObj.photos || [],
                    payments: patientObj.payments || [],
                    metadata: patientObj.metadata || {}
                });
                
                if (error) {
                    console.error('Supabase savePatient Cloud Error:', error);
                    // Fallback: If it's a missing columns error, try saving without the missing columns
                    if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
                        console.warn('Attempting savePatient fallback without clinical_notes/photos/payments columns...');
                        const fallbackPatient = {
                            id: patientObj.id,
                            fullname: patientObj.fullname,
                            birthdate: patientObj.birthdate,
                            phone: patientObj.phone,
                            email: patientObj.email || null,
                            occupation: patientObj.occupation || null,
                            allergies: patientObj.allergies || [],
                            systemic: patientObj.systemic || [],
                            medication: patientObj.medication || null,
                            emergency_contact: patientObj.emergencyContact || null,
                            status: patientObj.status || 'Activo',
                            odontogram_data: patientObj.odontogramData || {}
                        };
                        
                        fallbackPatient.metadata = {
                            ...(patientObj.metadata || {}),
                            _fallback_clinical_notes: patientObj.clinicalNotes || [],
                            _fallback_photos: patientObj.photos || [],
                            _fallback_payments: patientObj.payments || []
                        };
                        
                        const { error: fallbackError } = await supabaseClient.from('patients').upsert(fallbackPatient);
                        if (fallbackError) {
                            console.error('Supabase savePatient Fallback Error:', fallbackError);
                        } else {
                            console.log('Patient saved successfully via fallback!');
                        }
                    }
                }
            } catch (err) {
                console.error('Supabase savePatient Exception:', err);
            }
        }
    }

    static async deletePatient(patientId) {
        let localPatients = JSON.parse(localStorage.getItem('dental_patients')) || [];
        localPatients = localPatients.filter(p => p.id !== patientId);
        localStorage.setItem('dental_patients', JSON.stringify(localPatients));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('patients').delete().eq('id', patientId);
            } catch (err) {
                console.error('Supabase deletePatient Error:', err);
            }
        }
    }

    // ==========================================
    // 4. APPOINTMENTS
    // ==========================================
    static async getAppointments() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        }
        try {
            const { data, error } = await supabaseClient.from('appointments').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(a => ({
                    id: a.id,
                    patientId: a.patient_id,
                    patientName: a.patient_name,
                    time: a.appointment_time,
                    treatment: a.treatment,
                    status: a.status,
                    isTomorrow: a.is_tomorrow
                }));
                localStorage.setItem('dental_appointments', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        } catch (err) {
            console.error('Supabase getAppointments Error:', err);
            return JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        }
    }

    static async saveAppointment(appointmentObj) {
        let localAppts = JSON.parse(localStorage.getItem('dental_appointments')) || [];
        localAppts.push(appointmentObj);
        localStorage.setItem('dental_appointments', JSON.stringify(localAppts));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('appointments').upsert({
                    id: appointmentObj.id,
                    patient_id: appointmentObj.patientId || null,
                    patient_name: appointmentObj.patientName,
                    appointment_time: appointmentObj.time,
                    treatment: appointmentObj.treatment,
                    status: appointmentObj.status || 'Programada',
                    is_tomorrow: appointmentObj.isTomorrow || false
                });
                if (error) console.error('Supabase saveAppointment Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveAppointment Exception:', err);
            }
        }
    }

    static async deleteAppointment(apptId) {
        let localAppts = JSON.parse(localStorage.getItem('dental_appointments')) || [];
        localAppts = localAppts.filter(a => a.id !== apptId);
        localStorage.setItem('dental_appointments', JSON.stringify(localAppts));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('appointments').delete().eq('id', apptId);
            } catch (err) {
                console.error('Supabase deleteAppointment Error:', err);
            }
        }
    }

    // ==========================================
    // 5. KARDEX INVENTORY
    // ==========================================
    static async getInventory() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_kardex')) || INITIAL_INVENTORY;
        }
        try {
            const { data, error } = await supabaseClient.from('kardex_inventory').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(i => ({
                    code: i.code,
                    name: i.name,
                    category: i.category,
                    currentStock: i.current_stock,
                    minStock: i.min_stock,
                    unit: i.unit,
                    expiryDate: i.expiry_date
                }));
                localStorage.setItem('dental_kardex', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_kardex')) || INITIAL_INVENTORY;
        } catch (err) {
            console.error('Supabase getInventory Error:', err);
            return JSON.parse(localStorage.getItem('dental_kardex')) || INITIAL_INVENTORY;
        }
    }

    static async saveInventoryItem(itemObj) {
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || INITIAL_INVENTORY;
        const idx = localInv.findIndex(i => i.code === itemObj.code);
        if (idx >= 0) localInv[idx] = itemObj;
        else localInv.push(itemObj);
        localStorage.setItem('dental_kardex', JSON.stringify(localInv));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('kardex_inventory').upsert({
                    code: itemObj.code,
                    name: itemObj.name,
                    category: itemObj.category,
                    current_stock: itemObj.currentStock,
                    min_stock: itemObj.minStock,
                    unit: itemObj.unit,
                    expiry_date: itemObj.expiryDate || null
                });
                if (error) console.error('Supabase saveInventoryItem Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveInventoryItem Exception:', err);
            }
        }
    }

    static async deleteInventoryItem(code) {
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || INITIAL_INVENTORY;
        localInv = localInv.filter(i => i.code !== code);
        localStorage.setItem('dental_kardex', JSON.stringify(localInv));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('kardex_inventory').delete().eq('code', code);
            } catch (err) {
                console.error('Supabase deleteInventoryItem Error:', err);
            }
        }
    }

    // ==========================================
    // 6. INVOICES
    // ==========================================
    static async getInvoices() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_invoices')) || [];
        }
        try {
            const { data, error } = await supabaseClient.from('invoices').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(i => ({
                    id: i.id,
                    patientId: i.patient_id,
                    invoiceDate: i.invoice_date,
                    paymentMethod: i.payment_method,
                    paymentTerms: i.payment_terms,
                    currency: i.currency,
                    items: i.items || [],
                    totalRef: parseFloat(i.total_ref),
                    totalBcv: parseFloat(i.total_bcv),
                    status: i.status || 'Emitida',
                    footerText: i.footer_text
                }));
                localStorage.setItem('dental_invoices', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_invoices')) || [];
        } catch (err) {
            console.error('Supabase getInvoices Error:', err);
            return JSON.parse(localStorage.getItem('dental_invoices')) || [];
        }
    }

    static async saveInvoice(invoiceObj) {
        let localInvs = JSON.parse(localStorage.getItem('dental_invoices')) || [];
        const idx = localInvs.findIndex(i => i.id === invoiceObj.id);
        if (idx >= 0) localInvs[idx] = invoiceObj;
        else localInvs.push(invoiceObj);
        localStorage.setItem('dental_invoices', JSON.stringify(localInvs));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('invoices').upsert({
                    id: invoiceObj.id,
                    patient_id: invoiceObj.patientId,
                    invoice_date: invoiceObj.invoiceDate,
                    payment_method: invoiceObj.paymentMethod,
                    payment_terms: invoiceObj.paymentTerms,
                    currency: invoiceObj.currency || 'REF',
                    items: invoiceObj.items || [],
                    total_ref: invoiceObj.totalRef,
                    total_bcv: invoiceObj.totalBcv,
                    status: invoiceObj.status || 'Emitida',
                    footer_text: invoiceObj.footerText
                });
                if (error) console.error('Supabase saveInvoice Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveInvoice Exception:', err);
            }
        }
    }

    static async deleteInvoice(invoiceId) {
        let localInvs = JSON.parse(localStorage.getItem('dental_invoices')) || [];
        localInvs = localInvs.filter(i => i.id !== invoiceId);
        localStorage.setItem('dental_invoices', JSON.stringify(localInvs));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('invoices').delete().eq('id', invoiceId);
            } catch (err) {
                console.error('Supabase deleteInvoice Error:', err);
            }
        }
    }

    // ==========================================
    // 7. PROVIDER BILLS (Cuentas por pagar)
    // ==========================================
    static async getProviderBills() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        }
        try {
            const { data, error } = await supabaseClient.from('provider_bills').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(b => ({
                    id: b.id,
                    providerName: b.provider_name,
                    serviceName: b.service_name,
                    amount: parseFloat(b.amount),
                    dueDate: b.due_date,
                    status: b.status || 'Pendiente'
                }));
                localStorage.setItem('dental_provider_bills', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        } catch (err) {
            console.error('Supabase getProviderBills Error:', err);
            return JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        }
    }

    static async saveProviderBill(billObj) {
        let localBills = JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        const idx = localBills.findIndex(b => b.id === billObj.id);
        if (idx >= 0) localBills[idx] = billObj;
        else localBills.push(billObj);
        localStorage.setItem('dental_provider_bills', JSON.stringify(localBills));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('provider_bills').upsert({
                    id: billObj.id,
                    provider_name: billObj.providerName,
                    service_name: billObj.serviceName,
                    amount: billObj.amount,
                    due_date: billObj.dueDate,
                    status: billObj.status || 'Pendiente'
                });
                if (error) console.error('Supabase saveProviderBill Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveProviderBill Exception:', err);
            }
        }
    }

    static async deleteProviderBill(billId) {
        let localBills = JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        localBills = localBills.filter(b => b.id !== billId);
        localStorage.setItem('dental_provider_bills', JSON.stringify(localBills));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('provider_bills').delete().eq('id', billId);
            } catch (err) {
                console.error('Supabase deleteProviderBill Error:', err);
            }
        }
    }

    // ==========================================
    // 8. STATIONERY CONFIG
    // ==========================================
    static async getStationeryConfig() {
        const defaultDoc = {
            id: 'default',
            headerText: 'DentalCare Pro - Clínica Odontológica Especializada\nDr. Alejandro Silva - C.O.V-14920\nAv. Principal, Mérida - WhatsApp: +584141234567',
            footerText: 'Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.',
            logoUrl: ''
        };
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_stationery_config')) || defaultDoc;
        }
        try {
            const { data, error } = await supabaseClient.from('stationery_config').select('*').eq('id', 'default');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = {
                    id: data[0].id,
                    headerText: data[0].header_text,
                    footerText: data[0].footer_text,
                    logoUrl: data[0].logo_url || ''
                };
                localStorage.setItem('dental_stationery_config', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_stationery_config')) || defaultDoc;
        } catch (err) {
            console.error('Supabase getStationeryConfig Error:', err);
            return JSON.parse(localStorage.getItem('dental_stationery_config')) || defaultDoc;
        }
    }

    static async saveStationeryConfig(configObj) {
        localStorage.setItem('dental_stationery_config', JSON.stringify(configObj));

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('stationery_config').upsert({
                    id: 'default',
                    header_text: configObj.headerText,
                    footer_text: configObj.footerText,
                    logo_url: configObj.logoUrl || null
                });
                if (error) console.error('Supabase saveStationeryConfig Cloud Error:', error);
            } catch (err) {
                console.error('Supabase saveStationeryConfig Exception:', err);
            }
        }
    }
}

window.SupabaseDataService = SupabaseDataService;
