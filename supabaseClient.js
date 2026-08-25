/* ==========================================================================
   DENTALCARE PRO - SUPABASE LIVE CLOUD DATABASE CLIENT CONNECTOR
   Universal Multi-device Cloud Synchronization Engine
   Synchronizes Users, Doctors, Patients, EHR, Budgets, Invoices, Stationery,
   Logos, Digital Signatures, Appointments and Inventory across Desktop & Mobile.
   ========================================================================== */

const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://tudymiytiwcyrjtptfvi.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZHltaXl0aXdjeXJqdHB0ZnZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMjMxNzQsImV4cCI6MjEwMTg5OTE3NH0.wP-vsBmc7ezIx8Uq_hTqye44Gxl75jkGZSxDDg-3Aj8';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase Universal Cloud Database Connected! Project: tudymiytiwcyrjtptfvi');
    } catch (e) {
        console.warn('⚠️ Supabase connection warning:', e);
    }
}

class SupabaseDataService {
    static isCloudConnected() {
        return supabaseClient !== null;
    }

    // ==========================================
    // 1. SYSTEM USERS & DOCTOR PROFILES / SIGNATURES
    // ==========================================
    static async getUsers() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_users')) || (typeof INITIAL_USERS !== 'undefined' ? INITIAL_USERS : []);
        }
        try {
            const { data, error } = await supabaseClient.from('users').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(u => {
                    let docProfile = u.doctor_profile || {};
                    let licenseStr = u.license || '';

                    // Unpack JSON encoded license if present
                    if (licenseStr && licenseStr.startsWith('{')) {
                        try {
                            const parsedLicense = JSON.parse(licenseStr);
                            licenseStr = parsedLicense.license || parsedLicense.licenseNumber || '';
                            if (parsedLicense.doctorProfile) {
                                docProfile = { ...parsedLicense.doctorProfile, ...docProfile };
                            }
                        } catch (e) { /* use raw string */ }
                    }

                    return {
                        id: u.id,
                        fullname: u.fullname,
                        email: u.email,
                        password: u.password,
                        role: u.role,
                        license: licenseStr,
                        status: u.status || 'Activo',
                        createdAt: u.created_at ? u.created_at.split('T')[0] : '2026-01-10',
                        doctorProfile: docProfile,
                        doctor_profile: docProfile
                    };
                });
                localStorage.setItem('dental_users', JSON.stringify(mapped));
                return mapped;
            }
            return JSON.parse(localStorage.getItem('dental_users')) || (typeof INITIAL_USERS !== 'undefined' ? INITIAL_USERS : []);
        } catch (err) {
            console.error('Supabase getUsers Error:', err);
            return JSON.parse(localStorage.getItem('dental_users')) || (typeof INITIAL_USERS !== 'undefined' ? INITIAL_USERS : []);
        }
    }

    static async saveUser(userObj) {
        let localUsers = JSON.parse(localStorage.getItem('dental_users')) || [];
        const idx = localUsers.findIndex(u => u.id === userObj.id || (u.email && userObj.email && u.email.toLowerCase() === userObj.email.toLowerCase()));
        if (idx >= 0) localUsers[idx] = userObj;
        else localUsers.push(userObj);
        localStorage.setItem('dental_users', JSON.stringify(localUsers));

        if (this.isCloudConnected()) {
            try {
                const docProf = userObj.doctorProfile || userObj.doctor_profile || {};
                const licensePayload = JSON.stringify({
                    license: userObj.license || '',
                    doctorProfile: docProf
                });

                // Attempt 1: Full columns (including doctor_profile if exists)
                let { error: err1 } = await supabaseClient.from('users').upsert({
                    id: userObj.id,
                    fullname: userObj.fullname,
                    email: userObj.email,
                    password: userObj.password,
                    role: userObj.role,
                    license: licensePayload,
                    status: userObj.status || 'Activo',
                    doctor_profile: docProf
                });

                // Attempt 2: If doctor_profile column doesn't exist, save via license JSON field
                if (err1) {
                    let { error: err2 } = await supabaseClient.from('users').upsert({
                        id: userObj.id,
                        fullname: userObj.fullname,
                        email: userObj.email,
                        password: userObj.password,
                        role: userObj.role,
                        license: licensePayload,
                        status: userObj.status || 'Activo'
                    });
                    if (err2) console.error('Supabase saveUser Cloud Error:', err2);
                }
            } catch (err) {
                console.error('Supabase saveUser Exception:', err);
            }
        }
    }

    static async deleteUser(userId) {
        let localUsers = JSON.parse(localStorage.getItem('dental_users')) || [];
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
            return JSON.parse(localStorage.getItem('dental_baremo')) || (typeof INITIAL_BAREMO !== 'undefined' ? INITIAL_BAREMO : []);
        }
        try {
            const { data, error } = await supabaseClient.from('baremo_services').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const mapped = data.map(d => ({
                    code: d.code,
                    category: d.category,
                    name: d.name,
                    priceUSD: parseFloat(d.price_usd || 0),
                    chairTimeMin: d.chair_time_min,
                    materials: d.materials || [],
                    hygienistBonus: parseFloat(d.hygienist_bonus || 0)
                }));
                localStorage.setItem('dental_baremo', JSON.stringify(mapped));
                return mapped;
            }
            // If cloud baremo is empty, seed it with INITIAL_BAREMO
            if (typeof INITIAL_BAREMO !== 'undefined' && INITIAL_BAREMO.length > 0) {
                for (const srv of INITIAL_BAREMO) {
                    await this.saveBaremoService(srv);
                }
                return INITIAL_BAREMO;
            }
            return JSON.parse(localStorage.getItem('dental_baremo')) || [];
        } catch (err) {
            console.error('Supabase getBaremo Error:', err);
            return JSON.parse(localStorage.getItem('dental_baremo')) || (typeof INITIAL_BAREMO !== 'undefined' ? INITIAL_BAREMO : []);
        }
    }

    static async saveBaremoService(srvObj) {
        let localBaremo = JSON.parse(localStorage.getItem('dental_baremo')) || [];
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
        let localBaremo = JSON.parse(localStorage.getItem('dental_baremo')) || [];
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
    // 3. PATIENTS, MEDICAL HISTORIES, EVOLUTIONS & PHOTOS
    // ==========================================
    static async getPatients() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_patients')) || (typeof INITIAL_PATIENTS !== 'undefined' ? INITIAL_PATIENTS : []);
        }
        try {
            const { data, error } = await supabaseClient.from('patients').select('*');
            if (error) throw error;
            if (data) {
                // Filter out system configuration or invoice/budget records stored in patients table
                const realPatients = data.filter(p => {
                    if (!p.id) return false;
                    const idStr = String(p.id);
                    if (idStr.startsWith('SYS-') || idStr.startsWith('PRE-') || idStr.startsWith('FAC-') || idStr.startsWith('INV-') || idStr.startsWith('BILL-')) return false;
                    if (p.odontogram_data && (p.odontogram_data._is_system_config || p.odontogram_data._is_invoice || p.odontogram_data._is_bill)) return false;
                    return true;
                });

                const mapped = realPatients.map(p => {
                    const od = p.odontogram_data || {};
                    const ext = od._app_extended || {};

                    // Extract actual odontogram tooth states by stripping metadata keys
                    const toothStates = {};
                    Object.keys(od).forEach(k => {
                        if (!k.startsWith('_')) toothStates[k] = od[k];
                    });

                    return {
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
                        odontogramData: toothStates,
                        clinicalNotes: p.clinical_notes || ext.clinicalNotes || (p.metadata && p.metadata._fallback_clinical_notes) || [],
                        sessions: ext.sessions || ext.clinicalNotes || p.clinical_notes || [],
                        photos: p.photos || ext.photos || (p.metadata && p.metadata._fallback_photos) || [],
                        payments: p.payments || ext.payments || (p.metadata && p.metadata._fallback_payments) || [],
                        metadata: p.metadata || ext.metadata || {}
                    };
                });

                localStorage.setItem('dental_patients', JSON.stringify(mapped));
                return mapped;
            }
            return [];
        } catch (err) {
            console.error('Supabase getPatients Error:', err);
            return JSON.parse(localStorage.getItem('dental_patients')) || (typeof INITIAL_PATIENTS !== 'undefined' ? INITIAL_PATIENTS : []);
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
                // Bundle complete extended attributes inside odontogram_data JSONB to ensure 100% cloud persistence
                const packedOdontogramData = {
                    ...(patientObj.odontogramData || {}),
                    _app_extended: {
                        clinicalNotes: patientObj.clinicalNotes || [],
                        sessions: patientObj.sessions || patientObj.clinicalNotes || [],
                        photos: patientObj.photos || [],
                        payments: patientObj.payments || [],
                        metadata: patientObj.metadata || {}
                    }
                };

                const payload = {
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
                    odontogram_data: packedOdontogramData
                };

                // Try upserting to patients table
                let { error: err } = await supabaseClient.from('patients').upsert(payload);
                if (err) {
                    console.error('Supabase savePatient Cloud Error:', err.message);
                } else {
                    console.log('✅ Patient synced to Supabase Cloud:', patientObj.fullname);
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
            return JSON.parse(localStorage.getItem('dental_appointments')) || (typeof INITIAL_APPOINTMENTS !== 'undefined' ? INITIAL_APPOINTMENTS : []);
        }
        try {
            const { data, error } = await supabaseClient.from('appointments').select('*');
            if (error) throw error;
            if (data) {
                const mapped = data.map(a => ({
                    id: a.id,
                    patientId: a.patient_id,
                    patientName: a.patient_name,
                    time: a.appointment_time,
                    treatment: a.treatment,
                    status: a.status || 'Programada',
                    isTomorrow: a.is_tomorrow || false,
                    date: a.appointment_date || (a.is_tomorrow ? 'tomorrow' : 'today')
                }));
                localStorage.setItem('dental_appointments', JSON.stringify(mapped));
                return mapped;
            }
            return [];
        } catch (err) {
            console.error('Supabase getAppointments Error:', err);
            return JSON.parse(localStorage.getItem('dental_appointments')) || (typeof INITIAL_APPOINTMENTS !== 'undefined' ? INITIAL_APPOINTMENTS : []);
        }
    }

    static async saveAppointment(appointmentObj) {
        let localAppts = JSON.parse(localStorage.getItem('dental_appointments')) || [];
        const idx = localAppts.findIndex(a => a.id === appointmentObj.id);
        if (idx >= 0) localAppts[idx] = appointmentObj;
        else localAppts.push(appointmentObj);
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
            return JSON.parse(localStorage.getItem('dental_kardex')) || (typeof INITIAL_INVENTORY !== 'undefined' ? INITIAL_INVENTORY : []);
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
            return JSON.parse(localStorage.getItem('dental_kardex')) || (typeof INITIAL_INVENTORY !== 'undefined' ? INITIAL_INVENTORY : []);
        } catch (err) {
            console.error('Supabase getInventory Error:', err);
            return JSON.parse(localStorage.getItem('dental_kardex')) || (typeof INITIAL_INVENTORY !== 'undefined' ? INITIAL_INVENTORY : []);
        }
    }

    static async saveInventoryItem(itemObj) {
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || [];
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
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || [];
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
    // 6. INVOICES & PRESUPUESTOS (BUDGETS)
    // ==========================================
    static async getInvoices() {
        let cloudInvoices = [];

        if (this.isCloudConnected()) {
            try {
                // 1. Check for invoices/budgets stored in patients table with JSONB
                const { data: pData } = await supabaseClient.from('patients').select('*');
                if (pData && pData.length > 0) {
                    const budgetRows = pData.filter(p => {
                        if (!p.id) return false;
                        const sId = String(p.id);
                        return sId.startsWith('PRE-') || sId.startsWith('FAC-') || sId.startsWith('INV-') || (p.odontogram_data && p.odontogram_data._is_invoice);
                    });

                    budgetRows.forEach(row => {
                        const od = row.odontogram_data || {};
                        cloudInvoices.push({
                            id: od.id || row.id,
                            patientId: od.patientId || row.phone,
                            invoiceDate: od.invoiceDate || row.birthdate,
                            paymentMethod: od.paymentMethod || 'Efectivo USD',
                            paymentTerms: od.paymentTerms || 'Contado',
                            currency: od.currency || 'REF',
                            items: od.items || [],
                            totalRef: parseFloat(od.totalRef || 0),
                            totalBcv: parseFloat(od.totalBcv || 0),
                            status: od.status || row.status || 'Emitida',
                            footerText: od.footerText || '',
                            metadata: od.metadata || {}
                        });
                    });
                }

                // 2. Also check if dedicated invoices table exists
                const { data: invData, error: invErr } = await supabaseClient.from('invoices').select('*');
                if (!invErr && invData && invData.length > 0) {
                    invData.forEach(i => {
                        if (!cloudInvoices.find(c => c.id === i.id)) {
                            cloudInvoices.push({
                                id: i.id,
                                patientId: i.patient_id,
                                invoiceDate: i.invoice_date,
                                paymentMethod: i.payment_method,
                                paymentTerms: i.payment_terms,
                                currency: i.currency,
                                items: i.items || [],
                                totalRef: parseFloat(i.total_ref || 0),
                                totalBcv: parseFloat(i.total_bcv || 0),
                                status: i.status || 'Emitida',
                                footerText: i.footer_text,
                                metadata: i.metadata || {}
                            });
                        }
                    });
                }
            } catch (err) {
                console.warn('Supabase getInvoices sync warn:', err);
            }
        }

        if (cloudInvoices.length > 0) {
            localStorage.setItem('dental_invoices', JSON.stringify(cloudInvoices));
            return cloudInvoices;
        }

        return JSON.parse(localStorage.getItem('dental_invoices')) || [];
    }

    static async saveInvoice(invoiceObj) {
        let localInvs = JSON.parse(localStorage.getItem('dental_invoices')) || [];
        const idx = localInvs.findIndex(i => i.id === invoiceObj.id);
        if (idx >= 0) localInvs[idx] = invoiceObj;
        else localInvs.push(invoiceObj);
        localStorage.setItem('dental_invoices', JSON.stringify(localInvs));

        if (this.isCloudConnected()) {
            try {
                // 1. Guaranteed persistence in patients table with JSONB
                const cloudPayload = {
                    id: invoiceObj.id,
                    fullname: 'Presupuesto: ' + (invoiceObj.id || ''),
                    birthdate: invoiceObj.invoiceDate || new Date().toISOString().split('T')[0],
                    phone: invoiceObj.patientId || '',
                    status: invoiceObj.status || 'Emitida',
                    odontogram_data: {
                        _is_invoice: true,
                        id: invoiceObj.id,
                        patientId: invoiceObj.patientId,
                        invoiceDate: invoiceObj.invoiceDate,
                        paymentMethod: invoiceObj.paymentMethod,
                        paymentTerms: invoiceObj.paymentTerms,
                        currency: invoiceObj.currency || 'REF',
                        items: invoiceObj.items || [],
                        totalRef: invoiceObj.totalRef || 0,
                        totalBcv: invoiceObj.totalBcv || 0,
                        status: invoiceObj.status || 'Emitida',
                        footerText: invoiceObj.footerText || '',
                        metadata: invoiceObj.metadata || {}
                    }
                };

                await supabaseClient.from('patients').upsert(cloudPayload);

                // 2. Also try invoices table if available
                await supabaseClient.from('invoices').upsert({
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
                console.log('✅ Invoice / Budget synced to Supabase Cloud:', invoiceObj.id);
            } catch (err) {
                console.warn('Supabase saveInvoice caught:', err);
            }
        }
    }

    static async deleteInvoice(invoiceId) {
        let localInvs = JSON.parse(localStorage.getItem('dental_invoices')) || [];
        localInvs = localInvs.filter(i => i.id !== invoiceId);
        localStorage.setItem('dental_invoices', JSON.stringify(localInvs));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('patients').delete().eq('id', invoiceId);
                await supabaseClient.from('invoices').delete().eq('id', invoiceId);
            } catch (err) {
                console.error('Supabase deleteInvoice Error:', err);
            }
        }
    }

    // ==========================================
    // 7. PROVIDER BILLS (CUENTAS POR PAGAR)
    // ==========================================
    static async getProviderBills() {
        let cloudBills = [];

        if (this.isCloudConnected()) {
            try {
                // 1. Check for bills in patients table
                const { data: pData } = await supabaseClient.from('patients').select('*');
                if (pData && pData.length > 0) {
                    const billRows = pData.filter(p => {
                        if (!p.id) return false;
                        const sId = String(p.id);
                        return sId.startsWith('BILL-') || (p.odontogram_data && p.odontogram_data._is_bill);
                    });

                    billRows.forEach(row => {
                        const od = row.odontogram_data || {};
                        cloudBills.push({
                            id: od.id || row.id,
                            providerName: od.providerName || row.fullname,
                            serviceName: od.serviceName || '',
                            amount: parseFloat(od.amount || 0),
                            dueDate: od.dueDate || row.birthdate,
                            status: od.status || row.status || 'Pendiente'
                        });
                    });
                }

                // 2. Check dedicated provider_bills table
                const { data: bData, error: bErr } = await supabaseClient.from('provider_bills').select('*');
                if (!bErr && bData && bData.length > 0) {
                    bData.forEach(b => {
                        if (!cloudBills.find(c => c.id === b.id)) {
                            cloudBills.push({
                                id: b.id,
                                providerName: b.provider_name,
                                serviceName: b.service_name,
                                amount: parseFloat(b.amount || 0),
                                dueDate: b.due_date,
                                status: b.status || 'Pendiente'
                            });
                        }
                    });
                }
            } catch (err) {
                console.warn('Supabase getProviderBills sync warn:', err);
            }
        }

        if (cloudBills.length > 0) {
            localStorage.setItem('dental_provider_bills', JSON.stringify(cloudBills));
            return cloudBills;
        }

        return JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
    }

    static async saveProviderBill(billObj) {
        let localBills = JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        const idx = localBills.findIndex(b => b.id === billObj.id);
        if (idx >= 0) localBills[idx] = billObj;
        else localBills.push(billObj);
        localStorage.setItem('dental_provider_bills', JSON.stringify(localBills));

        if (this.isCloudConnected()) {
            try {
                // 1. Guaranteed persistence in patients table with JSONB
                const cloudPayload = {
                    id: billObj.id,
                    fullname: billObj.providerName || 'Proveedor',
                    birthdate: billObj.dueDate || new Date().toISOString().split('T')[0],
                    phone: '',
                    status: billObj.status || 'Pendiente',
                    odontogram_data: {
                        _is_bill: true,
                        id: billObj.id,
                        providerName: billObj.providerName,
                        serviceName: billObj.serviceName,
                        amount: billObj.amount,
                        dueDate: billObj.dueDate,
                        status: billObj.status || 'Pendiente'
                    }
                };

                await supabaseClient.from('patients').upsert(cloudPayload);

                // 2. Also try provider_bills table
                await supabaseClient.from('provider_bills').upsert({
                    id: billObj.id,
                    provider_name: billObj.providerName,
                    service_name: billObj.serviceName,
                    amount: billObj.amount,
                    due_date: billObj.dueDate,
                    status: billObj.status || 'Pendiente'
                });
            } catch (err) {
                console.warn('Supabase saveProviderBill caught:', err);
            }
        }
    }

    static async deleteProviderBill(billId) {
        let localBills = JSON.parse(localStorage.getItem('dental_provider_bills')) || [];
        localBills = localBills.filter(b => b.id !== billId);
        localStorage.setItem('dental_provider_bills', JSON.stringify(localBills));

        if (this.isCloudConnected()) {
            try {
                await supabaseClient.from('patients').delete().eq('id', billId);
                await supabaseClient.from('provider_bills').delete().eq('id', billId);
            } catch (err) {
                console.error('Supabase deleteProviderBill Error:', err);
            }
        }
    }

    // ==========================================
    // 8. CLINIC BRANDING, LOGO, HEADER & FOOTER
    // ==========================================
    static async getStationeryConfig() {
        const defaultDoc = {
            id: 'default',
            headerText: 'DentalCare Pro - Clínica Odontológica Especializada\nDr. Alejandro Silva - C.O.V-14920\nAv. Principal, Mérida - WhatsApp: +584141234567',
            header_text: 'DentalCare Pro - Clínica Odontológica Especializada\nDr. Alejandro Silva - C.O.V-14920\nAv. Principal, Mérida - WhatsApp: +584141234567',
            footerText: 'Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.',
            footer_text: 'Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.',
            logoUrl: '',
            logo_url: ''
        };

        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_stationery_config')) || defaultDoc;
        }

        try {
            // 1. Try dedicated SYS-CLINIC-CONFIG row in patients table (100% reliable)
            const { data: pData } = await supabaseClient.from('patients').select('*').eq('id', 'SYS-CLINIC-CONFIG');
            if (pData && pData.length > 0 && pData[0].odontogram_data) {
                const od = pData[0].odontogram_data;
                const mapped = {
                    id: 'default',
                    headerText: od.headerText || od.header_text || defaultDoc.headerText,
                    header_text: od.headerText || od.header_text || defaultDoc.headerText,
                    footerText: od.footerText || od.footer_text || defaultDoc.footerText,
                    footer_text: od.footerText || od.footer_text || defaultDoc.footerText,
                    logoUrl: od.logoUrl || od.logo_url || '',
                    logo_url: od.logoUrl || od.logo_url || ''
                };
                localStorage.setItem('dental_stationery_config', JSON.stringify(mapped));
                return mapped;
            }

            // 2. Try stationery_config table if available
            const { data, error } = await supabaseClient.from('stationery_config').select('*').eq('id', 'default');
            if (!error && data && data.length > 0) {
                const row = data[0];
                const mapped = {
                    id: 'default',
                    headerText: row.header_text || defaultDoc.headerText,
                    header_text: row.header_text || defaultDoc.headerText,
                    footerText: row.footer_text || defaultDoc.footerText,
                    footer_text: row.footer_text || defaultDoc.footerText,
                    logoUrl: row.logo_url || '',
                    logo_url: row.logo_url || ''
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
        const headerText = configObj.headerText || configObj.header_text || '';
        const footerText = configObj.footerText || configObj.footer_text || '';
        const logoUrl = configObj.logoUrl || configObj.logo_url || '';

        const normalized = {
            id: 'default',
            headerText: headerText,
            header_text: headerText,
            footerText: footerText,
            footer_text: footerText,
            logoUrl: logoUrl,
            logo_url: logoUrl
        };

        localStorage.setItem('dental_stationery_config', JSON.stringify(normalized));

        if (this.isCloudConnected()) {
            try {
                // 1. Guaranteed cloud storage inside SYS-CLINIC-CONFIG in patients table
                const sysPayload = {
                    id: 'SYS-CLINIC-CONFIG',
                    fullname: 'Configuración de Identidad Clínica',
                    birthdate: '2026-01-01',
                    phone: '',
                    status: 'Sistema',
                    odontogram_data: {
                        _is_system_config: true,
                        headerText: headerText,
                        header_text: headerText,
                        footerText: footerText,
                        footer_text: footerText,
                        logoUrl: logoUrl,
                        logo_url: logoUrl,
                        updatedAt: new Date().toISOString()
                    }
                };
                await supabaseClient.from('patients').upsert(sysPayload);

                // 2. Also try stationery_config table
                await supabaseClient.from('stationery_config').upsert({
                    id: 'default',
                    header_text: headerText,
                    footer_text: footerText,
                    logo_url: logoUrl || null
                });
                console.log('✅ Clinic branding synced to Supabase Cloud!');
            } catch (err) {
                console.warn('Supabase saveStationeryConfig caught:', err);
            }
        }
    }
}

window.SupabaseDataService = SupabaseDataService;

