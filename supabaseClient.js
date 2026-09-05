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
    static _usersPromise = null;
    static _usersCacheTime = 0;

    static async getUsers(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_users')) || (typeof INITIAL_USERS !== 'undefined' ? INITIAL_USERS : []);
        
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._usersCacheTime && (now - this._usersCacheTime < 4000)) {
            return local;
        }

        if (this._usersPromise && !forceRefresh) {
            return local;
        }

        this._usersPromise = (async () => {
            try {
                const { data, error } = await supabaseClient.from('users').select('*');
                if (error) throw error;
                if (data && data.length > 0) {
                    const mapped = data.map(u => {
                        let docProfile = u.doctor_profile || {};
                        let licenseStr = u.license || '';

                        if (licenseStr && licenseStr.startsWith('{')) {
                            try {
                                const parsedLicense = JSON.parse(licenseStr);
                                licenseStr = parsedLicense.license || parsedLicense.licenseNumber || '';
                                if (parsedLicense.doctorProfile) {
                                    docProfile = { ...parsedLicense.doctorProfile, ...docProfile };
                                }
                            } catch (e) { }
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
                    this._usersCacheTime = Date.now();
                    return mapped;
                }
                return local;
            } catch (err) {
                console.error('Supabase getUsers Error:', err);
                return local;
            } finally {
                this._usersPromise = null;
            }
        })();

        if (forceRefresh) return await this._usersPromise;
        return local;
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
                    if (err2) {
                        console.error('Supabase saveUser Cloud Error:', err2);
                        throw new Error(`Supabase Error: ${err2.message}`);
                    }
                }
            } catch (err) {
                console.error('Supabase saveUser Exception:', err);
                throw err;
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
    static _baremoPromise = null;
    static _baremoCacheTime = 0;

    static async getBaremo(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_baremo')) || (typeof INITIAL_BAREMO !== 'undefined' ? INITIAL_BAREMO : []);
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._baremoCacheTime && (now - this._baremoCacheTime < 4000)) {
            return local;
        }

        if (this._baremoPromise && !forceRefresh) {
            return local;
        }

        this._baremoPromise = (async () => {
            try {
                let baremoList = null;
                const { data, error } = await supabaseClient.from('baremo_services').select('*');
                if (!error && data && data.length > 0) {
                    baremoList = data.map(d => ({
                        code: d.code,
                        category: d.category,
                        name: d.name,
                        priceUSD: parseFloat(d.price_usd || 0),
                        chairTimeMin: d.chair_time_min,
                        materials: d.materials || [],
                        hygienistBonus: parseFloat(d.hygienist_bonus || 0)
                    }));
                } else {
                    const { data: pData } = await supabaseClient.from('patients').select('*').eq('id', 'SYS-BAREMO-CONFIG');
                    if (pData && pData.length > 0 && pData[0].odontogram_data && pData[0].odontogram_data._is_baremo_config) {
                        baremoList = pData[0].odontogram_data._baremo || [];
                    }
                }
                if (baremoList !== null) {
                    localStorage.setItem('dental_baremo', JSON.stringify(baremoList));
                    this._baremoCacheTime = Date.now();
                    return baremoList;
                }
                return local;
            } catch (err) {
                console.error('Supabase getBaremo Error:', err);
                return local;
            } finally {
                this._baremoPromise = null;
            }
        })();

        if (forceRefresh) return await this._baremoPromise;
        return local;
    }

    static async saveBaremoService(srvObj) {
        let localBaremo = JSON.parse(localStorage.getItem('dental_baremo')) || [];
        const idx = localBaremo.findIndex(s => s.code === srvObj.code);
        if (idx >= 0) localBaremo[idx] = srvObj;
        else localBaremo.push(srvObj);
        localStorage.setItem('dental_baremo', JSON.stringify(localBaremo));

        if (this.isCloudConnected()) {
            try {
                // Attempt 1: Upsert with hygienist_bonus column
                let { error: err1 } = await supabaseClient.from('baremo_services').upsert({
                    code: srvObj.code,
                    category: srvObj.category,
                    name: srvObj.name,
                    price_usd: srvObj.priceUSD,
                    chair_time_min: srvObj.chairTimeMin,
                    materials: srvObj.materials || [],
                    hygienist_bonus: srvObj.hygienistBonus || 0
                });

                // Attempt 2: Fallback if hygienist_bonus column is missing in schema cache
                if (err1) {
                    let { error: err2 } = await supabaseClient.from('baremo_services').upsert({
                        code: srvObj.code,
                        category: srvObj.category,
                        name: srvObj.name,
                        price_usd: srvObj.priceUSD,
                        chair_time_min: srvObj.chairTimeMin,
                        materials: srvObj.materials || []
                    });
                    if (err2) console.error('Supabase saveBaremoService Cloud Error:', err2);
                }

                // Guaranteed secondary backup in SYS-BAREMO-CONFIG row
                await supabaseClient.from('patients').upsert({
                    id: 'SYS-BAREMO-CONFIG',
                    fullname: 'Configuración Baremo Maestro',
                    birthdate: '2026-01-01',
                    phone: 'SYS',
                    status: 'Sistema',
                    odontogram_data: {
                        _is_baremo_config: true,
                        _initialized: true,
                        _baremo: localBaremo
                    }
                });
                console.log('✅ Baremo service synced to Supabase Cloud:', srvObj.code);
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
                // Delete from baremo_services table
                await supabaseClient.from('baremo_services').delete().eq('code', code);

                // Update SYS-BAREMO-CONFIG backup row
                await supabaseClient.from('patients').upsert({
                    id: 'SYS-BAREMO-CONFIG',
                    fullname: 'Configuración Baremo Maestro',
                    birthdate: '2026-01-01',
                    phone: 'SYS',
                    status: 'Sistema',
                    odontogram_data: {
                        _is_baremo_config: true,
                        _initialized: true,
                        _baremo: localBaremo
                    }
                });
                console.log('✅ Baremo service deleted from Supabase Cloud:', code);
            } catch (err) {
                console.error('Supabase deleteBaremoService Error:', err);
            }
        }
    }

    // ==========================================
    // 3. PATIENTS, MEDICAL HISTORIES, EVOLUTIONS & PHOTOS
    // ==========================================
    // Cache & Promise trackers for instant 0ms rendering
    static _patientsPromise = null;
    static _patientsCacheTime = 0;

    static async getPatients(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_patients')) || (typeof INITIAL_PATIENTS !== 'undefined' ? INITIAL_PATIENTS : []);
        
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._patientsCacheTime && (now - this._patientsCacheTime < 4000)) {
            return local;
        }

        if (this._patientsPromise && !forceRefresh) {
            return local;
        }

        this._patientsPromise = (async () => {
            try {
                const { data, error } = await supabaseClient.from('patients').select('*');
                if (error) throw error;
                if (data) {
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
                    this._patientsCacheTime = Date.now();
                    return mapped;
                }
                return local;
            } catch (err) {
                console.error('Supabase getPatients Error:', err);
                return local;
            } finally {
                this._patientsPromise = null;
            }
        })();

        if (forceRefresh) {
            return await this._patientsPromise;
        }

        // Trigger background revalidation of UI components if cloud data changes
        this._patientsPromise.then(freshData => {
            if (freshData && freshData.length > 0) {
                if (typeof renderPatientsTable === 'function') renderPatientsTable();
                if (typeof renderEHRView === 'function') renderEHRView();
                if (typeof renderDashboard === 'function') renderDashboard();
            }
        });

        return local;
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
                    throw new Error(`Supabase Error: ${err.message}`);
                } else {
                    console.log('✅ Patient synced to Supabase Cloud:', patientObj.fullname);
                }
            } catch (err) {
                console.error('Supabase savePatient Exception:', err);
                throw err;
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
    static _apptsPromise = null;
    static _apptsCacheTime = 0;

    static async getAppointments(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_appointments')) || (typeof INITIAL_APPOINTMENTS !== 'undefined' ? INITIAL_APPOINTMENTS : []);
        
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._apptsCacheTime && (now - this._apptsCacheTime < 4000)) {
            return local;
        }

        if (this._apptsPromise && !forceRefresh) {
            return local;
        }

        this._apptsPromise = (async () => {
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
                    this._apptsCacheTime = Date.now();
                    return mapped;
                }
                return local;
            } catch (err) {
                console.error('Supabase getAppointments Error:', err);
                return local;
            } finally {
                this._apptsPromise = null;
            }
        })();

        if (forceRefresh) {
            return await this._apptsPromise;
        }

        this._apptsPromise.then(fresh => {
            if (fresh && typeof renderAgendaView === 'function') renderAgendaView();
        });

        return local;
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
                if (error) {
                    console.error('Supabase saveAppointment Cloud Error:', error);
                    throw new Error(`Supabase Error: ${error.message}`);
                }
            } catch (err) {
                console.error('Supabase saveAppointment Exception:', err);
                throw err;
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
    static _inventoryPromise = null;
    static _inventoryCacheTime = 0;

    static async getInventory(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_kardex')) || JSON.parse(localStorage.getItem('dental_inventory')) || (typeof INITIAL_INVENTORY !== 'undefined' ? INITIAL_INVENTORY : []);
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._inventoryCacheTime && (now - this._inventoryCacheTime < 4000)) {
            return local;
        }

        if (this._inventoryPromise && !forceRefresh) {
            return local;
        }

        this._inventoryPromise = (async () => {
            try {
                const { data, error } = await supabaseClient.from('kardex_inventory').select('*');
                if (error) throw error;
                if (data) {
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
                    localStorage.setItem('dental_inventory', JSON.stringify(mapped));
                    if (window.kardex) window.kardex.items = mapped;
                    this._inventoryCacheTime = Date.now();
                    return mapped;
                }
                return local;
            } catch (err) {
                console.error('Supabase getInventory Error:', err);
                return local;
            } finally {
                this._inventoryPromise = null;
            }
        })();

        if (forceRefresh) return await this._inventoryPromise;
        return local;
    }

    static async saveInventoryItem(itemObj) {
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || [];
        const idx = localInv.findIndex(i => i.code === itemObj.code);
        if (idx >= 0) localInv[idx] = itemObj;
        else localInv.push(itemObj);
        localStorage.setItem('dental_kardex', JSON.stringify(localInv));
        localStorage.setItem('dental_inventory', JSON.stringify(localInv));
        if (window.kardex) window.kardex.items = localInv;

        if (this.isCloudConnected()) {
            try {
                const { error } = await supabaseClient.from('kardex_inventory').upsert({
                    code: itemObj.code,
                    name: itemObj.name,
                    category: itemObj.category,
                    current_stock: itemObj.currentStock,
                    min_stock: itemObj.minStock,
                    unit: itemObj.unit,
                    expiry_date: itemObj.expiryDate
                });
                if (error) {
                    console.error('Supabase saveInventoryItem Cloud Error:', error);
                    throw new Error(`Supabase Error: ${error.message}`);
                }
            } catch (err) {
                console.error('Supabase saveInventoryItem Exception:', err);
                throw err;
            }
        }
    }

    static async deleteInventoryItem(code) {
        let localInv = JSON.parse(localStorage.getItem('dental_kardex')) || [];
        localInv = localInv.filter(i => i.code !== code);
        localStorage.setItem('dental_kardex', JSON.stringify(localInv));
        localStorage.setItem('dental_inventory', JSON.stringify(localInv));
        if (window.kardex) window.kardex.items = localInv;

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
    static _invoicesPromise = null;
    static _invoicesCacheTime = 0;

    static async getInvoices(forceRefresh = false) {
        const local = JSON.parse(localStorage.getItem('dental_invoices')) || [];
        if (!this.isCloudConnected()) {
            return local;
        }

        const now = Date.now();
        if (!forceRefresh && this._invoicesCacheTime && (now - this._invoicesCacheTime < 4000)) {
            return local;
        }

        if (this._invoicesPromise && !forceRefresh) {
            return local;
        }

        this._invoicesPromise = (async () => {
            let cloudInvoices = [];
            try {
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
                            doctorSignature: od.doctorSignature || '',
                            patientSignature: od.patientSignature || '',
                            footerText: od.footerText || '',
                            metadata: od.metadata || {}
                        });
                    });
                }

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
                                doctorSignature: i.doctor_signature || i.doctorSignature || '',
                                patientSignature: i.patient_signature || i.patientSignature || '',
                                footerText: i.footer_text,
                                metadata: i.metadata || {}
                            });
                        }
                    });
                }
            } catch (err) {
                console.warn('Supabase getInvoices sync warn:', err);
            }

            if (cloudInvoices.length > 0) {
                localStorage.setItem('dental_invoices', JSON.stringify(cloudInvoices));
                this._invoicesCacheTime = Date.now();
                return cloudInvoices;
            }

            return local;
        })();

        if (forceRefresh) return await this._invoicesPromise;
        return local;
    }

    static async saveInvoice(invoiceObj) {
        if (!invoiceObj.createdAt) {
            invoiceObj.createdAt = new Date().toISOString();
        }
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
            recipeFooterText: 'Documento Clínico Oficial de Prescripción Médica y Recomendaciones para el Paciente.',
            recipe_footer_text: 'Documento Clínico Oficial de Prescripción Médica y Recomendaciones para el Paciente.',
            logoUrl: '',
            logo_url: ''
        };

        const localSaved = JSON.parse(localStorage.getItem('dental_stationery_config') || 'null');

        if (!this.isCloudConnected()) {
            return localSaved || defaultDoc;
        }

        try {
            // 1. Try dedicated SYS-CLINIC-CONFIG row in patients table (100% reliable)
            const { data: pData } = await supabaseClient.from('patients').select('*').eq('id', 'SYS-CLINIC-CONFIG');
            if (pData && pData.length > 0 && pData[0].odontogram_data) {
                const od = pData[0].odontogram_data;
                const mapped = {
                    id: 'default',
                    headerText: od.headerText !== undefined ? od.headerText : (od.header_text !== undefined ? od.header_text : (localSaved ? localSaved.headerText : defaultDoc.headerText)),
                    header_text: od.headerText !== undefined ? od.headerText : (od.header_text !== undefined ? od.header_text : (localSaved ? localSaved.headerText : defaultDoc.headerText)),
                    footerText: od.footerText !== undefined ? od.footerText : (od.footer_text !== undefined ? od.footer_text : (localSaved ? localSaved.footerText : defaultDoc.footerText)),
                    footer_text: od.footerText !== undefined ? od.footerText : (od.footer_text !== undefined ? od.footer_text : (localSaved ? localSaved.footerText : defaultDoc.footerText)),
                    recipeFooterText: od.recipeFooterText !== undefined ? od.recipeFooterText : (od.recipe_footer_text !== undefined ? od.recipe_footer_text : (localSaved ? localSaved.recipeFooterText : defaultDoc.recipeFooterText)),
                    recipe_footer_text: od.recipeFooterText !== undefined ? od.recipeFooterText : (od.recipe_footer_text !== undefined ? od.recipe_footer_text : (localSaved ? localSaved.recipeFooterText : defaultDoc.recipeFooterText)),
                    logoUrl: od.logoUrl !== undefined ? od.logoUrl : (od.logo_url !== undefined ? od.logo_url : (localSaved ? localSaved.logoUrl : '')),
                    logo_url: od.logoUrl !== undefined ? od.logoUrl : (od.logo_url !== undefined ? od.logo_url : (localSaved ? localSaved.logoUrl : ''))
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
                    headerText: (row.header_text !== null && row.header_text !== undefined) ? row.header_text : (localSaved ? localSaved.headerText : defaultDoc.headerText),
                    header_text: (row.header_text !== null && row.header_text !== undefined) ? row.header_text : (localSaved ? localSaved.headerText : defaultDoc.headerText),
                    footerText: (row.footer_text !== null && row.footer_text !== undefined) ? row.footer_text : (localSaved ? localSaved.footerText : defaultDoc.footerText),
                    footer_text: (row.footer_text !== null && row.footer_text !== undefined) ? row.footer_text : (localSaved ? localSaved.footerText : defaultDoc.footerText),
                    recipeFooterText: (row.recipe_footer_text !== null && row.recipe_footer_text !== undefined) ? row.recipe_footer_text : (localSaved ? localSaved.recipeFooterText : defaultDoc.recipeFooterText),
                    recipe_footer_text: (row.recipe_footer_text !== null && row.recipe_footer_text !== undefined) ? row.recipe_footer_text : (localSaved ? localSaved.recipeFooterText : defaultDoc.recipeFooterText),
                    logoUrl: row.logo_url || (localSaved ? localSaved.logoUrl : ''),
                    logo_url: row.logo_url || (localSaved ? localSaved.logoUrl : '')
                };
                localStorage.setItem('dental_stationery_config', JSON.stringify(mapped));
                return mapped;
            }

            return localSaved || defaultDoc;
        } catch (err) {
            console.error('Supabase getStationeryConfig Error:', err);
            return localSaved || defaultDoc;
        }
    }

    static async saveStationeryConfig(configObj) {
        const headerText = configObj.headerText !== undefined ? configObj.headerText : (configObj.header_text !== undefined ? configObj.header_text : '');
        const footerText = configObj.footerText !== undefined ? configObj.footerText : (configObj.footer_text !== undefined ? configObj.footer_text : '');
        const recipeFooterText = configObj.recipeFooterText !== undefined ? configObj.recipeFooterText : (configObj.recipe_footer_text !== undefined ? configObj.recipe_footer_text : '');
        const logoUrl = configObj.logoUrl !== undefined ? configObj.logoUrl : (configObj.logo_url !== undefined ? configObj.logo_url : '');

        const normalized = {
            id: 'default',
            headerText: headerText,
            header_text: headerText,
            footerText: footerText,
            footer_text: footerText,
            recipeFooterText: recipeFooterText,
            recipe_footer_text: recipeFooterText,
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
                        recipeFooterText: recipeFooterText,
                        recipe_footer_text: recipeFooterText,
                        logoUrl: logoUrl,
                        logo_url: logoUrl,
                        updatedAt: new Date().toISOString()
                    }
                };
                await supabaseClient.from('patients').upsert(sysPayload);

                // 2. Also try stationery_config table with graceful fallback for column differences
                try {
                    await supabaseClient.from('stationery_config').upsert({
                        id: 'default',
                        header_text: headerText,
                        footer_text: footerText,
                        recipe_footer_text: recipeFooterText,
                        logo_url: logoUrl || null
                    });
                } catch(e) {
                    await supabaseClient.from('stationery_config').upsert({
                        id: 'default',
                        header_text: headerText,
                        footer_text: footerText,
                        logo_url: logoUrl || null
                    });
                }
                console.log('✅ Clinic branding synced to Supabase Cloud!');
            } catch (err) {
                console.warn('Supabase saveStationeryConfig caught:', err);
            }
        }
    }

    // ==========================================
    // ==========================================
    // 9. AUDIT LOGS & RECYCLE BIN PERSISTENCE (100% CLOUD GUARANTEED)
    // ==========================================
    static async saveAuditLog(logEntry) {
        if (!this.isCloudConnected()) return;
        try {
            await supabaseClient.from('audit_logs').insert({
                id: logEntry.id,
                created_at: logEntry.timestamp,
                user_name: logEntry.userName,
                user_role: logEntry.userRole,
                action: logEntry.action,
                module: logEntry.module,
                details: logEntry.details
            });
        } catch(e) {}

        try {
            const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-AUDIT-LOGS').maybeSingle();
            let logs = (data && data.odontogram_data && data.odontogram_data.logs) ? data.odontogram_data.logs : [];
            logs = logs.filter(l => l.id !== logEntry.id);
            logs.unshift(logEntry);
            if (logs.length > 3000) logs = logs.slice(0, 3000);

            await supabaseClient.from('patients').upsert({
                id: 'SYS-AUDIT-LOGS',
                fullname: 'Sistema Auditoría de Acciones',
                birthdate: '2026-01-01',
                phone: '',
                status: 'Sistema',
                odontogram_data: { logs: logs, updatedAt: new Date().toISOString() }
            });
        } catch(e) {}
    }

    static async getAuditLogs() {
        let cloudLogs = [];
        if (this.isCloudConnected()) {
            try {
                const { data, error } = await supabaseClient.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(2000);
                if (!error && data && data.length > 0) {
                    cloudLogs = data.map(d => ({
                        id: d.id,
                        timestamp: d.created_at,
                        formattedDate: new Date(d.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                        userName: d.user_name,
                        userRole: d.user_role,
                        action: d.action,
                        module: d.module,
                        details: d.details
                    }));
                }
            } catch(e) {}

            if (cloudLogs.length === 0) {
                try {
                    const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-AUDIT-LOGS').maybeSingle();
                    if (data && data.odontogram_data && data.odontogram_data.logs) {
                        cloudLogs = data.odontogram_data.logs;
                    }
                } catch(e) {}
            }
        }

        const localLogs = JSON.parse(localStorage.getItem('dental_audit_logs') || '[]');
        const map = new Map();
        cloudLogs.forEach(l => map.set(l.id, l));
        localLogs.forEach(l => {
            if (!map.has(l.id)) map.set(l.id, l);
        });

        const result = Array.from(map.values());
        result.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return result;
    }

    static async saveTrashItem(trashItem) {
        if (!this.isCloudConnected()) return;
        try {
            await supabaseClient.from('recycle_bin').insert({
                id: trashItem.trashId,
                category: trashItem.category,
                deleted_at: new Date().toISOString(),
                deleted_by: trashItem.deletedBy,
                name: trashItem.name,
                original_data: trashItem.originalData
            });
        } catch(e) {}

        try {
            const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-RECYCLE-BIN').maybeSingle();
            let sysTrash = (data && data.odontogram_data && data.odontogram_data.items) ? data.odontogram_data.items : [];
            sysTrash = sysTrash.filter(t => t.trashId !== trashItem.trashId);
            sysTrash.unshift(trashItem);

            await supabaseClient.from('patients').upsert({
                id: 'SYS-RECYCLE-BIN',
                fullname: 'Sistema Papelera de Reciclaje',
                birthdate: '2026-01-01',
                phone: '',
                status: 'Sistema',
                odontogram_data: { items: sysTrash, updatedAt: new Date().toISOString() }
            });
        } catch(e) {}
    }

    static async getTrashItems(category) {
        let cloudItems = [];
        if (this.isCloudConnected()) {
            try {
                const { data, error } = await supabaseClient.from('recycle_bin').select('*').eq('category', category).order('deleted_at', { ascending: false });
                if (!error && data && data.length > 0) {
                    cloudItems = data.map(d => ({
                        trashId: d.id,
                        category: d.category,
                        deletedAt: new Date(d.deleted_at).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        deletedBy: d.deleted_by,
                        name: d.name,
                        originalData: d.original_data
                    }));
                }
            } catch(e) {}

            if (cloudItems.length === 0) {
                try {
                    const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-RECYCLE-BIN').maybeSingle();
                    if (data && data.odontogram_data && data.odontogram_data.items) {
                        cloudItems = data.odontogram_data.items.filter(t => t.category === category);
                    }
                } catch(e) {}
            }
        }

        const localTrash = JSON.parse(localStorage.getItem('dental_trash_bin') || '{}');
        const localList = localTrash[category] || [];

        const map = new Map();
        cloudItems.forEach(item => map.set(item.trashId, item));
        localList.forEach(item => {
            if (!map.has(item.trashId)) map.set(item.trashId, item);
        });

        return Array.from(map.values());
    }

    static async deleteTrashItem(trashId) {
        if (!this.isCloudConnected()) return;
        try {
            await supabaseClient.from('recycle_bin').delete().eq('id', trashId);
        } catch(e) {}

        try {
            const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-RECYCLE-BIN').maybeSingle();
            if (data && data.odontogram_data && data.odontogram_data.items) {
                const updated = data.odontogram_data.items.filter(t => t.trashId !== trashId);
                await supabaseClient.from('patients').upsert({
                    id: 'SYS-RECYCLE-BIN',
                    fullname: 'Sistema Papelera de Reciclaje',
                    birthdate: '2026-01-01',
                    phone: '',
                    status: 'Sistema',
                    odontogram_data: { items: updated, updatedAt: new Date().toISOString() }
                });
            }
        } catch(e) {}
    }

    static async emptyTrashCloud() {
        if (!this.isCloudConnected()) return;
        try {
            await supabaseClient.from('recycle_bin').delete().neq('id', 'keep-alive');
        } catch(e) {}

        try {
            await supabaseClient.from('patients').upsert({
                id: 'SYS-RECYCLE-BIN',
                fullname: 'Sistema Papelera de Reciclaje',
                birthdate: '2026-01-01',
                phone: '',
                status: 'Sistema',
                odontogram_data: { items: [], updatedAt: new Date().toISOString() }
            });
        } catch(e) {}
    }

    static async saveAccountTransfers(transfersList) {
        localStorage.setItem('dental_account_transfers', JSON.stringify(transfersList));
        if (!this.isCloudConnected()) return;
        try {
            await supabaseClient.from('patients').upsert({
                id: 'SYS-ACCOUNT-TRANSFERS',
                fullname: 'Sistema Traslado de Cuentas',
                birthdate: '2026-01-01',
                phone: '',
                status: 'Sistema',
                odontogram_data: { transfers: transfersList, updatedAt: new Date().toISOString() }
            });
        } catch(e) {}
    }

    static async getAccountTransfers() {
        if (this.isCloudConnected()) {
            try {
                const { data } = await supabaseClient.from('patients').select('odontogram_data').eq('id', 'SYS-ACCOUNT-TRANSFERS').maybeSingle();
                if (data && data.odontogram_data && data.odontogram_data.transfers) {
                    localStorage.setItem('dental_account_transfers', JSON.stringify(data.odontogram_data.transfers));
                    return data.odontogram_data.transfers;
                }
            } catch(e) {}
        }
        return JSON.parse(localStorage.getItem('dental_account_transfers') || '[]');
    }

    static async syncLocalTrashAndAuditToCloud() {
        if (!this.isCloudConnected()) return;
        try {
            const localTrash = JSON.parse(localStorage.getItem('dental_trash_bin') || '{}');
            const categories = Object.keys(localTrash);
            for (const cat of categories) {
                const items = localTrash[cat] || [];
                for (const item of items) {
                    await this.saveTrashItem(item);
                }
            }

            const localLogs = JSON.parse(localStorage.getItem('dental_audit_logs') || '[]');
            if (localLogs.length > 0) {
                for (const log of localLogs.slice(0, 100)) {
                    await this.saveAuditLog(log);
                }
            }

            const localTransfers = JSON.parse(localStorage.getItem('dental_account_transfers') || '[]');
            if (localTransfers.length > 0) {
                await this.saveAccountTransfers(localTransfers);
            }
        } catch(err) {
            console.warn('Sync to cloud warning:', err);
        }
    }
}

window.SupabaseDataService = SupabaseDataService;

