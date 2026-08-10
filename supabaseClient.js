/* ==========================================================================
   DENTALCARE PRO - SUPABASE LIVE DATABASE CLIENT CONNECTOR
   Realtime Cloud Persistence for Patients, EHR, Appointments & Inventory
   ========================================================================== */

// Exact live Supabase Cloud credentials for consultorio-odontologico
const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://tudymiytiwcyrjtptfvi.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.key) || 'sb_publishable_W6jtz60qq9OItHaRxDKtag_65DoMEKv';

let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase Cloud Database Connected Successfully! Project: tudymiytiwcyrjtptfvi');
    } catch (e) {
        console.warn('⚠️ Supabase connection fallback to persistent local store:', e);
    }
}

class SupabaseDataService {
    static isCloudConnected() {
        return supabaseClient !== null;
    }

    // Sync Patients from Supabase Cloud
    static async getPatients() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS;
        }
        try {
            const { data, error } = await supabaseClient.from('patients').select('*');
            if (error) throw error;
            return data && data.length > 0 ? data : (JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS);
        } catch (err) {
            console.error('Supabase getPatients Error:', err);
            return JSON.parse(localStorage.getItem('dental_patients')) || INITIAL_PATIENTS;
        }
    }

    // Save Patient to Supabase Cloud
    static async savePatient(patientObj) {
        let localPatients = JSON.parse(localStorage.getItem('dental_patients')) || [];
        const idx = localPatients.findIndex(p => p.id === patientObj.id);
        if (idx >= 0) localPatients[idx] = patientObj;
        else localPatients.push(patientObj);
        localStorage.setItem('dental_patients', JSON.stringify(localPatients));

        if (this.isCloudConnected()) {
            try {
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
                    odontogram_data: patientObj.odontogramData || {}
                });
                if (error) console.error('Supabase savePatient Cloud Sync Error:', error);
            } catch (err) {
                console.error('Supabase Cloud Sync Exception:', err);
            }
        }
    }

    // Delete Patient from Supabase Cloud
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

    // Sync Appointments from Supabase Cloud
    static async getAppointments() {
        if (!this.isCloudConnected()) {
            return JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        }
        try {
            const { data, error } = await supabaseClient.from('appointments').select('*');
            if (error) throw error;
            return data && data.length > 0 ? data : (JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        } catch (err) {
            console.error('Supabase getAppointments Error:', err);
            return JSON.parse(localStorage.getItem('dental_appointments')) || INITIAL_APPOINTMENTS;
        }
    }

    // Save Appointment to Supabase Cloud
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
}

window.SupabaseDataService = SupabaseDataService;
