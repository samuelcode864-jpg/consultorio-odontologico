/* ==========================================================================
   DENTALCARE PRO - SUPABASE LIVE DATABASE CLIENT CONNECTOR
   Realtime Cloud Persistence for Patients, EHR, Appointments, Inventory & Baremo
   ========================================================================== */

const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://tudymiytiwcyrjtptfvi.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) || 'sb_publishable_W6jtz60qq9OItHaRxDKtag_65DoMEKv';

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
    // 1. BAREMO SERVICES
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
                    materials: d.materials || []
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
                await supabaseClient.from('baremo_services').upsert({
                    code: srvObj.code,
                    category: srvObj.category,
                    name: srvObj.name,
                    price_usd: srvObj.priceUSD,
                    chair_time_min: srvObj.chairTimeMin,
                    materials: srvObj.materials || []
                });
            } catch (err) {
                console.error('Supabase saveBaremoService Error:', err);
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
    // 2. PATIENTS & EHR
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
                    clinicalNotes: p.clinical_notes || [],
                    photos: p.photos || [],
                    payments: p.payments || []
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
                await supabaseClient.from('patients').upsert({
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
                });
            } catch (err) {
                console.error('Supabase savePatient Error:', err);
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
    // 3. APPOINTMENTS
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
                await supabaseClient.from('appointments').upsert({
                    id: appointmentObj.id,
                    patient_id: appointmentObj.patientId || null,
                    patient_name: appointmentObj.patientName,
                    appointment_time: appointmentObj.time,
                    treatment: appointmentObj.treatment,
                    status: appointmentObj.status || 'Programada',
                    is_tomorrow: appointmentObj.isTomorrow || false
                });
            } catch (err) {
                console.error('Supabase saveAppointment Error:', err);
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
    // 4. KARDEX INVENTORY
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
                await supabaseClient.from('kardex_inventory').upsert({
                    code: itemObj.code,
                    name: itemObj.name,
                    category: itemObj.category,
                    current_stock: itemObj.currentStock,
                    min_stock: itemObj.minStock,
                    unit: itemObj.unit,
                    expiry_date: itemObj.expiryDate || null
                });
            } catch (err) {
                console.error('Supabase saveInventoryItem Error:', err);
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
}

window.SupabaseDataService = SupabaseDataService;
