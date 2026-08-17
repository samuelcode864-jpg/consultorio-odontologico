/* ==========================================================================
   DENTALCARE PRO - MAIN APPLICATION CONTROLLER
   Single-Page Application Router, Auth System, DolarApi & PDF Export Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Persistent State & Live Exchange Rate API
    initStorage();
    fetchLiveExchangeRate();

    // 2. Initialize Theme (Light Mode Default)
    initTheme();

    // 3. Check Authentication & Session
    checkAuthSession();
    initInactivityTracker();

    // 4. Instantiate Sub-Systems
    window.kardex = new KardexInventory();
    window.odontogram = new OdontogramEngine('odontogram-viewport', {
        onFaceClick: handleOdontogramFaceClick
    });

    window.doctorSigPad = new SignaturePad('doctor-sig-canvas');
    window.patientSigPad = new SignaturePad('patient-sig-canvas');

    // 5. UI Navigation & Tab Controller
    initNavigation();

    // 6. Render Initial Views & Data from Supabase Cloud
    await renderDashboard();
    await renderPatientsTable();
    await renderInventoryTable();
    await renderPricingTable();
    await renderEHRView();
    await renderUsersTable();

    // 7. Global Event Listeners & Modals
    initGlobalEvents();
});

// Storage Initializer
function initStorage() {
    if (!localStorage.getItem('dental_users')) {
        localStorage.setItem('dental_users', JSON.stringify(INITIAL_USERS));
    }
    if (!localStorage.getItem('dental_patients')) {
        localStorage.setItem('dental_patients', JSON.stringify(INITIAL_PATIENTS));
    }
    if (!localStorage.getItem('dental_baremo')) {
        localStorage.setItem('dental_baremo', JSON.stringify(INITIAL_BAREMO));
    }
    if (!localStorage.getItem('dental_appointments')) {
        const appointmentsWithDates = INITIAL_APPOINTMENTS.map((app, idx) => ({
            id: `appt-${idx + 1}`,
            time: app.time,
            patientName: app.patientName,
            patientId: app.patientId,
            treatment: app.treatment,
            status: app.status,
            isTomorrow: idx < 2
        }));
        localStorage.setItem('dental_appointments', JSON.stringify(appointmentsWithDates));
    }
    if (!localStorage.getItem('dental_exchange_rate')) {
        localStorage.setItem('dental_exchange_rate', DEFAULT_EXCHANGE_RATE.toString());
    }
}

// ==========================================
// DOLARAPI VENEZUELA LIVE EXCHANGE RATE API
// ==========================================
async function fetchLiveExchangeRate() {
    const currencyBtn = document.getElementById('currency-btn');
    if (currencyBtn) {
        currencyBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Obteniendo BCV...`;
    }

    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (!response.ok) throw new Error('API Response Error');
        const data = await response.json();

        if (data && data.promedio && !isNaN(data.promedio)) {
            const liveRate = parseFloat(data.promedio);
            localStorage.setItem('dental_exchange_rate', liveRate.toString());
            updateCurrencyBadge(liveRate, true);

            renderBudgetTable();
            await renderPricingTable();
            return;
        }
    } catch (err) {
        console.warn('No se pudo obtener la tasa en vivo de DolarApi, usando tasa guardada:', err);
    }

    const savedRate = getExchangeRate();
    updateCurrencyBadge(savedRate, false);
}

function updateCurrencyBadge(rate, isLive) {
    const currencyBtn = document.getElementById('currency-btn');
    if (!currencyBtn) return;

    const formattedRate = rate.toFixed(2);
    if (isLive) {
        currencyBtn.innerHTML = `<i class="fa-solid fa-dollar-sign text-green"></i> BCV: <strong>Bs. ${formattedRate}</strong> <small class="text-muted" style="font-size:0.68rem; margin-left:2px;">(En vivo)</small>`;
        currencyBtn.style.border = '1px solid #10b981';
    } else {
        currencyBtn.innerHTML = `<i class="fa-solid fa-dollar-sign text-amber"></i> BCV: <strong>Bs. ${formattedRate}</strong>`;
    }
}

function getActivePatientId() {
    return localStorage.getItem('dental_active_patient_id') || null;
}

function setActivePatientId(id) {
    if (id) {
        localStorage.setItem('dental_active_patient_id', id);
    } else {
        localStorage.removeItem('dental_active_patient_id');
    }
    updateActivePatientUI();
}

function getExchangeRate() {
    return parseFloat(localStorage.getItem('dental_exchange_rate')) || DEFAULT_EXCHANGE_RATE;
}

// Helper: Persist Active Patient's Odontogram Changes
async function autoSaveActivePatientOdontogram() {
    const activeId = getActivePatientId();
    if (!activeId || !window.odontogram) return;

    const patients = await SupabaseDataService.getPatients();
    const patient = patients.find(p => p.id === activeId);
    if (patient) {
        patient.odontogramData = window.odontogram.getData();
        await SupabaseDataService.savePatient(patient);
    }
}

// ==========================================
// THEME SWITCHER SYSTEM (LIGHT MODE DEFAULT)
// ==========================================
function initTheme() {
    let savedTheme = localStorage.getItem('dental_theme');
    if (!savedTheme) {
        savedTheme = 'light';
    }
    applyTheme(savedTheme);

    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
        themeBtn.onclick = () => {
            const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(nextTheme);
        };
    }
}

function applyTheme(theme) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');

    if (theme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        if (icon) icon.className = 'fa-solid fa-sun';
        if (text) text.innerText = 'Modo Claro';
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (icon) icon.className = 'fa-solid fa-moon';
        if (text) text.innerText = 'Modo Oscuro';
    }
    localStorage.setItem('dental_theme', theme);
}

// ==========================================
// AUTHENTICATION & ROLE-BASED PERMISSIONS (RBAC)
// ==========================================
function getCurrentUser() {
    const session = sessionStorage.getItem('dental_current_user');
    return session ? JSON.parse(session) : null;
}

function checkAuthSession() {
    const currentSession = sessionStorage.getItem('dental_current_user');
    const loginOverlay = document.getElementById('login-screen');

    if (currentSession) {
        try {
            const user = JSON.parse(currentSession);
            loginOverlay.classList.add('hidden');
            
            document.getElementById('dr-name-display').innerText = user.fullname;
            document.getElementById('dr-role-display').innerText = user.role;

            applyRolePermissionsUI(user.role);
            
            // Start/reset timer upon validation
            resetInactivityTimer();
            return;
        } catch(e) {
            sessionStorage.removeItem('dental_current_user');
        }
    }
    loginOverlay.classList.remove('hidden');
}

function applyRolePermissionsUI(role) {
    const isAssistant = role && role.toLowerCase().includes('asistente');
    
    const usersTab = document.querySelector('.nav-item[data-tab="users"]');
    if (usersTab) {
        if (isAssistant) {
            usersTab.classList.add('hidden');
        } else {
            usersTab.classList.remove('hidden');
        }
    }

    const addSrvBtn = document.getElementById('btn-add-service');
    if (addSrvBtn) {
        if (isAssistant) {
            addSrvBtn.style.display = 'none';
        } else {
            addSrvBtn.style.display = 'inline-flex';
        }
    }
}

async function login(email, password) {
    const users = await SupabaseDataService.getUsers();
    const match = users.find(u => u.email.toLowerCase() === email.toLowerCase().trim() && u.password === password.trim());
    const errorMsg = document.getElementById('login-error-msg');

    if (match) {
        if (errorMsg) errorMsg.classList.add('hidden');
        sessionStorage.setItem('dental_current_user', JSON.stringify(match));
        checkAuthSession();
        
        // Initialize inactivity tracker upon successful login
        resetInactivityTimer();
        
        Swal.fire({
            icon: 'success',
            title: '¡Bienvenido(a)!',
            text: `Sesión iniciada como ${match.fullname} (${match.role})`,
            timer: 1800,
            showConfirmButton: false
        });
    } else {
        if (errorMsg) errorMsg.classList.remove('hidden');
    }
}

function logout() {
    sessionStorage.removeItem('dental_current_user');
    checkAuthSession();
}

// ==========================================
// INACTIVITY TIMEOUT DETECTOR (5 MINUTES)
// ==========================================
let inactivityTimer = null;
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutos de inactividad

function resetInactivityTimer() {
    if (inactivityTimer) {
        clearTimeout(inactivityTimer);
    }
    
    // Solo activar si hay un usuario logueado en la pestaña actual
    if (sessionStorage.getItem('dental_current_user')) {
        inactivityTimer = setTimeout(handleInactivityTimeout, INACTIVITY_LIMIT);
    }
}

function handleInactivityTimeout() {
    // Limpiar sesión por inactividad
    sessionStorage.removeItem('dental_current_user');
    checkAuthSession();
    
    // Ocultar modales activos
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    openModals.forEach(m => {
        m.classList.add('hidden');
    });

    Swal.fire({
        icon: 'warning',
        title: 'Sesión Expirada',
        text: 'Tu sesión ha sido cerrada automáticamente por inactividad.',
        confirmButtonText: 'Volver a iniciar'
    });
}

function initInactivityTracker() {
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    events.forEach(name => {
        document.addEventListener(name, resetInactivityTimer, true);
    });
    resetInactivityTimer();
}

let currentBudgetItems = [];
let pendingToothFaceKey = null;

// ==========================================
// NAVIGATION & TABS
// ==========================================
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabViews = document.querySelectorAll('.tab-view');

    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const tabName = item.dataset.tab;

            navItems.forEach(n => n.classList.remove('active'));
            tabViews.forEach(v => v.classList.remove('active'));

            item.classList.add('active');
            const targetView = document.getElementById(`view-${tabName}`);
            if (targetView) targetView.classList.add('active');

            if (tabName === 'odontogram') {
                await renderOdontogramView();
            } else if (tabName === 'patients') {
                await renderPatientsTable();
            } else if (tabName === 'agenda') {
                await renderAgendaView();
            } else if (tabName === 'dashboard') {
                await renderDashboard();
            } else if (tabName === 'ehr') {
                await renderEHRView();
            } else if (tabName === 'inventory') {
                await renderInventoryTable();
            } else if (tabName === 'pricing') {
                await renderPricingTable();
            } else if (tabName === 'users') {
                await renderUsersTable();
            } else if (tabName === 'billing') {
                await renderBillingView();
            } else if (tabName === 'finance') {
                await renderFinanceView();
            } else if (tabName === 'stationery') {
                await renderStationeryView();
            }
        });
    });
}

async function updateActivePatientUI() {
    const activeId = getActivePatientId();
    const activePill = document.getElementById('active-patient-bar');
    const activeName = document.getElementById('active-patient-name');
    const odSelect = document.getElementById('od-patient-select');

    const patients = await SupabaseDataService.getPatients();

    if (odSelect) {
        odSelect.innerHTML = '<option value="">-- Seleccionar Paciente --</option>';
        patients.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = `${p.fullname} (${p.id})`;
            if (p.id === activeId) opt.selected = true;
            odSelect.appendChild(opt);
        });

        const newOpt = document.createElement('option');
        newOpt.value = 'new';
        newOpt.innerText = '➕ Registrar Nuevo Paciente...';
        odSelect.appendChild(newOpt);
    }

    if (activeId) {
        const patient = patients.find(p => p.id === activeId);
        if (patient) {
            activePill.classList.remove('hidden');
            activeName.innerText = patient.fullname;
            return;
        }
    }

    activePill.classList.add('hidden');
    activeName.innerText = 'Ninguno';
}

// ==========================================
// ODONTOGRAM & BUDGET VIEW
// ==========================================
async function renderOdontogramView() {
    await updateActivePatientUI();

    const activeId = getActivePatientId();
    const alertBanner = document.getElementById('od-medical-header-banner');
    const alertsText = document.getElementById('od-patient-alerts-text');

    if (activeId) {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === activeId);
        if (patient) {
            window.odontogram.setData(patient.odontogramData || {});
            
            let flags = [];
            if (patient.allergies && patient.allergies.length > 0) {
                flags.push(`⚠️ Alergias: ${patient.allergies.join(', ')}`);
            }
            if (patient.systemic && patient.systemic.length > 0) {
                flags.push(`🩺 Sistémica: ${patient.systemic.join(', ')}`);
            }
            if (patient.medication) {
                flags.push(`💊 Medicación: ${patient.medication}`);
            }

            if (flags.length > 0) {
                alertBanner.classList.remove('hidden');
                alertsText.innerHTML = flags.join(' | ');
            } else {
                alertBanner.classList.add('hidden');
            }
        }
    } else {
        window.odontogram.setData({});
        alertBanner.classList.add('hidden');
    }

    document.getElementById('btn-dentition-adult').onclick = function() {
        this.classList.add('active');
        document.getElementById('btn-dentition-pediatric').classList.remove('active');
        window.odontogram.setPediatric(false);
    };

    document.getElementById('btn-dentition-pediatric').onclick = function() {
        this.classList.add('active');
        document.getElementById('btn-dentition-adult').classList.remove('active');
        window.odontogram.setPediatric(true);
    };

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = function(e) {
            e.stopPropagation();
            const targetBtn = e.target.closest('.tool-btn') || this;
            const mode = targetBtn.getAttribute('data-mode') || targetBtn.dataset.mode;
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            targetBtn.classList.add('active');
            if (window.odontogram && mode) {
                window.odontogram.setMode(mode);
            }
        };
    });

    renderBudgetTable();
}

async function handleOdontogramFaceClick(toothNumber, faceId, mode, key) {
    if (mode === 'clear') {
        currentBudgetItems = currentBudgetItems.filter(item => item.key !== key);
        await autoSaveActivePatientOdontogram();
        renderBudgetTable();
        return;
    }

    pendingToothFaceKey = { toothNumber, faceId, mode, key };
    
    document.getElementById('modal-tooth-id').innerText = toothNumber;
    document.getElementById('modal-face-id').innerText = faceId;

    const baremo = await SupabaseDataService.getBaremo();
    const listContainer = document.getElementById('tooth-treatment-options');
    listContainer.innerHTML = '';

    baremo.forEach(proc => {
        const btn = document.createElement('button');
        btn.className = 'treatment-opt-btn';
        btn.innerHTML = `
            <div>
                <strong>${proc.name}</strong>
                <small class="text-muted" style="display:block;">Categoría: ${proc.category} (${proc.chairTimeMin} min)</small>
            </div>
            <span class="badge-tag blue">$${proc.priceUSD.toFixed(2)}</span>
        `;
        btn.onclick = async () => {
            addProcedureToBudget(pendingToothFaceKey, proc);
            await autoSaveActivePatientOdontogram();
            closeModal('modal-tooth-treatment');
        };
        listContainer.appendChild(btn);
    });

    openModal('modal-tooth-treatment');
}

function addProcedureToBudget(toothKeyObj, procedure) {
    const newItem = {
        key: toothKeyObj.key,
        tooth: toothKeyObj.toothNumber,
        face: toothKeyObj.faceId,
        serviceCode: procedure.code,
        name: procedure.name,
        price: procedure.priceUSD,
        discount: 0
    };

    const existingIdx = currentBudgetItems.findIndex(i => i.key === toothKeyObj.key);
    if (existingIdx >= 0) {
        currentBudgetItems[existingIdx] = newItem;
    } else {
        currentBudgetItems.push(newItem);
    }

    renderBudgetTable();
}

function renderBudgetTable() {
    const tbody = document.getElementById('budget-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const rate = getExchangeRate();

    if (currentBudgetItems.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center text-muted">Haga clic en el odontograma o en "+ Agregar Item" para armar el presupuesto.</td></tr>`;
        document.getElementById('budget-total-amount').innerText = '$0.00';
        document.getElementById('budget-total-ves').innerText = 'Bs. 0.00';
        return;
    }

    let totalUSD = 0;

    currentBudgetItems.forEach((item, index) => {
        const itemTotal = item.price * (1 - (item.discount || 0) / 100);
        totalUSD += itemTotal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>Pieza ${item.tooth || '-'}</strong> (${item.face || 'General'})</td>
            <td>${item.name}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td><input type="number" class="form-control btn-xs" style="width: 55px;" value="${item.discount || 0}" min="0" max="100" data-idx="${index}">%</td>
            <td class="text-cyan"><strong>$${itemTotal.toFixed(2)}</strong></td>
            <td><button class="btn btn-xs btn-outline text-red" onclick="removeBudgetItem(${index})"><i class="fa-solid fa-trash"></i></button></td>
        `;

        const discInput = tr.querySelector('input');
        discInput.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value) || 0;
            currentBudgetItems[index].discount = Math.min(100, Math.max(0, val));
            renderBudgetTable();
        });

        tbody.appendChild(tr);
    });

    const totalVES = (totalUSD * rate).toFixed(2);
    document.getElementById('budget-total-amount').innerText = `$${totalUSD.toFixed(2)}`;
    document.getElementById('budget-total-ves').innerText = `Bs. ${totalVES}`;
}

window.removeBudgetItem = async function(index) {
    currentBudgetItems.splice(index, 1);
    await autoSaveActivePatientOdontogram();
    renderBudgetTable();
};

// ==========================================
// PACIENTES VIEW & HIGH-END BBDD TABLE WITH DELETE
// ==========================================
async function renderPatientsTable(filter = 'all', searchQuery = '') {
    const tbody = document.getElementById('patients-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    let patients = await SupabaseDataService.getPatients();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    if (filter !== 'all') {
        patients = patients.filter(p => p.status === filter);
    }

    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        patients = patients.filter(p => 
            p.fullname.toLowerCase().includes(q) || 
            p.id.toLowerCase().includes(q) || 
            p.phone.includes(q)
        );
    }

    if (patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No se encontraron pacientes en la base de datos.</td></tr>`;
        return;
    }

    patients.forEach(p => {
        const age = calculateAge(p.birthdate);
        const initials = p.fullname.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        
        let alertsHtml = '';
        if (p.allergies && p.allergies.length > 0) {
            p.allergies.forEach(a => {
                alertsHtml += `<span class="badge-tag red"><i class="fa-solid fa-triangle-exclamation"></i> Alergia: ${a}</span> `;
            });
        }
        if (p.systemic && p.systemic.length > 0) {
            p.systemic.forEach(s => {
                alertsHtml += `<span class="badge-tag amber"><i class="fa-solid fa-heart-pulse"></i> ${s}</span> `;
            });
        }
        if (!alertsHtml) alertsHtml = `<span class="text-muted" style="font-size:0.78rem;">Sin alertas</span>`;

        let statusClass = 'blue';
        if (p.status === 'Activo') statusClass = 'green';
        if (p.status === 'En Tratamiento') statusClass = 'blue';
        if (p.status === 'Presupuesto Pendiente') statusClass = 'amber';

        const deleteBtnHtml = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" onclick="deletePatient('${p.id}')" title="Eliminar Paciente"><i class="fa-solid fa-trash"></i></button>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong class="badge-tag blue">${p.id}</strong></td>
            <td>
                <div class="patient-row-avatar">${initials}</div>
                <div class="patient-info-cell">
                    <strong>${p.fullname}</strong>
                    <small>${p.occupation || 'Sin especificación'}</small>
                </div>
            </td>
            <td>
                <strong>${age} años</strong>
                <small class="text-muted" style="display:block;">${p.birthdate}</small>
            </td>
            <td>
                <a href="https://wa.me/${p.phone.replace(/[^0-9]/g,'')}" target="_blank" class="whatsapp-pill-link">
                    <i class="fa-brands fa-whatsapp"></i> ${p.phone}
                </a>
            </td>
            <td>${alertsHtml}</td>
            <td><span class="badge-tag ${statusClass}">${p.status}</span></td>
            <td>
                <div class="actions-cell-group">
                    <button class="btn btn-xs btn-primary" onclick="selectPatientForOdontogram('${p.id}')" title="Emitir Presupuesto"><i class="fa-solid fa-tooth"></i> Presupuesto</button>
                    <button class="btn btn-xs btn-outline" onclick="openEHRForPatient('${p.id}')" title="Ver Historia"><i class="fa-solid fa-folder-open"></i> EHR</button>
                    ${deleteBtnHtml}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deletePatient = async function(patientId) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal tiene permisos para eliminar expedientes de pacientes.' });
        return;
    }

    Swal.fire({
        title: '¿Eliminar paciente?',
        text: 'Se eliminará permanentemente su expediente e historial clínico de la base de datos.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deletePatient(patientId);
            if (getActivePatientId() === patientId) {
                setActivePatientId(null);
            }
            await renderPatientsTable();
            await renderEHRView();
            Swal.fire({ icon: 'success', title: 'Paciente eliminado', timer: 1800, showConfirmButton: false });
        }
    });
};

function calculateAge(birthdateStr) {
    if (!birthdateStr) return 0;
    const birth = new Date(birthdateStr);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

window.selectPatientForOdontogram = function(patientId) {
    setActivePatientId(patientId);
    document.querySelector('.nav-item[data-tab="odontogram"]').click();
};

window.openEHRForPatient = function(patientId) {
    setActivePatientId(patientId);
    document.querySelector('.nav-item[data-tab="ehr"]').click();
};

// ==========================================
// HISTORIA CLÍNICA (EHR) VIEW WITH PDF EXPORT
// ==========================================
async function renderEHRView() {
    const listGroup = document.getElementById('ehr-patient-list');
    if (!listGroup) return;

    listGroup.innerHTML = '';
    const patients = await SupabaseDataService.getPatients();
    const activeId = getActivePatientId() || (patients[0] ? patients[0].id : null);
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    patients.forEach(p => {
        const item = document.createElement('a');
        item.className = `nav-item ${p.id === activeId ? 'active' : ''}`;
        item.style.borderRadius = '0';
        item.style.borderBottom = '1px solid var(--border-color)';
        item.innerHTML = `
            <div>
                <strong>${p.fullname}</strong><br>
                <small class="text-muted">${p.id} • Tel: ${p.phone}</small>
            </div>
        `;
        item.onclick = async (e) => {
            e.preventDefault();
            setActivePatientId(p.id);
            await renderEHRView();
        };
        listGroup.appendChild(item);
    });

    if (activeId) {
        const activePatient = patients.find(p => p.id === activeId);
        if (activePatient) {
            document.getElementById('ehr-patient-fullname').innerText = activePatient.fullname;
            document.getElementById('ehr-patient-subinfo').innerText = `Cédula: ${activePatient.id} | Edad: ${calculateAge(activePatient.birthdate)} años | Tel: ${activePatient.phone}`;
            
            const notesTimeline = document.getElementById('ehr-notes-timeline');
            notesTimeline.innerHTML = '';
            if (activePatient.clinicalNotes && activePatient.clinicalNotes.length > 0) {
                activePatient.clinicalNotes.forEach(note => {
                    const deleteNoteBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" style="margin-left:8px;" onclick="deleteClinicalNote('${note.id}')" title="Eliminar nota"><i class="fa-solid fa-trash"></i></button>`;

                    const div = document.createElement('div');
                    div.className = 'timeline-item';
                    div.innerHTML = `
                        <div class="timeline-meta">
                            <span><i class="fa-solid fa-clock"></i> ${note.datetime}</span>
                            <div>
                                <span class="badge-tag green">Abono: $${(note.paymentUSD || 0).toFixed(2)}</span>
                                ${deleteNoteBtn}
                            </div>
                        </div>
                        <p>${note.content}</p>
                    `;
                    notesTimeline.appendChild(div);
                });
            } else {
                notesTimeline.innerHTML = `<p class="text-muted text-center">No hay evoluciones registradas para este paciente.</p>`;
            }

            const initialWrapper = document.getElementById('ehr-od-initial-view');
            const currentWrapper = document.getElementById('ehr-od-current-view');
            if (initialWrapper && currentWrapper) {
                initialWrapper.innerHTML = `<div id="od-snap-initial"></div>`;
                currentWrapper.innerHTML = `<div id="od-snap-current"></div>`;
                new OdontogramEngine('od-snap-initial', { initialData: { "18-Oclusal": "patology", "36-Oclusal": "patology" } });
                new OdontogramEngine('od-snap-current', { initialData: activePatient.odontogramData || {} });
            }

            const gallery = document.getElementById('ehr-photo-gallery');
            gallery.innerHTML = '';
            if (activePatient.photos && activePatient.photos.length > 0) {
                activePatient.photos.forEach(photo => {
                    const card = document.createElement('div');
                    card.className = 'photo-card';
                    card.innerHTML = `
                        <img src="${photo.url}" alt="${photo.caption}">
                        <div class="photo-card-caption">${photo.caption}</div>
                    `;
                    gallery.appendChild(card);
                });
            } else {
                gallery.innerHTML = `<p class="text-muted text-center span-2">Sin fotografías radiográficas o intraorales registradas.</p>`;
            }

            const payTbody = document.getElementById('ehr-payments-table-body');
            payTbody.innerHTML = '';
            if (activePatient.payments && activePatient.payments.length > 0) {
                activePatient.payments.forEach(pay => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${pay.date}</td>
                        <td>${pay.concept}</td>
                        <td>$${pay.totalUSD.toFixed(2)}</td>
                        <td class="text-green">$${pay.paidUSD.toFixed(2)}</td>
                        <td class="text-red">$${pay.balanceUSD.toFixed(2)}</td>
                        <td><span class="badge-tag ${pay.status === 'Pagado' ? 'green' : 'amber'}">${pay.status}</span></td>
                    `;
                    payTbody.appendChild(tr);
                });
            } else {
                payTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Sin registro de pagos o saldos pendientes. Haga clic en "+ Registrar Pago / Abono" arriba.</td></tr>`;
            }

            // Populate Ficha Detallada Tab
            const clinicalDetailsContent = document.getElementById('ehr-clinical-details-content');
            if (clinicalDetailsContent) {
                const meta = activePatient.metadata || {};
                
                let repHtml = '';
                if (meta.type === 'Infantil') {
                    repHtml = `
                        <div class="details-section" style="margin-bottom: 20px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-user-shield"></i> Información del Representante</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
                                <div><strong>Nombre:</strong> ${meta.repName || 'N/A'}</div>
                                <div><strong>C.I:</strong> ${meta.repId || 'N/A'}</div>
                                <div><strong>Teléfono:</strong> ${meta.repPhone || 'N/A'}</div>
                                <div><strong>Parentesco:</strong> ${meta.repRelation || 'N/A'}</div>
                            </div>
                        </div>
                    `;
                }

                clinicalDetailsContent.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 15px; padding: 10px;">
                        <div class="details-section">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-circle-info"></i> Datos Clínicos Básicos</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
                                <div><strong>Tipo de Paciente:</strong> ${meta.type || 'Adulto'}</div>
                                <div><strong>Edad:</strong> ${meta.age || calculateAge(activePatient.birthdate)} años</div>
                                <div><strong>Sexo:</strong> ${meta.gender || 'N/A'}</div>
                                <div><strong>Dirección:</strong> ${meta.address || 'N/A'}</div>
                                <div><strong>Telf. Celular:</strong> ${meta.mobilePhone || activePatient.phone || 'N/A'}</div>
                                <div><strong>Telf. Local:</strong> ${meta.localPhone || 'N/A'}</div>
                                <div><strong>Telf. Trabajo:</strong> ${meta.workPhone || 'N/A'}</div>
                                <div><strong>Profesión:</strong> ${meta.profession || activePatient.occupation || 'N/A'}</div>
                                <div style="grid-column: span 2;"><strong>Motivo de Consulta:</strong> ${meta.consultReason || 'N/A'}</div>
                            </div>
                        </div>

                        ${repHtml}

                        <div class="details-section" style="border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <h4 style="margin: 0 0 10px 0; color: #dc2626;"><i class="fa-solid fa-notes-medical"></i> Anamnesis / Historia Médica</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.88rem;">
                                <div><strong>¿Bajo tratamiento médico?:</strong> ${meta.medicalTreatment || 'NO'} ${meta.medicalTreatmentDetails ? `(${meta.medicalTreatmentDetails})` : ''}</div>
                                <div><strong>Enfermedades de la Niñez:</strong> ${meta.childDiseases || 'Ninguna'}</div>
                                <div><strong>¿Alergias?:</strong> ${meta.hasAllergies || 'NO'} ${meta.allergiesDetails ? `(${meta.allergiesDetails})` : ''}</div>
                                <div><strong>Intervenciones Quirúrgicas:</strong> ${meta.surgeries || 'Ninguna'}</div>
                                <div><strong>¿Sangra mucho al cortarse/extraer?:</strong> ${meta.bleedingIssue || 'NO'}</div>
                                <div><strong>Trastornos respiratorios:</strong> ${meta.respiratoryIssues || 'NO'} ${meta.respiratoryIssuesDetails ? `(${meta.respiratoryIssuesDetails})` : ''}</div>
                                <div><strong>¿Reacción anormal a anestesia?:</strong> ${meta.anesthesiaReaction || 'NO'} ${meta.anesthesiaReactionDetails ? `(${meta.anesthesiaReactionDetails})` : ''}</div>
                                <div><strong>¿Alérgico a la Penicilina?:</strong> ${meta.penicillinAllergy || 'NO'} ${meta.penicillinAllergyDetails ? `(${meta.penicillinAllergyDetails})` : ''}</div>
                                <div style="grid-column: span 2;"><strong>¿Problemas del corazón?:</strong> ${meta.heartIssues || 'NO'} ${meta.heartIssuesDetails ? `(${meta.heartIssuesDetails})` : ''}</div>
                            </div>
                        </div>

                        <div class="details-section" style="border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-face-smile"></i> Examen Extraoral (Tejidos Bucales)</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
                                <div><strong>Paladar Duro:</strong> ${meta.tissueHardPalate || 'Normal'}</div>
                                <div><strong>Paladar Blando:</strong> ${meta.tissueSoftPalate || 'Normal'}</div>
                                <div><strong>Piso de Boca:</strong> ${meta.tissueMouthFloor || 'Normal'}</div>
                                <div><strong>Mejillas:</strong> ${meta.tissueCheeks || 'Normal'}</div>
                                <div><strong>Lengua:</strong> ${meta.tissueTongue || 'Normal'}</div>
                                <div><strong>Frenillo:</strong> ${meta.tissueFrenum || 'Normal'}</div>
                            </div>
                        </div>

                        <div class="details-section" style="border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-hand-holding-hand"></i> Hábitos Bucales</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
                                <div><strong>Deglución Anormal:</strong> ${meta.habitSwallowing || 'NO'}</div>
                                <div><strong>Onicofagia:</strong> ${meta.habitNailbiting || 'NO'}</div>
                                <div><strong>Succión Dedo:</strong> ${meta.habitThumbsucking || 'NO'} ${meta.habitThumbsuckingFinger ? `(${meta.habitThumbsuckingFinger})` : ''}</div>
                                <div><strong>Respirador Bucal:</strong> ${meta.habitMouthbreather || 'NO'}</div>
                                <div><strong>Frecuencia:</strong> ${meta.habitFrequency || 'N/A'}</div>
                                <div><strong>Intensidad:</strong> ${meta.habitIntensity || 'N/A'}</div>
                                <div style="grid-column: span 2;"><strong>Otros Hábitos:</strong> ${meta.habitOthers || 'Ninguno'}</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    }

    document.querySelectorAll('.subtab-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const target = document.getElementById(`subtab-${this.dataset.subtab}`);
            if (target) target.classList.add('active');
        };
    });
}

// PDF EXPORT ENGINE FOR CLINICAL HISTORY
async function exportEHRToPDF() {
    const activeId = getActivePatientId();
    if (!activeId) {
        Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Por favor active un paciente para exportar su Historia Clínica en PDF.' });
        return;
    }

    const patients = await SupabaseDataService.getPatients();
    const patient = patients.find(p => p.id === activeId);
    if (!patient) return;

    Swal.fire({
        title: 'Generando Historia Clínica en PDF',
        text: `Compilando expediente completo para ${patient.fullname}...`,
        icon: 'info',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const nowStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let allergiesText = (patient.allergies && patient.allergies.length > 0) ? patient.allergies.join(', ') : 'Ninguna conocida';
    let systemicText = (patient.systemic && patient.systemic.length > 0) ? patient.systemic.join(', ') : 'Ninguna declarada';
    let medText = patient.medication || 'Sin medicación prescrita';

    let evolutionsHtml = '';
    if (patient.clinicalNotes && patient.clinicalNotes.length > 0) {
        patient.clinicalNotes.forEach(note => {
            evolutionsHtml += `
                <div style="margin-bottom: 12px; padding: 10px 14px; background: #f8fafc; border-left: 3px solid #0284c7; border-radius: 4px;">
                    <div style="display:flex; justify-content:space-between; font-size: 0.78rem; color: #64748b; margin-bottom: 4px;">
                        <strong>📅 ${note.datetime}</strong>
                        <span style="color: #059669; font-weight: 600;">Abono: $${(note.paymentUSD || 0).toFixed(2)}</span>
                    </div>
                    <p style="font-size: 0.85rem; color: #1e293b; margin: 0; white-space: pre-wrap;">${note.content}</p>
                </div>
            `;
        });
    } else {
        evolutionsHtml = `<p style="font-size: 0.85rem; color: #64748b; font-style: italic;">Sin registro de evoluciones en la historia clínica.</p>`;
    }

    let paymentsHtml = '';
    if (patient.payments && patient.payments.length > 0) {
        patient.payments.forEach(pay => {
            paymentsHtml += `
                <tr>
                    <td style="padding:6px; border-bottom:1px solid #e2e8f0; font-size:0.8rem;">${pay.date}</td>
                    <td style="padding:6px; border-bottom:1px solid #e2e8f0; font-size:0.8rem;">${pay.concept}</td>
                    <td style="padding:6px; border-bottom:1px solid #e2e8f0; font-size:0.8rem;">$${pay.totalUSD.toFixed(2)}</td>
                    <td style="padding:6px; border-bottom:1px solid #e2e8f0; font-size:0.8rem; color:#059669; font-weight:600;">$${pay.paidUSD.toFixed(2)}</td>
                    <td style="padding:6px; border-bottom:1px solid #e2e8f0; font-size:0.8rem; color:#dc2626; font-weight:600;">$${pay.balanceUSD.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        paymentsHtml = `<tr><td colspan="5" style="text-align:center; padding:10px; color:#64748b; font-size:0.8rem;">Sin pagos registrados</td></tr>`;
    }

    const container = document.createElement('div');
    container.style.padding = '30px';
    container.style.fontFamily = "'Inter', Arial, sans-serif";
    container.style.color = '#0f172a';
    container.style.backgroundColor = '#ffffff';

    container.innerHTML = `
        <!-- HEADER -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <div>
                <h1 style="font-family: 'Outfit', sans-serif; font-size: 1.6rem; color: #0284c7; margin: 0;">🦷 DentalCare Pro</h1>
                <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0 0;">Consultorio Odontológico Unipersonal | Expediente Clínico Oficial</p>
                <small style="font-size: 0.72rem; color: #94a3b8;">Odontólogo: Dr. Alejandro Silva (MPPS-84920 / C.O.V-14920)</small>
            </div>
            <div style="text-align: right;">
                <span style="display: inline-block; background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;">HISTORIA CLINICA</span>
                <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 0 0;">Emisión: ${nowStr}</p>
            </div>
        </div>

        <!-- PATIENT DATA CARD -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="font-size: 1.05rem; color: #0f172a; margin: 0 0 10px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
                👤 Datos del Paciente
            </h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
                <div><strong>Nombre:</strong> ${patient.fullname}</div>
                <div><strong>Cédula / ID:</strong> ${patient.id}</div>
                <div><strong>Fecha Nacimiento:</strong> ${patient.birthdate} (${calculateAge(patient.birthdate)} años)</div>
                <div><strong>Teléfono:</strong> ${patient.phone}</div>
                <div><strong>Ocupación:</strong> ${patient.occupation || 'N/A'}</div>
                <div><strong>Correo:</strong> ${patient.email || 'N/A'}</div>
            </div>
        </div>

        <!-- MEDICAL HEAD (ALERTAS CLINICAS Y SALUD) -->
        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <h3 style="font-size: 1rem; color: #be123c; margin: 0 0 8px 0;">
                🩺 Ficha Médica de Cabecera & Alergias
            </h3>
            <div style="font-size: 0.84rem; line-height: 1.6;">
                <div><strong style="color: #dc2626;">Alergias Conocidas:</strong> ${allergiesText}</div>
                <div><strong style="color: #d97706;">Enfermedades Sistémicas:</strong> ${systemicText}</div>
                <div><strong>Medicación Prescrita:</strong> ${medText}</div>
                <div><strong>Contacto de Emergencia:</strong> ${patient.emergencyContact || 'Sin registrar'}</div>
            </div>
        </div>

        <!-- CLINICAL EVOLUTIONS -->
        <div style="margin-bottom: 20px;">
            <h3 style="font-size: 1.05rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 12px;">
                📝 Registro de Evoluciones Clínicas
            </h3>
            ${evolutionsHtml}
        </div>

        <!-- PAYMENTS & ACCOUNT BALANCE -->
        <div style="margin-bottom: 30px;">
            <h3 style="font-size: 1.05rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 12px;">
                💳 Resumen de Tratamientos y Pagos ($ USD)
            </h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background: #f1f5f9; font-size: 0.76rem; color: #475569;">
                        <th style="padding: 6px;">Fecha</th>
                        <th style="padding: 6px;">Tratamiento / Concepto</th>
                        <th style="padding: 6px;">Total</th>
                        <th style="padding: 6px;">Abonado</th>
                        <th style="padding: 6px;">Saldo Pendiente</th>
                    </tr>
                </thead>
                <tbody>
                    ${paymentsHtml}
                </tbody>
            </table>
        </div>

        <!-- SIGNATURE FOOTER -->
        <div style="margin-top: 40px; display: flex; justify-content: space-between; text-align: center;">
            <div style="width: 200px;">
                <div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 6px;"></div>
                <span style="font-size: 0.78rem; color: #475569; font-weight: 600;">Firma del Médico Odontólogo</span>
            </div>
            <div style="width: 200px;">
                <div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 6px;"></div>
                <span style="font-size: 0.78rem; color: #475569; font-weight: 600;">Firma del Paciente / Titular</span>
            </div>
        </div>
    `;

    const filename = `Historia_Clinica_${patient.id}_${patient.fullname.replace(/\s+/g, '_')}.pdf`;
    generatePDFFromElement(container, filename);
}

window.deleteClinicalNote = async function(noteId) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal puede eliminar notas de evolución clínica.' });
        return;
    }

    const activeId = getActivePatientId();
    if (!activeId) return;
    Swal.fire({
        title: '¿Eliminar evolución?',
        text: 'Esta nota clínica no se podrá recuperar.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const patients = await SupabaseDataService.getPatients();
            const p = patients.find(pat => pat.id === activeId);
            if (p && p.clinicalNotes) {
                p.clinicalNotes = p.clinicalNotes.filter(n => n.id !== noteId);
                await SupabaseDataService.savePatient(p);
                await renderEHRView();
                Swal.fire({ icon: 'success', title: 'Evolución eliminada', timer: 1800, showConfirmButton: false });
            }
        }
    });
};

// ==========================================
// DASHBOARD & METRICS VIEW WITH APPOINTMENT DELETE
// ==========================================
async function renderDashboard() {
    const agendaList = document.getElementById('dashboard-agenda-list');
    if (agendaList) {
        agendaList.innerHTML = '';
        const appointments = await SupabaseDataService.getAppointments();
        const currentUser = getCurrentUser();
        const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

        appointments.forEach(app => {
            const isTomorrowAppt = app.isTomorrow === true || app.date === 'tomorrow';
            
            let whatsappBtnHtml = '';
            if (isTomorrowAppt) {
                whatsappBtnHtml = `
                    <button class="btn btn-xs btn-success" style="margin-left: 6px;" onclick="sendWhatsAppReminderForAppt('${app.id}')" title="Enviar recordatorio de cita para mañana">
                        <i class="fa-brands fa-whatsapp"></i> Recordar (Mañana)
                    </button>
                `;
            } else {
                whatsappBtnHtml = `<span class="badge-tag green" style="margin-left:6px; font-size:0.7rem;">Cita de Hoy</span>`;
            }

            const deleteApptBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" style="margin-left: 6px;" onclick="deleteAppointment('${app.id}')" title="Eliminar Cita"><i class="fa-solid fa-trash"></i></button>`;

            const div = document.createElement('div');
            div.className = 'timeline-item';
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <div class="timeline-meta">
                    <span class="timeline-time"><i class="fa-solid fa-clock"></i> ${app.time}</span>
                    <div class="timeline-actions">
                        <span class="badge-tag blue">${app.status}</span>
                        ${whatsappBtnHtml}
                        ${deleteApptBtn}
                    </div>
                </div>
                <div class="timeline-patient-name"><strong>${app.patientName}</strong></div>
                <div class="timeline-patient-id"><small class="text-muted">C.I: ${app.patientId}</small></div>
                <div class="timeline-treatment"><small class="text-muted">Procedimiento: ${app.treatment}</small></div>
            `;
            agendaList.appendChild(div);
        });
    }

    const popularList = document.getElementById('popular-treatments-list');
    if (popularList) {
        popularList.innerHTML = `
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color);">
                <span>Restauración Resina Fotocurada</span>
                <span class="badge-tag cyan">24 asistencias</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color);">
                <span>Limpieza Ultrasónica + Profilaxis</span>
                <span class="badge-tag cyan">18 asistencias</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color);">
                <span>Tratamiento de Conducto (Endodoncia)</span>
                <span class="badge-tag cyan">9 asistencias</span>
            </div>
        `;
    }

    const alertBox = document.getElementById('dashboard-stock-alerts');
    if (alertBox && window.kardex) {
        const alerts = window.kardex.getLowStockAlerts();
        alertBox.innerHTML = '';
        if (alerts.length > 0) {
            alerts.forEach(a => {
                const div = document.createElement('div');
                div.style.padding = '8px 12px';
                div.style.borderRadius = '6px';
                div.style.background = 'rgba(245, 158, 11, 0.1)';
                div.style.border = '1px solid rgba(245, 158, 11, 0.3)';
                div.style.marginBottom = '8px';
                div.style.fontSize = '0.82rem';
                div.innerHTML = `<strong>${a.item.name}:</strong> ${a.message}`;
                alertBox.appendChild(div);
            });
        } else {
            alertBox.innerHTML = `<span class="text-muted">Todos los insumos con stock suficiente.</span>`;
        }
    }
}

window.deleteAppointment = async function(apptId) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal tiene permisos para eliminar citas.' });
        return;
    }

    Swal.fire({
        title: '¿Eliminar cita?',
        text: 'Se removerá de la agenda del consultorio.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deleteAppointment(apptId);
            await renderDashboard();
            await renderAgendaView();
            Swal.fire({ icon: 'success', title: 'Cita eliminada', timer: 1800, showConfirmButton: false });
        }
    });
};

async function renderAgendaView() {
    const agendaListMain = document.getElementById('agenda-list-main');
    if (!agendaListMain) return;

    agendaListMain.innerHTML = '';
    const appointments = await SupabaseDataService.getAppointments();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    if (appointments.length === 0) {
        agendaListMain.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-calendar-xmark" style="font-size:2rem; margin-bottom:10px; display:block;"></i>No hay citas registradas en la agenda.</div>`;
        return;
    }

    appointments.forEach(app => {
        const isTomorrowAppt = app.isTomorrow === true || app.date === 'tomorrow';
        
        let whatsappBtnHtml = '';
        if (isTomorrowAppt) {
            whatsappBtnHtml = `
                <button class="btn btn-xs btn-success" style="margin-left: 6px;" onclick="sendWhatsAppReminderForAppt('${app.id}')" title="Enviar recordatorio de cita para mañana">
                    <i class="fa-brands fa-whatsapp"></i> Recordar (Mañana)
                </button>
            `;
        } else {
            whatsappBtnHtml = `<span class="badge-tag green" style="margin-left:6px; font-size:0.7rem;">Cita de Hoy</span>`;
        }

        const deleteApptBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" style="margin-left: 6px;" onclick="deleteAppointment('${app.id}')" title="Eliminar Cita"><i class="fa-solid fa-trash"></i></button>`;

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.style.marginBottom = '12px';
        div.innerHTML = `
            <div class="timeline-meta">
                <span class="timeline-time"><i class="fa-solid fa-clock"></i> ${app.time}</span>
                <div class="timeline-actions">
                    <span class="badge-tag blue">${app.status}</span>
                    ${whatsappBtnHtml}
                    ${deleteApptBtn}
                </div>
            </div>
            <div class="timeline-patient-name"><strong>${app.patientName}</strong></div>
            <div class="timeline-patient-id"><small class="text-muted">C.I: ${app.patientId}</small></div>
            <div class="timeline-treatment"><small class="text-muted">Procedimiento: ${app.treatment}</small></div>
        `;
        agendaListMain.appendChild(div);
    });

    // Bind action buttons for Agenda view
    const sendRemindersBtn = document.getElementById('btn-send-reminders-all-agenda');
    if (sendRemindersBtn) {
        sendRemindersBtn.onclick = () => {
            window.sendRemindersForAllTomorrow();
        };
    }

    const addAppointmentBtn = document.getElementById('btn-add-appointment-agenda');
    if (addAppointmentBtn) {
        addAppointmentBtn.onclick = async () => {
            await populateAppointmentPatientSelect();
            openModal('modal-appointment');
        };
    }
}
window.renderAgendaView = renderAgendaView;

window.sendWhatsAppReminderForAppt = async function(apptId) {
    const appointments = await SupabaseDataService.getAppointments();
    const appt = appointments.find(a => a.id === apptId);
    if (!appt) return;

    const patients = await SupabaseDataService.getPatients();
    let patient = patients.find(p => p.id === appt.patientId || p.fullname.toLowerCase() === appt.patientName.toLowerCase());

    const phone = patient ? patient.phone : prompt(`Ingrese el número de WhatsApp del paciente ${appt.patientName}:`, "+584141234567");
    if (!phone) return;

    const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = WhatsAppService.generateAppointmentReminderMessage(appt.patientName, tomorrowStr, appt.time, appt.treatment);
    
    WhatsAppService.sendToPatient(phone, msg);
};

window.sendRemindersForAllTomorrow = async function() {
    const appointments = await SupabaseDataService.getAppointments();
    const tomorrowAppts = appointments.filter(a => a.isTomorrow === true || a.date === 'tomorrow');

    if (tomorrowAppts.length === 0) {
        Swal.fire({ icon: 'info', title: 'Sin citas agendadas', text: 'No hay citas programadas para el día de mañana.' });
        return;
    }

    Swal.fire({
        title: '¿Enviar recordatorios por WhatsApp?',
        text: `Se enviará el mensaje de confirmación a los ${tomorrowAppts.length} pacientes agendados para mañana.`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, enviar ahora',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            tomorrowAppts.forEach((appt, idx) => {
                setTimeout(() => {
                    window.sendWhatsAppReminderForAppt(appt.id);
                }, idx * 1000);
            });
        }
    });
};

// ==========================================
// INVENTORY KARDEX & PRICING TABLES WITH DELETE
// ==========================================
async function renderInventoryTable() {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody || !window.kardex) return;

    tbody.innerHTML = '';
    const items = await SupabaseDataService.getInventory();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    items.forEach(item => {
        let statusBadge = `<span class="badge-tag green">Normal</span>`;
        if (item.currentStock <= item.minStock) {
            statusBadge = `<span class="badge-tag red">Stock Crítico</span>`;
        }

        const deleteMatBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" onclick="deleteInventoryItem('${item.code}')" title="Eliminar Insumo"><i class="fa-solid fa-trash"></i></button>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.code}</strong></td>
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td><strong>${item.currentStock} ${item.unit}</strong></td>
            <td>${item.minStock} ${item.unit}</td>
            <td>${item.expiryDate || 'N/A'}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="actions-cell-group">
                    <button class="btn btn-xs btn-outline" onclick="adjustStockPrompt('${item.code}')">+ / - Ajustar</button>
                    ${deleteMatBtn}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.adjustStockPrompt = async function(code) {
    Swal.fire({
        title: 'Ajuste de Insumo',
        text: 'Ingrese la cantidad a ajustar (+ para agregar, - para restar):',
        input: 'number',
        inputValue: 5,
        showCancelButton: true,
        confirmButtonText: 'Aplicar ajuste',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed && result.value !== '') {
            const qty = parseInt(result.value);
            if (!isNaN(qty)) {
                window.kardex.updateStock(code, qty);
                await renderInventoryTable();
                await renderDashboard();
                Swal.fire({ icon: 'success', title: 'Stock actualizado', timer: 1500, showConfirmButton: false });
            }
        }
    });
};

window.deleteInventoryItem = async function(code) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal puede eliminar insumos del Kardex.' });
        return;
    }

    Swal.fire({
        title: '¿Eliminar insumo?',
        text: 'Se removerá de la lista del inventario Kardex.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deleteInventoryItem(code);
            await renderInventoryTable();
            await renderDashboard();
            Swal.fire({ icon: 'success', title: 'Insumo eliminado', timer: 1800, showConfirmButton: false });
        }
    });
};

async function renderPricingTable() {
    const tbody = document.getElementById('pricing-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const baremo = await SupabaseDataService.getBaremo();
    const rate = getExchangeRate();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    baremo.forEach(p => {
        const priceVES = (p.priceUSD * rate).toFixed(2);
        const deleteSrvBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" onclick="deletePricingService('${p.code}')" title="Eliminar Servicio"><i class="fa-solid fa-trash"></i></button>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.code}</strong></td>
            <td><span class="badge-tag blue">${p.category}</span></td>
            <td>${p.name}</td>
            <td class="text-cyan"><strong>$${p.priceUSD.toFixed(2)}</strong></td>
            <td>Bs. ${priceVES}</td>
            <td><strong>$${(p.hygienistBonus || 0).toFixed(2)}</strong></td>
            <td>${p.chairTimeMin} min</td>
            <td>${p.materials ? p.materials.length : 0} insumos</td>
            <td>
                <div class="actions-cell-group">
                    ${deleteSrvBtn}
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deletePricingService = async function(code) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal puede modificar el Baremo de Precios maestro.' });
        return;
    }

    Swal.fire({
        title: '¿Eliminar servicio?',
        text: 'Se removerá del Baremo de Precios oficial.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deleteBaremoService(code);
            await renderPricingTable();
            Swal.fire({ icon: 'success', title: 'Servicio eliminado', timer: 1800, showConfirmButton: false });
        }
    });
};

// ==========================================
// GESTIÓN DE USUARIOS (USER MANAGEMENT)
// ==========================================
async function renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const users = await SupabaseDataService.getUsers();

    users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${u.fullname}</strong></td>
            <td>${u.email}</td>
            <td><span class="badge-tag blue">${u.role}</span></td>
            <td>${u.license || 'N/A'}</td>
            <td><span class="badge-tag green">${u.status}</span></td>
            <td>${u.createdAt}</td>
            <td>
                <button class="btn btn-xs btn-outline text-red" onclick="deleteUser('${u.id}')" title="Eliminar"><i class="fa-solid fa-user-xmark"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteUser = async function(userId) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo el Odontólogo Principal puede gestionar o eliminar cuentas de usuario.' });
        return;
    }

    const users = await SupabaseDataService.getUsers();
    if (users.length <= 1) {
        Swal.fire({ icon: 'error', title: 'Acción denegada', text: 'Debe existir al menos un usuario registrado en el sistema.' });
        return;
    }
    Swal.fire({
        title: '¿Eliminar usuario?',
        text: 'Se revocará el acceso al consultorio a este usuario.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deleteUser(userId);
            await renderUsersTable();
            Swal.fire({ icon: 'success', title: 'Usuario eliminado', timer: 1800, showConfirmButton: false });
        }
    });
};

// ==========================================
// GLOBAL EVENTS & MODALS BINDING
// ==========================================
function initGlobalEvents() {
    // Conditional display for Infantil in Patient Modal
    const pTypeSelect = document.getElementById('p-type');
    const repFieldsDiv = document.getElementById('representative-fields');
    if (pTypeSelect && repFieldsDiv) {
        pTypeSelect.onchange = () => {
            const isChild = pTypeSelect.value === 'Infantil';
            if (isChild) {
                repFieldsDiv.classList.remove('hidden');
                document.getElementById('p-rep-name').setAttribute('required', 'true');
                document.getElementById('p-rep-id').setAttribute('required', 'true');
                document.getElementById('p-rep-phone').setAttribute('required', 'true');
                document.getElementById('p-rep-relation').setAttribute('required', 'true');
            } else {
                repFieldsDiv.classList.add('hidden');
                document.getElementById('p-rep-name').removeAttribute('required');
                document.getElementById('p-rep-id').removeAttribute('required');
                document.getElementById('p-rep-phone').removeAttribute('required');
                document.getElementById('p-rep-relation').removeAttribute('required');
            }
        };
    }

    // Conditional display for Doctor role in User Modal
    const uRoleSelect = document.getElementById('u-role');
    const docFieldsDiv = document.getElementById('doctor-profile-fields');
    if (uRoleSelect && docFieldsDiv) {
        // Populating doctor services select on opening
        const btnNewUM = document.getElementById('btn-new-user-modal');
        if (btnNewUM) {
            const originalClick = btnNewUM.onclick;
            btnNewUM.onclick = async (e) => {
                if (originalClick) originalClick(e);
                await populateDoctorServicesSelect();
            };
        }

        uRoleSelect.onchange = () => {
            const role = uRoleSelect.value;
            const isDoctor = role.includes('Odontólogo') || role.includes('Especialista') || role.includes('Cirujano');
            if (isDoctor) {
                docFieldsDiv.classList.remove('hidden');
                document.getElementById('u-schedule').setAttribute('required', 'true');
                document.getElementById('u-commission').setAttribute('required', 'true');
            } else {
                docFieldsDiv.classList.add('hidden');
                document.getElementById('u-schedule').removeAttribute('required');
                document.getElementById('u-commission').removeAttribute('required');
            }
        };
    }

    async function populateDoctorServicesSelect() {
        const select = document.getElementById('u-services');
        if (!select) return;
        select.innerHTML = '';
        const baremo = await SupabaseDataService.getBaremo();
        baremo.forEach(proc => {
            const opt = document.createElement('option');
            opt.value = proc.code;
            opt.innerText = `${proc.name} ($${proc.priceUSD})`;
            select.appendChild(opt);
        });
    }

    const loginForm = document.getElementById('form-login');
    if (loginForm) {
        loginForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            login(email, pass);
        };
    }

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            Swal.fire({
                title: '¿Cerrar sesión?',
                text: '¿Está seguro de que desea salir del sistema?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'Sí, cerrar sesión',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    logout();
                }
            });
        };
    }

    // Direct Patient Select Dropdown Listener
    const odPatientSelect = document.getElementById('od-patient-select');
    if (odPatientSelect) {
        odPatientSelect.onchange = async (e) => {
            const val = e.target.value;
            if (val === 'new') {
                openModal('modal-patient');
            } else if (val) {
                setActivePatientId(val);
                await renderOdontogramView();
            } else {
                setActivePatientId(null);
                await renderOdontogramView();
            }
        };
    }

    // Modal Add Item Handler (#modal-add-item)
    const btnAddCustom = document.getElementById('btn-add-custom-item');
    if (btnAddCustom) {
        btnAddCustom.onclick = async () => {
            const baremo = await SupabaseDataService.getBaremo();
            const selectEl = document.getElementById('item-baremo-select');
            
            if (selectEl) {
                selectEl.innerHTML = '<option value="">-- Seleccionar Procedimiento del Baremo --</option>';
                baremo.forEach(proc => {
                    const opt = document.createElement('option');
                    opt.value = proc.code;
                    opt.innerText = `${proc.name} - $${proc.priceUSD.toFixed(2)} (${proc.category})`;
                    selectEl.appendChild(opt);
                });
            }

            document.getElementById('item-custom-name').value = '';
            document.getElementById('item-custom-price').value = '';
            openModal('modal-add-item');
        };
    }

    const btnConfirmAddItem = document.getElementById('btn-confirm-add-item');
    if (btnConfirmAddItem) {
        btnConfirmAddItem.onclick = async (e) => {
            e.preventDefault();
            const selectEl = document.getElementById('item-baremo-select');
            const customName = document.getElementById('item-custom-name').value.trim();
            const customPrice = parseFloat(document.getElementById('item-custom-price').value) || 0;

            const baremo = await SupabaseDataService.getBaremo();
            const selectedCode = selectEl ? selectEl.value : '';

            if (selectedCode) {
                const proc = baremo.find(p => p.code === selectedCode);
                if (proc) {
                    currentBudgetItems.push({
                        key: 'proc-' + Date.now(),
                        tooth: 'General',
                        face: 'Gnl',
                        serviceCode: proc.code,
                        name: proc.name,
                        price: proc.priceUSD,
                        discount: 0
                    });
                }
            } else if (customName && customPrice > 0) {
                currentBudgetItems.push({
                    key: 'custom-' + Date.now(),
                    tooth: 'General',
                    face: 'Gnl',
                    serviceCode: '',
                    name: customName,
                    price: customPrice,
                    discount: 0
                });
            } else {
                Swal.fire({ icon: 'warning', title: 'Selección requerida', text: 'Elija un tratamiento del Baremo o escriba un concepto y precio.' });
                return;
            }

            await autoSaveActivePatientOdontogram();
            renderBudgetTable();
            closeModal('modal-add-item');
            Swal.fire({ icon: 'success', title: '¡Item Agregado!', timer: 1500, showConfirmButton: false });
        };
    }

    // Modal Registrar Pago Handler
    const btnOpenPayModal = document.getElementById('btn-open-payment-modal');
    if (btnOpenPayModal) {
        btnOpenPayModal.onclick = () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Active un paciente antes de registrar un pago o abono.' });
                return;
            }
            document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
            openModal('modal-payment');
        };
    }

    const savePayBtn = document.getElementById('btn-save-payment');
    if (savePayBtn) {
        savePayBtn.onclick = async (e) => {
            e.preventDefault();
            const activeId = getActivePatientId();
            if (!activeId) return;

            const concept = document.getElementById('pay-concept').value.trim();
            const totalUSD = parseFloat(document.getElementById('pay-total-usd').value) || 0;
            const paidUSD = parseFloat(document.getElementById('pay-paid-usd').value) || 0;
            const date = document.getElementById('pay-date').value;

            if (!concept || totalUSD <= 0 || paidUSD <= 0) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete todos los datos del pago.' });
                return;
            }

            const balanceUSD = Math.max(0, totalUSD - paidUSD);
            const status = balanceUSD === 0 ? 'Pagado' : 'Pendiente';

            const patients = await SupabaseDataService.getPatients();
            const p = patients.find(pat => pat.id === activeId);
            if (p) {
                if (!p.payments) p.payments = [];
                p.payments.unshift({
                    date,
                    concept,
                    totalUSD,
                    paidUSD,
                    balanceUSD,
                    status
                });

                await SupabaseDataService.savePatient(p);
                closeModal('modal-payment');
                await renderEHRView();
                Swal.fire({ icon: 'success', title: '¡Pago Registrado!', text: `Abono de $${paidUSD.toFixed(2)} cargado a ${p.fullname}.`, timer: 2000, showConfirmButton: false });
            }
        };
    }

    const btnExportPdf = document.getElementById('btn-export-ehr-pdf');
    if (btnExportPdf) {
        btnExportPdf.onclick = () => {
            exportEHRToPDF();
        };
    }

    const currencyBtn = document.getElementById('currency-btn');
    if (currencyBtn) {
        currencyBtn.onclick = () => {
            fetchLiveExchangeRate();
        };
    }

    const btnSendRemindersAll = document.getElementById('btn-send-reminders-all');
    if (btnSendRemindersAll) {
        btnSendRemindersAll.onclick = () => {
            window.sendRemindersForAllTomorrow();
        };
    }

    // Patient Filters Handler
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('patient-table-search') ? document.getElementById('patient-table-search').value : '';
            await renderPatientsTable(this.dataset.filter, searchVal);
        };
    });

    const patientSearchInput = document.getElementById('patient-table-search');
    if (patientSearchInput) {
        patientSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('.filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderPatientsTable(activeFilter, e.target.value);
        });
    }

    // Modal Insumo Handler
    const btnAddMat = document.getElementById('btn-add-material');
    if (btnAddMat) btnAddMat.onclick = () => openModal('modal-material');

    const saveMatBtn = document.getElementById('btn-save-material');
    if (saveMatBtn) {
        saveMatBtn.onclick = async (e) => {
            e.preventDefault();
            const code = document.getElementById('mat-code').value.trim();
            const name = document.getElementById('mat-name').value.trim();
            const category = document.getElementById('mat-category').value;
            const unit = document.getElementById('mat-unit').value.trim() || 'Unidades';
            const stock = parseInt(document.getElementById('mat-stock').value) || 0;
            const minStock = parseInt(document.getElementById('mat-min-stock').value) || 5;
            const expiryDate = document.getElementById('mat-expiry').value;

            if (!code || !name) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            await SupabaseDataService.saveInventoryItem({ code, name, category, unit, currentStock: stock, minStock, expiryDate });
            closeModal('modal-material');
            await renderInventoryTable();
            await renderDashboard();
            Swal.fire({ icon: 'success', title: '¡Insumo Guardado!', text: 'El material se registró en el inventario Kardex.', timer: 2000, showConfirmButton: false });
        };
    }

    // Modal Servicio Baremo Handler
    const btnAddSrv = document.getElementById('btn-add-service');
    if (btnAddSrv) btnAddSrv.onclick = () => openModal('modal-service');

    const saveSrvBtn = document.getElementById('btn-save-service');
    if (saveSrvBtn) {
        saveSrvBtn.onclick = async (e) => {
            e.preventDefault();
            const code = document.getElementById('srv-code').value.trim();
            const name = document.getElementById('srv-name').value.trim();
            const category = document.getElementById('srv-category').value;
            const priceUSD = parseFloat(document.getElementById('srv-price').value) || 0;
            const hygienistBonus = parseFloat(document.getElementById('srv-hygienist-bonus').value) || 0;
            const chairTimeMin = parseInt(document.getElementById('srv-time').value) || 30;

            if (!code || !name || priceUSD <= 0) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            await SupabaseDataService.saveBaremoService({ code, name, category, priceUSD, chairTimeMin, materials: [], hygienistBonus });

            closeModal('modal-service');
            await renderPricingTable();
            Swal.fire({ icon: 'success', title: '¡Servicio Agregado!', text: 'Registrado en la nube de Supabase.', timer: 2000, showConfirmButton: false });
        };
    }

    // Modal Cita Listener
    const btnAddAppt = document.getElementById('btn-add-appointment');
    if (btnAddAppt) {
        btnAddAppt.onclick = async () => {
            await populateAppointmentPatientSelect();
            openModal('modal-appointment');
        };
    }

    const saveApptBtn = document.getElementById('btn-save-appointment');
    if (saveApptBtn) {
        saveApptBtn.onclick = async (e) => {
            e.preventDefault();
            const patientSelect = document.getElementById('app-patient-select');
            const time = document.getElementById('app-time').value.trim();
            const dayTarget = document.getElementById('app-day-target').value;
            const treatment = document.getElementById('app-treatment').value.trim();

            if (!patientSelect || !time || !treatment) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const selectedOption = patientSelect.options[patientSelect.selectedIndex];
            const patientName = selectedOption.dataset.name;
            const patientId = selectedOption.value;

            await SupabaseDataService.saveAppointment({
                id: 'appt-' + Date.now(),
                time,
                patientName,
                patientId,
                treatment,
                status: 'Programada',
                isTomorrow: dayTarget === 'tomorrow',
                date: dayTarget
            });

            closeModal('modal-appointment');
            await renderDashboard();
            await renderAgendaView();
            Swal.fire({ icon: 'success', title: '¡Cita Agendada!', text: 'La cita ha sido añadida a la agenda.', timer: 2000, showConfirmButton: false });
        };
    }

    const btnQuickP = document.getElementById('btn-quick-patient');
    if (btnQuickP) btnQuickP.onclick = () => openModal('modal-patient');
    
    const btnNewPM = document.getElementById('btn-new-patient-modal');
    if (btnNewPM) btnNewPM.onclick = () => openModal('modal-patient');

    const btnNewUM = document.getElementById('btn-new-user-modal');
    if (btnNewUM) btnNewUM.onclick = () => openModal('modal-user');

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = () => closeModal(btn.dataset.close);
    });

    const saveUserBtn = document.getElementById('btn-save-user');
    if (saveUserBtn) {
        saveUserBtn.onclick = async (e) => {
            e.preventDefault();
            const fullname = document.getElementById('u-fullname').value.trim();
            const email = document.getElementById('u-email').value.trim();
            const password = document.getElementById('u-password').value.trim();
            const role = document.getElementById('u-role').value;
            const license = document.getElementById('u-license').value.trim();

            if (!fullname || !email || !password) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const isDoctor = role.includes('Odontólogo') || role.includes('Especialista') || role.includes('Cirujano');
            let doctorProfile = null;

            if (isDoctor) {
                const assignedServices = Array.from(document.getElementById('u-services').selectedOptions).map(opt => opt.value);
                const schedule = document.getElementById('u-schedule').value.trim();
                const commission = parseFloat(document.getElementById('u-commission').value) || 0;
                const availability = document.getElementById('u-availability').value.trim();

                doctorProfile = {
                    assignedServices,
                    schedule,
                    commission,
                    availability
                };
            }

            const newUser = {
                id: 'usr-' + Date.now(),
                fullname,
                email,
                password,
                role,
                license,
                status: 'Activo',
                createdAt: new Date().toISOString().split('T')[0],
                doctorProfile: doctorProfile || {},
                doctor_profile: doctorProfile || {}
            };

            await SupabaseDataService.saveUser(newUser);

            closeModal('modal-user');
            await renderUsersTable();
            Swal.fire({ icon: 'success', title: '¡Usuario Registrado!', text: `Se creó la cuenta para ${fullname} en la nube de Supabase`, timer: 2000, showConfirmButton: false });
        };
    }

    const savePatientBtn = document.getElementById('btn-save-patient');
    if (savePatientBtn) {
        savePatientBtn.onclick = async (e) => {
            e.preventDefault();
            const id = document.getElementById('p-id').value.trim();
            const fullname = document.getElementById('p-fullname').value.trim();
            const birthdate = document.getElementById('p-birthdate').value;
            const phone = document.getElementById('p-mobile-phone').value.trim();

            if (!id || !fullname || !birthdate || !phone) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const allergies = Array.from(document.querySelectorAll('input[name="p-allergies"]:checked')).map(cb => cb.value);
            const systemic = Array.from(document.querySelectorAll('input[name="p-systemic"]:checked')).map(cb => cb.value);
            const medication = document.getElementById('p-medication').value.trim();
            const emergencyContact = document.getElementById('p-emergency').value.trim();

            // Extract all detailed metadata fields
            const type = document.getElementById('p-type').value;
            const age = parseInt(document.getElementById('p-age').value) || 0;
            const gender = document.getElementById('p-gender').value;
            const address = document.getElementById('p-address').value.trim();
            const mobilePhone = document.getElementById('p-mobile-phone').value.trim();
            const localPhone = document.getElementById('p-local-phone').value.trim();
            const workPhone = document.getElementById('p-work-phone').value.trim();
            const profession = document.getElementById('p-profession').value.trim();
            const consultReason = document.getElementById('p-consult-reason').value.trim();

            const repName = document.getElementById('p-rep-name').value.trim();
            const repId = document.getElementById('p-rep-id').value.trim();
            const repPhone = document.getElementById('p-rep-phone').value.trim();
            const repRelation = document.getElementById('p-rep-relation').value.trim();

            const medicalTreatment = document.getElementById('p-medical-treatment').value;
            const medicalTreatmentDetails = document.getElementById('p-medical-treatment-details').value.trim();
            const childDiseases = document.getElementById('p-child-diseases').value.trim();
            const hasAllergies = document.getElementById('p-has-allergies').value;
            const allergiesDetails = document.getElementById('p-allergies-details').value.trim();
            const surgeries = document.getElementById('p-surgeries').value.trim();
            const bleedingIssue = document.getElementById('p-bleeding-issue').value;
            const respiratoryIssues = document.getElementById('p-respiratory-issues').value;
            const respiratoryIssuesDetails = document.getElementById('p-respiratory-issues-details').value.trim();
            const anesthesiaReaction = document.getElementById('p-anesthesia-reaction').value;
            const anesthesiaReactionDetails = document.getElementById('p-anesthesia-reaction-details').value.trim();
            const penicillinAllergy = document.getElementById('p-penicillin-allergy').value;
            const penicillinAllergyDetails = document.getElementById('p-penicillin-allergy-details').value.trim();
            const heartIssues = document.getElementById('p-heart-issues').value;
            const heartIssuesDetails = document.getElementById('p-heart-issues-details').value.trim();

            const tissueHardPalate = document.getElementById('p-tissue-hard-palate').value.trim();
            const tissueSoftPalate = document.getElementById('p-tissue-soft-palate').value.trim();
            const tissueMouthFloor = document.getElementById('p-tissue-mouth-floor').value.trim();
            const tissueCheeks = document.getElementById('p-tissue-cheeks').value.trim();
            const tissueTongue = document.getElementById('p-tissue-tongue').value.trim();
            const tissueFrenum = document.getElementById('p-tissue-frenum').value.trim();

            const habitSwallowing = document.getElementById('p-habit-swallowing').value;
            const habitNailbiting = document.getElementById('p-habit-nailbiting').value;
            const habitThumbsucking = document.getElementById('p-habit-thumbsucking').value;
            const habitThumbsuckingFinger = document.getElementById('p-habit-thumbsucking-finger').value.trim();
            const habitOthers = document.getElementById('p-habit-others').value.trim();
            const habitMouthbreather = document.getElementById('p-habit-mouthbreather').value;
            const habitFrequency = document.getElementById('p-habit-frequency').value.trim();
            const habitIntensity = document.getElementById('p-habit-intensity').value.trim();

            const newPatient = {
                id,
                fullname,
                birthdate,
                phone,
                email: document.getElementById('p-email').value.trim(),
                occupation: profession,
                allergies,
                systemic,
                medication,
                emergencyContact,
                status: 'Activo',
                createdAt: new Date().toISOString().split('T')[0],
                odontogramData: {},
                clinicalNotes: [],
                photos: [],
                payments: [],
                metadata: {
                    type,
                    age,
                    gender,
                    address,
                    mobilePhone,
                    localPhone,
                    workPhone,
                    profession,
                    consultReason,
                    repName,
                    repId,
                    repPhone,
                    repRelation,
                    medicalTreatment,
                    medicalTreatmentDetails,
                    childDiseases,
                    hasAllergies,
                    allergiesDetails,
                    surgeries,
                    bleedingIssue,
                    respiratoryIssues,
                    respiratoryIssuesDetails,
                    anesthesiaReaction,
                    anesthesiaReactionDetails,
                    penicillinAllergy,
                    penicillinAllergyDetails,
                    heartIssues,
                    heartIssuesDetails,
                    tissueHardPalate,
                    tissueSoftPalate,
                    tissueMouthFloor,
                    tissueCheeks,
                    tissueTongue,
                    tissueFrenum,
                    habitSwallowing,
                    habitNailbiting,
                    habitThumbsucking,
                    habitThumbsuckingFinger,
                    habitOthers,
                    habitMouthbreather,
                    habitFrequency,
                    habitIntensity
                }
            };

            await SupabaseDataService.savePatient(newPatient);

            closeModal('modal-patient');
            setActivePatientId(id);
            await renderPatientsTable();
            Swal.fire({ icon: 'success', title: '¡Paciente Registrado!', text: `${fullname} ha sido agregado en la nube de Supabase.`, timer: 2000, showConfirmButton: false });
        };
    }

    const clearActiveBtn = document.getElementById('btn-clear-active-patient');
    if (clearActiveBtn) {
        clearActiveBtn.onclick = () => {
            setActivePatientId(null);
        };
    }

    const clearDocSigBtn = document.getElementById('btn-clear-doc-sig');
    if (clearDocSigBtn) clearDocSigBtn.onclick = () => window.doctorSigPad.clear();

    const clearPatSigBtn = document.getElementById('btn-clear-patient-sig');
    if (clearPatSigBtn) clearPatSigBtn.onclick = () => window.patientSigPad.clear();

    const sendWpBtn = document.getElementById('btn-send-whatsapp');
    if (sendWpBtn) {
        sendWpBtn.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Por favor active un paciente antes de enviar el presupuesto.' });
                return;
            }
            const patients = await SupabaseDataService.getPatients();
            const patient = patients.find(p => p.id === activeId);
            if (!patient) return;
 
            let totalUSD = 0;
            currentBudgetItems.forEach(item => {
                totalUSD += item.price * (1 - (item.discount || 0) / 100);
            });
 
            const paymentModeSelect = document.getElementById('payment-mode-select');
            const paymentModeText = paymentModeSelect.options[paymentModeSelect.selectedIndex].text;
            const notes = document.getElementById('budget-notes').value;
            const consentText = document.getElementById('consent-text').value; // Retrieve edited consent text
 
            currentBudgetItems.forEach(item => {
                if (item.serviceCode) {
                    window.kardex.deductForTreatment(item.serviceCode);
                }
            });
 
            if (!patient.clinicalNotes) patient.clinicalNotes = [];
            patient.clinicalNotes.unshift({
                id: 'note-' + Date.now(),
                datetime: new Date().toISOString().slice(0, 16).replace('T', ' '),
                content: `Presupuesto emitido y enviado por WhatsApp ($${totalUSD.toFixed(2)}). Forma de pago: ${paymentModeText}. Consentimiento: ${consentText}. Observaciones: ${notes}`,
                paymentUSD: 0
            });
            await SupabaseDataService.savePatient(patient);
 
            const msg = WhatsAppService.generateBudgetMessage(patient, currentBudgetItems, totalUSD, paymentModeText, notes, consentText);
            WhatsAppService.sendToPatient(patient.phone, msg);
        };
    }
 
    const printBtn = document.getElementById('btn-print-budget') || document.getElementById('btn-print-pdf');
    if (printBtn) {
        printBtn.onclick = async () => {
            await autoSaveActivePatientOdontogram();
            const printContainer = await generateBudgetHTMLContainer();
            if (!printContainer) {
                Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Por favor active un paciente para imprimir su Presupuesto.' });
                return;
            }
            
            document.body.appendChild(printContainer);
            printContainer.classList.add('print-section');
            window.print();
            printContainer.classList.remove('print-section');
            document.body.removeChild(printContainer);
        };
    }

    const pdfBtn = document.getElementById('btn-pdf-budget');
    if (pdfBtn) {
        pdfBtn.onclick = async () => {
            await autoSaveActivePatientOdontogram();
            await downloadBudgetPDF();
        };
    }

    const searchInput = document.getElementById('global-search');
    const dropdown = document.getElementById('search-results-dropdown');

    if (searchInput && dropdown) {
        searchInput.addEventListener('input', async (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (!val) {
                dropdown.classList.add('hidden');
                return;
            }

            const patients = await SupabaseDataService.getPatients();
            const filtered = patients.filter(p => 
                p.fullname.toLowerCase().includes(val) || 
                p.id.toLowerCase().includes(val) || 
                p.phone.includes(val)
            );

            dropdown.innerHTML = '';
            if (filtered.length > 0) {
                dropdown.classList.remove('hidden');
                filtered.forEach(p => {
                    const item = document.createElement('div');
                    item.className = 'dropdown-item';
                    item.innerHTML = `
                        <div>
                            <strong>${p.fullname}</strong> (${p.id})
                        </div>
                        <span class="badge-tag blue">Seleccionar</span>
                    `;
                    item.onclick = async () => {
                        setActivePatientId(p.id);
                        dropdown.classList.add('hidden');
                        searchInput.value = '';
                        document.querySelector('.nav-item[data-tab="odontogram"]').click();
                    };
                    dropdown.appendChild(item);
                });
            } else {
                dropdown.classList.add('hidden');
            }
        });
    }

    const addNoteBtn = document.getElementById('btn-add-clinical-note');
    if (addNoteBtn) {
        addNoteBtn.onclick = () => {
            document.getElementById('note-datetime').value = new Date().toISOString().slice(0, 16);
            openModal('modal-note');
        };
    }

    const saveNoteBtn = document.getElementById('btn-save-note');
    if (saveNoteBtn) {
        saveNoteBtn.onclick = async (e) => {
            e.preventDefault();
            const activeId = getActivePatientId();
            if (!activeId) return;

            const content = document.getElementById('note-content').value.trim();
            const paymentUSD = parseFloat(document.getElementById('note-payment').value) || 0;
            const datetime = document.getElementById('note-datetime').value;

            if (!content) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Debe ingresar la nota de la evolución.' });
                return;
            }

            const patients = await SupabaseDataService.getPatients();
            const p = patients.find(pat => pat.id === activeId);
            if (p) {
                if (!p.clinicalNotes) p.clinicalNotes = [];
                p.clinicalNotes.unshift({
                    id: 'note-' + Date.now(),
                    datetime,
                    content,
                    paymentUSD
                });

                if (paymentUSD > 0) {
                    if (!p.payments) p.payments = [];
                    p.payments.unshift({
                        date: datetime.split('T')[0],
                        concept: 'Abono en Cita Clínica',
                        totalUSD: paymentUSD,
                        paidUSD: paymentUSD,
                        balanceUSD: 0.00,
                        status: 'Pagado'
                    });
                }

                await SupabaseDataService.savePatient(p);
                closeModal('modal-note');
                await renderEHRView();
                Swal.fire({ icon: 'success', title: '¡Evolución Registrada!', text: 'Guardada en la nube de Supabase.', timer: 2000, showConfirmButton: false });
            }
        };
    }
}

async function populateAppointmentPatientSelect() {
    const select = document.getElementById('app-patient-select');
    if (!select) return;

    select.innerHTML = '';
    const patients = await SupabaseDataService.getPatients();
    patients.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.name = p.fullname;
        opt.innerText = `${p.fullname} (${p.id})`;
        select.appendChild(opt);
    });
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
}

// Mobile Sidebar Drawer Controller
document.addEventListener('DOMContentLoaded', () => {
    const mobileToggleBtn = document.getElementById('btn-mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const mobileBackdrop = document.getElementById('mobile-sidebar-backdrop');

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (mobileBackdrop) mobileBackdrop.classList.add('hidden');
    }

    if (mobileToggleBtn && sidebar && mobileBackdrop) {
        mobileToggleBtn.onclick = () => {
            const isOpen = sidebar.classList.contains('mobile-open');
            if (isOpen) {
                closeMobileSidebar();
            } else {
                sidebar.classList.add('mobile-open');
                mobileBackdrop.classList.remove('hidden');
            }
        };

        mobileBackdrop.onclick = () => {
            closeMobileSidebar();
        };
    }

    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            closeMobileSidebar();
        });
    });

    // Global Event Delegation for Odontogram Marking Tool Buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool-btn');
        if (btn) {
            const mode = btn.getAttribute('data-mode') || btn.dataset.mode;
            if (mode && window.odontogram) {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                window.odontogram.setMode(mode);
            }
        }
    });
});

// ==========================================================================
// 8. BILLING, FINANCE & STATIONERY MODULE CONTROLLERS
// ==========================================================================

async function generateBudgetHTMLContainer() {
    const activeId = getActivePatientId();
    if (!activeId) return null;
    const patients = await SupabaseDataService.getPatients();
    const patient = patients.find(p => p.id === activeId);
    if (!patient) return null;

    let totalUSD = 0;
    currentBudgetItems.forEach(item => {
        totalUSD += item.price * (1 - (item.discount || 0) / 100);
    });

    const paymentModeSelect = document.getElementById('payment-mode-select');
    const paymentModeText = paymentModeSelect ? paymentModeSelect.options[paymentModeSelect.selectedIndex].text : 'Contado';
    const notes = document.getElementById('budget-notes') ? document.getElementById('budget-notes').value : '';

    const rate = getExchangeRate();
    const totalVES = (totalUSD * rate).toFixed(2);

    let itemsHtml = '';
    currentBudgetItems.forEach(item => {
        const itemTotal = item.price * (1 - (item.discount || 0) / 100);
        itemsHtml += `
            <tr style="border-bottom: 1px dashed #cbd5e1;">
                <td style="padding: 8px 0;">Pieza ${item.tooth || 'Gnl'} (${item.face || 'Gnl'})</td>
                <td style="padding: 8px 0;">${item.name}</td>
                <td style="padding: 8px 0;">$${item.price.toFixed(2)}</td>
                <td style="padding: 8px 0; text-align: center;">${item.discount || 0}%</td>
                <td style="padding: 8px 0; text-align: right;">$${itemTotal.toFixed(2)}</td>
            </tr>
        `;
    });

    const stationery = await SupabaseDataService.getStationeryConfig();
    const logoBase64 = await toDataURL(stationery.logoUrl);

    const docSig = (window.doctorSigPad && !window.doctorSigPad.isEmpty()) ? window.doctorSigPad.toDataURL() : '';
    const patSig = (window.patientSigPad && !window.patientSigPad.isEmpty()) ? window.patientSigPad.toDataURL() : '';

    const container = document.createElement('div');
    container.style.padding = '30px';
    container.style.fontFamily = 'monospace';
    container.style.color = '#000';
    container.style.backgroundColor = '#fff';

    container.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px;">
            ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 60px; margin-bottom: 10px; display: block; margin-left: auto; margin-right: auto;">` : ''}
            <pre style="margin: 0; font-family: inherit; font-size: 0.9rem; white-space: pre-wrap;">${stationery.headerText}</pre>
        </div>
        <div style="text-align: center; font-weight: bold; font-size: 1.2rem; margin-bottom: 20px;">PRESUPUESTO ODONTOLÓGICO</div>
        <div style="margin-bottom: 20px; font-size: 0.9rem;">
            <strong>Paciente:</strong> ${patient.fullname}<br>
            <strong>Cédula:</strong> ${patient.id}<br>
            <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}<br>
            <strong>Términos de Pago:</strong> ${paymentModeText}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.85rem;">
            <thead>
                <tr style="border-bottom: 2px solid #000; font-weight: bold;">
                    <th style="padding: 8px 0; text-align: left;">Pieza/Cara</th>
                    <th style="padding: 8px 0; text-align: left;">Tratamiento</th>
                    <th style="padding: 8px 0; text-align: left;">Precio</th>
                    <th style="padding: 8px 0; text-align: center; width: 50px;">Dto</th>
                    <th style="padding: 8px 0; text-align: right; width: 90px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 20px; font-size: 1rem; font-weight: bold;">
            Total USD (REF): $${totalUSD.toFixed(2)}<br>
            Total Bs (BCV @ ${rate}): Bs. ${totalVES}
        </div>
        ${notes ? `<div style="margin-bottom: 25px; border: 1px solid #000; padding: 10px; font-size: 0.85rem;"><strong>Observaciones:</strong><br>${notes}</div>` : ''}
        <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 0.85rem; text-align: center;">
            <div style="width: 200px;">
                ${docSig ? `<img src="${docSig}" style="max-height: 50px; display: block; margin-left: auto; margin-right: auto; margin-bottom: 5px;">` : '<div style="height: 55px;"></div>'}
                <div style="border-top: 1px solid #000; padding-top: 5px;">Firma del Médico</div>
            </div>
            <div style="width: 200px;">
                ${patSig ? `<img src="${patSig}" style="max-height: 50px; display: block; margin-left: auto; margin-right: auto; margin-bottom: 5px;">` : '<div style="height: 55px;"></div>'}
                <div style="border-top: 1px solid #000; padding-top: 5px;">Firma del Paciente</div>
            </div>
        </div>
        <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; border-top: 1px solid #000; padding-top: 10px; color: #555;">
            <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${stationery.footerText}</pre>
        </div>
    `;
    return container;
}

async function downloadBudgetPDF() {
    const activeId = getActivePatientId();
    if (!activeId) {
        Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Por favor active un paciente para exportar su Presupuesto en PDF.' });
        return;
    }
    const patients = await SupabaseDataService.getPatients();
    const patient = patients.find(p => p.id === activeId);
    if (!patient) return;

    const container = await generateBudgetHTMLContainer();
    if (!container) return;

    const filename = `Presupuesto_${patient.id}_${patient.fullname.replace(/\s+/g, '_')}.pdf`;
    generatePDFFromElement(container, filename);
}

// --- FACTURACIÓN ---

let billingItems = [];
let activeBillingInvoice = null;

async function renderBillingView() {
    const patientSelect = document.getElementById('bill-patient-select');
    const assistantSelect = document.getElementById('bill-assistant');
    if (!patientSelect) return;

    // Load patients
    const patients = await SupabaseDataService.getPatients();
    const activeId = getActivePatientId();
    patientSelect.innerHTML = '<option value="">-- Seleccionar Paciente --</option>';
    patients.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = `${p.fullname} (${p.id})`;
        if (p.id === activeId) opt.selected = true;
        patientSelect.appendChild(opt);
    });

    // Load assistants (users whose role includes "asistente")
    const users = await SupabaseDataService.getUsers();
    assistantSelect.innerHTML = '<option value="">-- Seleccionar Asistente --</option>';
    users.forEach(u => {
        if (u.role.toLowerCase().includes('asistente')) {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.innerText = u.fullname;
            assistantSelect.appendChild(opt);
        }
    });
    // Auto-select first assistant if available
    if (assistantSelect.options.length > 1) {
        assistantSelect.selectedIndex = 1;
    }

    // Load BCV Rate
    const rate = getExchangeRate();
    document.getElementById('bill-exchange-rate').innerText = `Bs. ${rate.toFixed(2)}`;

    // Reset list and draw table
    billingItems = [];
    renderBillingItemsTable();

    // Event listener for loading budget items
    document.getElementById('btn-load-budget-items').onclick = async () => {
        const pId = patientSelect.value;
        if (!pId) {
            Swal.fire({ icon: 'warning', title: 'Paciente no seleccionado', text: 'Por favor seleccione un paciente.' });
            return;
        }
        const activePatient = patients.find(p => p.id === pId);
        if (pId === activeId && currentBudgetItems.length > 0) {
            billingItems = currentBudgetItems.map(item => ({
                code: item.serviceCode || 'CUSTOM',
                name: item.name,
                price: item.price * (1 - (item.discount || 0) / 100),
                hygienistBonus: 0,
                qty: 1
            }));
            // Look up hygienist bonus from baremo
            const baremo = await SupabaseDataService.getBaremo();
            billingItems.forEach(bi => {
                const srv = baremo.find(b => b.code === bi.code);
                if (srv) bi.hygienistBonus = srv.hygienistBonus || 0;
            });
            Swal.fire({ icon: 'success', title: 'Items cargados', text: 'Se cargaron los items del presupuesto activo.', timer: 1500, showConfirmButton: false });
        } else if (activePatient && activePatient.payments && activePatient.payments.length > 0) {
            const pendingPayments = activePatient.payments.filter(pay => pay.status === 'Pendiente');
            if (pendingPayments.length > 0) {
                billingItems = pendingPayments.map(pay => ({
                    code: 'DEUDA',
                    name: pay.concept,
                    price: pay.balanceUSD,
                    hygienistBonus: 0,
                    qty: 1
                }));
                Swal.fire({ icon: 'success', title: 'Deuda cargada', text: 'Se cargaron los saldos pendientes del paciente.', timer: 1500, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'info', title: 'Sin presupuesto activo', text: 'El paciente no tiene tratamientos pendientes por facturar.' });
            }
        } else {
            Swal.fire({ icon: 'info', title: 'Sin presupuesto activo', text: 'El paciente no tiene tratamientos pendientes por facturar.' });
        }
        renderBillingItemsTable();
    };

    // Open add baremo item modal
    document.getElementById('btn-add-baremo-item-billing').onclick = async () => {
        const baremo = await SupabaseDataService.getBaremo();
        const select = document.getElementById('item-baremo-select-billing');
        select.innerHTML = '<option value="">-- Seleccionar Procedimiento --</option>';
        baremo.forEach(srv => {
            const opt = document.createElement('option');
            opt.value = srv.code;
            opt.innerText = `${srv.name} - $${srv.priceUSD.toFixed(2)} (Bonif: $${(srv.hygienistBonus || 0).toFixed(2)})`;
            select.appendChild(opt);
        });
        openModal('modal-add-item-billing');
    };

    // Confirm add baremo item
    document.getElementById('btn-confirm-add-item-billing').onclick = async () => {
        const select = document.getElementById('item-baremo-select-billing');
        const code = select.value;
        if (!code) {
            Swal.fire({ icon: 'warning', text: 'Seleccione un procedimiento' });
            return;
        }
        const baremo = await SupabaseDataService.getBaremo();
        const srv = baremo.find(b => b.code === code);
        if (srv) {
            const existing = billingItems.find(bi => bi.code === code);
            if (existing) {
                existing.qty += 1;
            } else {
                billingItems.push({
                    code: srv.code,
                    name: srv.name,
                    price: srv.priceUSD,
                    hygienistBonus: srv.hygienistBonus || 0,
                    qty: 1
                });
            }
            closeModal('modal-add-item-billing');
            renderBillingItemsTable();
            Swal.fire({ icon: 'success', title: 'Item agregado', timer: 1200, showConfirmButton: false });
        }
    };

    // Listeners for selectors to update live preview
    document.getElementById('bill-currency').onchange = () => updateBillingTotals();
    document.getElementById('bill-terms').onchange = () => updateBillingTotals();
    document.getElementById('bill-method').onchange = () => updateBillingTotals();

    // Process Invoice
    document.getElementById('btn-process-invoice').onclick = async () => {
        const pId = patientSelect.value;
        const assistantId = assistantSelect.value;
        if (!pId) {
            Swal.fire({ icon: 'warning', title: 'Paciente requerido', text: 'Debe seleccionar un paciente para emitir la factura.' });
            return;
        }
        if (!assistantId) {
            Swal.fire({ icon: 'warning', title: 'Asistente requerido', text: 'Debe seleccionar el asistente de turno.' });
            return;
        }
        if (billingItems.length === 0) {
            Swal.fire({ icon: 'warning', title: 'Sin items', text: 'Debe cargar al menos un tratamiento para facturar.' });
            return;
        }

        const activePatient = patients.find(p => p.id === pId);
        const selectedAssistant = users.find(u => u.id === assistantId);

        const currency = document.getElementById('bill-currency').value;
        const terms = document.getElementById('bill-terms').value;
        const method = document.getElementById('bill-method').value;
        const footerNote = document.getElementById('bill-footer-note').value;

        let totalRef = 0;
        let totalHygienistBonus = 0;
        billingItems.forEach(item => {
            totalRef += item.price * item.qty;
            totalHygienistBonus += (item.hygienistBonus || 0) * item.qty;
        });

        const rate = getExchangeRate();
        const totalBcv = totalRef * rate;

        // Process hygienist bonus
        if (totalHygienistBonus > 0 && selectedAssistant) {
            if (!selectedAssistant.doctorProfile) selectedAssistant.doctorProfile = {};
            selectedAssistant.doctorProfile.accumulatedBonus = (selectedAssistant.doctorProfile.accumulatedBonus || 0) + totalHygienistBonus;
            await SupabaseDataService.saveUser(selectedAssistant);
            await renderUsersTable();
        }

        // Generate invoice ID
        const invoiceId = 'FAC-' + Date.now().toString().slice(-6);

        // Save invoice obj
        const invoiceObj = {
            id: invoiceId,
            patientId: pId,
            invoiceDate: new Date().toISOString().split('T')[0],
            paymentMethod: method,
            paymentTerms: terms,
            currency: currency,
            items: billingItems,
            totalRef: totalRef,
            totalBcv: totalBcv,
            status: 'Emitida',
            footerText: footerNote
        };

        // Save in DB
        await SupabaseDataService.saveInvoice(invoiceObj);

        // Handle credit invoice outstanding balance
        if (terms === 'Crédito') {
            if (!activePatient.payments) activePatient.payments = [];
            activePatient.payments.unshift({
                date: invoiceObj.invoiceDate,
                concept: `Factura a Crédito ${invoiceId}`,
                totalUSD: totalRef,
                paidUSD: 0,
                balanceUSD: totalRef,
                status: 'Pendiente'
            });
            await SupabaseDataService.savePatient(activePatient);
        } else {
            if (!activePatient.payments) activePatient.payments = [];
            activePatient.payments.unshift({
                date: invoiceObj.invoiceDate,
                concept: `Pago Factura ${invoiceId}`,
                totalUSD: totalRef,
                paidUSD: totalRef,
                balanceUSD: 0,
                status: 'Pagado'
            });
            await SupabaseDataService.savePatient(activePatient);
        }

        activeBillingInvoice = invoiceObj;

        // Build preview
        await generateInvoicePreviewHTML(invoiceObj, activePatient, selectedAssistant);

        // Show action buttons
        document.getElementById('invoice-processed-actions').classList.remove('hidden');

        Swal.fire({
            icon: 'success',
            title: '¡Factura Procesada!',
            text: `Factura ${invoiceId} registrada. Comisiones higienista aplicadas: $${totalHygienistBonus.toFixed(2)}.`,
            confirmButtonText: 'Ver Factura'
        });
    };

    document.getElementById('btn-print-invoice-final').onclick = () => {
        const previewEl = document.getElementById('invoice-paper-preview');
        if (!previewEl) return;
        const printClone = previewEl.cloneNode(true);
        document.body.appendChild(printClone);
        printClone.classList.add('print-section');
        window.print();
        document.body.removeChild(printClone);
    };

    document.getElementById('btn-pdf-invoice-final').onclick = () => {
        const previewEl = document.getElementById('invoice-paper-preview');
        if (!previewEl || !activeBillingInvoice) return;

        const printClone = previewEl.cloneNode(true);
        const wrapper = document.createElement('div');
        wrapper.style.padding = '25px';
        wrapper.style.fontFamily = "'Courier New', Courier, monospace";
        wrapper.style.lineHeight = '1.4';
        wrapper.appendChild(printClone);

        const filename = `Factura_${activeBillingInvoice.id}.pdf`;
        generatePDFFromElement(wrapper, filename);
    };
}

function renderBillingItemsTable() {
    const tbody = document.getElementById('billing-items-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (billingItems.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="7" class="text-center text-muted">Cargue items del presupuesto o del baremo.</td></tr>';
        updateBillingTotals();
        return;
    }

    billingItems.forEach((item, index) => {
        const total = item.price * item.qty;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.code}</strong></td>
            <td>${item.name}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td>$${(item.hygienistBonus || 0).toFixed(2)}</td>
            <td><input type="number" class="form-control btn-xs" style="width: 50px;" value="${item.qty}" min="1" data-idx="${index}"></td>
            <td><strong>$${total.toFixed(2)}</strong></td>
            <td><button class="btn btn-xs btn-outline text-red" onclick="removeBillingItem(${index})"><i class="fa-solid fa-trash"></i></button></td>
        `;
        const input = tr.querySelector('input');
        input.onchange = (e) => {
            const val = parseInt(e.target.value) || 1;
            billingItems[index].qty = Math.max(1, val);
            renderBillingItemsTable();
        };
        tbody.appendChild(tr);
    });

    updateBillingTotals();
}

window.removeBillingItem = function(index) {
    billingItems.splice(index, 1);
    renderBillingItemsTable();
};

function updateBillingTotals() {
    let totalRef = 0;
    billingItems.forEach(item => {
        totalRef += item.price * item.qty;
    });

    const rate = getExchangeRate();
    const totalBcv = totalRef * rate;

    const currency = document.getElementById('bill-currency') ? document.getElementById('bill-currency').value : 'REF';

    document.getElementById('bill-total-ref').innerText = `$${totalRef.toFixed(2)}`;
    if (currency === 'REF') {
        document.getElementById('bill-total-final').innerText = `$${totalRef.toFixed(2)} REF`;
    } else {
        document.getElementById('bill-total-final').innerText = `Bs. ${totalBcv.toFixed(2)} BS`;
    }
}

async function generateInvoicePreviewHTML(invoice, patient, assistant) {
    const container = document.getElementById('invoice-paper-preview');
    if (!container) return;

    const stationery = await SupabaseDataService.getStationeryConfig();
    const logoBase64 = await toDataURL(stationery.logoUrl);
    const rate = getExchangeRate();

    let itemsHtml = '';
    invoice.items.forEach(item => {
        const itemTotal = item.price * item.qty;
        const priceFinal = invoice.currency === 'REF' ? `$${item.price.toFixed(2)}` : `Bs. ${(item.price * rate).toFixed(2)}`;
        const totalFinal = invoice.currency === 'REF' ? `$${itemTotal.toFixed(2)}` : `Bs. ${(itemTotal * rate).toFixed(2)}`;
        itemsHtml += `
            <tr style="border-bottom: 1px dashed #ccc;">
                <td style="padding: 6px 0;">${item.name} (${item.code})</td>
                <td style="padding: 6px 0; text-align: center;">${item.qty}</td>
                <td style="padding: 6px 0; text-align: right;">${priceFinal}</td>
                <td style="padding: 6px 0; text-align: right;">${totalFinal}</td>
            </tr>
        `;
    });

    const displayTotal = invoice.currency === 'REF' 
        ? `$${invoice.totalRef.toFixed(2)} REF` 
        : `Bs. ${invoice.totalBcv.toFixed(2)} BS`;

    container.innerHTML = `
        <div style="font-family: monospace; line-height: 1.4; color: #000; background: #fff; padding: 10px;">
            <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;">` : ''}
                <pre style="margin: 0; font-family: inherit; font-size: 0.8rem; white-space: pre-wrap;">${stationery.headerText}</pre>
            </div>
            
            <div style="text-align: center; font-weight: bold; font-size: 1.1rem; margin-bottom: 15px;">FACTURA CLÍNICA: ${invoice.id}</div>
            
            <div style="margin-bottom: 15px; font-size: 0.8rem; border-bottom: 1px solid #000; padding-bottom: 10px;">
                <strong>Fecha:</strong> ${invoice.invoiceDate}<br>
                <strong>Paciente:</strong> ${patient.fullname}<br>
                <strong>Cédula:</strong> ${patient.id}<br>
                <strong>WhatsApp:</strong> ${patient.phone}<br>
                <strong>Términos:</strong> ${invoice.paymentTerms} | <strong>Método:</strong> ${invoice.paymentMethod}<br>
                <strong>Asistente:</strong> ${assistant ? assistant.fullname : 'N/A'}
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 15px;">
                <thead>
                    <tr style="border-bottom: 1px solid #000; font-weight: bold;">
                        <th style="padding: 4px 0; text-align: left;">Descripción</th>
                        <th style="padding: 4px 0; text-align: center; width: 40px;">Cant</th>
                        <th style="padding: 4px 0; text-align: right; width: 80px;">P. Unit</th>
                        <th style="padding: 4px 0; text-align: right; width: 90px;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div style="text-align: right; font-size: 0.9rem; font-weight: bold; border-top: 1px solid #000; padding-top: 8px; margin-bottom: 15px;">
                Total REF: $${invoice.totalRef.toFixed(2)} USD<br>
                Tasa BCV: Bs. ${rate.toFixed(2)}<br>
                <span style="font-size: 1rem; color: #0284c7;">TOTAL A PAGAR: ${displayTotal}</span>
            </div>

            ${invoice.footerText || stationery.footerText ? `
                <div style="font-size: 0.75rem; text-align: center; border-top: 1px dashed #ccc; padding-top: 10px; color: #555;">
                    <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${invoice.footerText || stationery.footerText}</pre>
                </div>
            ` : ''}
        </div>
    `;
}

// --- FINANZAS ---

let activePayableId = null;

async function renderFinanceView() {
    const subtabs = document.querySelectorAll('#view-finance .subtab-btn');
    const subcontents = document.querySelectorAll('#view-finance .subtab-content');

    subtabs.forEach(btn => {
        btn.onclick = () => {
            subtabs.forEach(b => b.classList.remove('active'));
            subcontents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = document.getElementById(`subtab-${btn.dataset.subtab}`);
            if (target) target.classList.add('active');
        };
    });

    await renderProviderBills();
    await renderReceivables();
    await renderCashFlow();

    const formPayable = document.getElementById('form-payable');
    formPayable.onsubmit = async (e) => {
        e.preventDefault();
        const providerName = document.getElementById('pay-provider').value.trim();
        const serviceName = document.getElementById('pay-service').value.trim();
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const dueDate = document.getElementById('pay-due-date').value;
        const status = document.getElementById('pay-status').value;

        if (!providerName || !serviceName || amount <= 0 || !dueDate) {
            Swal.fire({ icon: 'warning', text: 'Por favor, complete todos los campos obligatorios.' });
            return;
        }

        const billId = activePayableId || 'BILL-' + Date.now().toString().slice(-6);

        await SupabaseDataService.saveProviderBill({
            id: billId,
            providerName,
            serviceName,
            amount,
            dueDate,
            status
        });

        formPayable.reset();
        activePayableId = null;
        document.getElementById('payable-id').value = '';
        document.getElementById('payable-form-title').innerHTML = `<i class="fa-solid fa-plus-circle text-cyan"></i> Registrar Gasto / Cuenta por Pagar`;
        document.getElementById('btn-cancel-payable').style.display = 'none';

        await renderProviderBills();
        await renderCashFlow();

        Swal.fire({ icon: 'success', title: 'Cuenta por pagar guardada', timer: 1500, showConfirmButton: false });
    };

    document.getElementById('btn-cancel-payable').onclick = () => {
        formPayable.reset();
        activePayableId = null;
        document.getElementById('payable-id').value = '';
        document.getElementById('payable-form-title').innerHTML = `<i class="fa-solid fa-plus-circle text-cyan"></i> Registrar Gasto / Cuenta por Pagar`;
        document.getElementById('btn-cancel-payable').style.display = 'none';
    };
}

async function renderProviderBills() {
    const tbody = document.getElementById('finance-payables-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const bills = await SupabaseDataService.getProviderBills();
    const remindersBox = document.getElementById('payable-reminders');
    remindersBox.innerHTML = '';

    let alertMessages = [];
    const today = new Date();

    if (bills.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding: 15px;">No hay gastos ni cuentas por pagar registradas.</td></tr>';
        remindersBox.innerHTML = '<span class="text-muted" style="font-size:0.8rem;"><i class="fa-solid fa-bell-slash"></i> Sin recordatorios de vencimiento pendientes.</span>';
        return;
    }

    bills.forEach(bill => {
        const dueDateObj = new Date(bill.dueDate);
        const timeDiff = dueDateObj.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        let statusClass = 'green';
        if (bill.status === 'Pendiente') {
            if (daysDiff < 0) {
                statusClass = 'red';
                alertMessages.push(`<div style="color: #ef4444; font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> GASTO VENCIDO: ${bill.providerName} (${bill.serviceName}) venció hace ${Math.abs(daysDiff)} días ($${bill.amount.toFixed(2)})</div>`);
            } else if (daysDiff <= 3) {
                statusClass = 'amber';
                alertMessages.push(`<div style="color: #d97706; font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-clock"></i> POR VENCER: ${bill.providerName} (${bill.serviceName}) vence en ${daysDiff} días ($${bill.amount.toFixed(2)})</div>`);
            } else {
                statusClass = 'blue';
            }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${bill.providerName}</strong></td>
            <td>${bill.serviceName}</td>
            <td>$${bill.amount.toFixed(2)}</td>
            <td>${bill.dueDate}</td>
            <td><span class="badge-tag ${statusClass}">${bill.status}</span></td>
            <td>
                <div class="actions-cell-group">
                    <button class="btn btn-xs btn-outline" onclick="editProviderBill('${bill.id}')" title="Editar"><i class="fa-solid fa-edit"></i></button>
                    <button class="btn btn-xs btn-outline text-red" onclick="deleteProviderBill('${bill.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (alertMessages.length > 0) {
        remindersBox.innerHTML = alertMessages.join('');
    } else {
        remindersBox.innerHTML = '<span class="text-green" style="font-size:0.8rem; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Todos los servicios al día. Sin alertas de vencimiento inmediato.</span>';
    }
}

window.editProviderBill = async function(id) {
    const bills = await SupabaseDataService.getProviderBills();
    const bill = bills.find(b => b.id === id);
    if (!bill) return;

    activePayableId = bill.id;
    document.getElementById('payable-id').value = bill.id;
    document.getElementById('pay-provider').value = bill.providerName;
    document.getElementById('pay-service').value = bill.serviceName;
    document.getElementById('pay-amount').value = bill.amount;
    document.getElementById('pay-due-date').value = bill.dueDate;
    document.getElementById('pay-status').value = bill.status;

    document.getElementById('payable-form-title').innerHTML = `<i class="fa-solid fa-edit text-cyan"></i> Editar Gasto / Proveedor`;
    document.getElementById('btn-cancel-payable').style.display = 'inline-block';
};

window.deleteProviderBill = async function(id) {
    Swal.fire({
        title: '¿Eliminar registro?',
        text: '¿Está seguro de que desea eliminar esta cuenta por pagar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await SupabaseDataService.deleteProviderBill(id);
            await renderProviderBills();
            await renderCashFlow();
            Swal.fire({ icon: 'success', title: 'Registro eliminado', timer: 1500, showConfirmButton: false });
        }
    });
};

async function renderReceivables() {
    const tbody = document.getElementById('finance-receivables-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const patients = await SupabaseDataService.getPatients();
    let count = 0;

    patients.forEach(p => {
        let pendingPayments = (p.payments || []).filter(pay => pay.status === 'Pendiente' || pay.balanceUSD > 0);
        if (pendingPayments.length > 0) {
            pendingPayments.forEach(pay => {
                count++;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong class="badge-tag blue">${p.id}</strong></td>
                    <td><strong>${p.fullname}</strong></td>
                    <td>
                        <a href="https://wa.me/${p.phone.replace(/[^0-9]/g,'')}" target="_blank" class="whatsapp-pill-link">
                            <i class="fa-brands fa-whatsapp"></i> ${p.phone}
                        </a>
                    </td>
                    <td>${pay.concept}</td>
                    <td>$${pay.totalUSD.toFixed(2)}</td>
                    <td class="text-green">$${pay.paidUSD.toFixed(2)}</td>
                    <td class="text-red"><strong>$${pay.balanceUSD.toFixed(2)}</strong></td>
                    <td>
                        <div class="actions-cell-group">
                            <button class="btn btn-xs btn-success" onclick="openEHRForPatient('${p.id}')" title="Abonar en EHR"><i class="fa-solid fa-hand-holding-dollar"></i> Cobrar / EHR</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    });

    if (count === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 15px;">No hay pacientes con saldos pendientes.</td></tr>';
    }
}

async function renderCashFlow() {
    const tbody = document.getElementById('finance-cashflow-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const patients = await SupabaseDataService.getPatients();
    const bills = await SupabaseDataService.getProviderBills();

    let inflows = 0;
    let outflows = 0;
    let transactions = [];

    patients.forEach(p => {
        (p.payments || []).forEach(pay => {
            if (pay.paidUSD > 0) {
                inflows += pay.paidUSD;
                transactions.push({
                    date: pay.date,
                    concept: `Abono de Paciente: ${p.fullname} (${pay.concept})`,
                    type: 'Ingreso',
                    method: 'USD',
                    amount: pay.paidUSD
                });
            }
        });
    });

    bills.forEach(bill => {
        if (bill.status === 'Pagado') {
            outflows += bill.amount;
            transactions.push({
                date: bill.dueDate,
                concept: `Pago a Proveedor: ${bill.providerName} (${bill.serviceName})`,
                type: 'Egreso',
                method: 'USD',
                amount: bill.amount
            });
        }
    });

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('cf-total-inflows').innerText = `$${inflows.toFixed(2)}`;
    document.getElementById('cf-total-outflows').innerText = `$${outflows.toFixed(2)}`;
    
    const netBalance = inflows - outflows;
    document.getElementById('cf-net-balance').innerText = `$${netBalance.toFixed(2)}`;
    
    const balanceStatus = document.getElementById('cf-balance-status');
    if (netBalance >= 0) {
        balanceStatus.className = 'trend up';
        balanceStatus.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i> Balance Neto Positivo';
    } else {
        balanceStatus.className = 'trend down';
        balanceStatus.innerHTML = '<i class="fa-solid fa-arrow-trend-down"></i> Balance Neto Negativo';
    }

    document.getElementById('cf-inflows-details').innerText = `${transactions.filter(t => t.type === 'Ingreso').length} abonos recibidos`;
    document.getElementById('cf-outflows-details').innerText = `${bills.filter(b => b.status === 'Pagado').length} facturas liquidadas`;

    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 15px;">No hay historial financiero registrado.</td></tr>';
        return;
    }

    transactions.forEach(t => {
        const typeClass = t.type === 'Ingreso' ? 'text-green' : 'text-red';
        const typeBadge = t.type === 'Ingreso' ? '<span class="badge-tag green">Ingreso</span>' : '<span class="badge-tag red">Egreso</span>';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td><strong>${t.concept}</strong></td>
            <td>${typeBadge}</td>
            <td>${t.method}</td>
            <td class="${typeClass}"><strong>${t.type === 'Ingreso' ? '+' : '-'}$${t.amount.toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

// --- CONFIGURACIÓN DE PAPELERÍA ---

let currentPreviewTemplate = 'factura';

async function renderStationeryView() {
    const headerTextarea = document.getElementById('stat-header-text');
    const footerTextarea = document.getElementById('stat-footer-text');
    const logoUpload = document.getElementById('stat-logo-upload');
    const clearLogoBtn = document.getElementById('btn-clear-stat-logo');

    if (!headerTextarea) return;

    const config = await SupabaseDataService.getStationeryConfig();
    headerTextarea.value = config.headerText || '';
    footerTextarea.value = config.footerText || '';

    const previewImg = document.getElementById('stat-logo-preview-img');
    const previewContainer = document.getElementById('stat-logo-preview-img-container');
    if (config.logoUrl) {
        previewImg.src = config.logoUrl;
        previewContainer.classList.remove('hidden');
    } else {
        previewImg.src = '';
        previewContainer.classList.add('hidden');
    }

    await refreshStationeryLivePreview();

    headerTextarea.oninput = () => refreshStationeryLivePreview();
    footerTextarea.oninput = () => refreshStationeryLivePreview();

    logoUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target.result;
                previewImg.src = base64;
                previewContainer.classList.remove('hidden');
                config.logoUrl = base64;
                await refreshStationeryLivePreview();
            };
            reader.readAsDataURL(file);
        }
    };

    clearLogoBtn.onclick = async () => {
        logoUpload.value = '';
        previewImg.src = '';
        previewContainer.classList.add('hidden');
        config.logoUrl = '';
        await refreshStationeryLivePreview();
    };

    document.getElementById('btn-save-stationery-config').onclick = async () => {
        const headerText = headerTextarea.value.trim();
        const footerText = footerTextarea.value.trim();
        const logoUrl = previewImg.src || '';

        await SupabaseDataService.saveStationeryConfig({
            id: 'default',
            headerText,
            footerText,
            logoUrl
        });

        renderBudgetTable();

        Swal.fire({ icon: 'success', title: 'Papelería guardada', text: 'Se actualizó la plantilla oficial del consultorio.', timer: 2000, showConfirmButton: false });
    };

    const templateBtns = document.querySelectorAll('#view-stationery .subtab-btn');
    templateBtns.forEach(btn => {
        btn.onclick = async () => {
            templateBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPreviewTemplate = btn.dataset.previewTemplate;
            await refreshStationeryLivePreview();
        };
    });

    document.getElementById('btn-print-preview-stationery').onclick = () => {
        const previewEl = document.getElementById('stationery-live-paper');
        if (!previewEl) return;
        const printClone = previewEl.cloneNode(true);
        document.body.appendChild(printClone);
        printClone.classList.add('print-section');
        window.print();
        document.body.removeChild(printClone);
    };

    document.getElementById('btn-pdf-preview-stationery').onclick = () => {
        const previewEl = document.getElementById('stationery-live-paper');
        if (!previewEl) return;

        const printClone = previewEl.cloneNode(true);
        const wrapper = document.createElement('div');
        wrapper.style.padding = '25px';
        wrapper.style.fontFamily = "'Courier New', Courier, monospace";
        wrapper.style.lineHeight = '1.4';
        wrapper.appendChild(printClone);

        const filename = `Papeleria_${currentPreviewTemplate}.pdf`;
        generatePDFFromElement(wrapper, filename);
    };
}

async function refreshStationeryLivePreview() {
    const container = document.getElementById('stationery-live-paper');
    if (!container) return;

    const logoSrc = document.getElementById('stat-logo-preview-img').src || '';
    const headerText = document.getElementById('stat-header-text').value;
    const footerText = document.getElementById('stat-footer-text').value;

    let contentHtml = '';

    if (currentPreviewTemplate === 'factura') {
        contentHtml = `
            <div style="font-family: monospace; font-size: 0.8rem; color: #000; line-height: 1.4;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                    ${logoSrc ? `<img src="${logoSrc}" style="max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;">` : ''}
                    <pre style="margin: 0; font-family: inherit; font-size: 0.8rem; white-space: pre-wrap;">${headerText}</pre>
                </div>
                <div style="text-align: center; font-weight: bold; font-size: 1.1rem; margin-bottom: 15px;">FACTURA CLÍNICA MOCK: FAC-001</div>
                
                <div style="margin-bottom: 15px; font-size: 0.8rem; border-bottom: 1px solid #000; padding-bottom: 8px;">
                    <strong>Fecha:</strong> ${new Date().toISOString().split('T')[0]}<br>
                    <strong>Paciente:</strong> María Elena Rodríguez<br>
                    <strong>Cédula:</strong> V-18492102<br>
                    <strong>Términos:</strong> Contado | <strong>Método:</strong> Dólares
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 15px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-weight: bold;">
                            <th style="padding: 4px 0; text-align: left;">Descripción</th>
                            <th style="padding: 4px 0; text-align: center; width: 40px;">Cant</th>
                            <th style="padding: 4px 0; text-align: right; width: 80px;">P. Unit</th>
                            <th style="padding: 4px 0; text-align: right; width: 90px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px dashed #ccc;">
                            <td style="padding: 6px 0;">Limpieza Ultrasonica + Profilaxis</td>
                            <td style="padding: 6px 0; text-align: center;">1</td>
                            <td style="padding: 6px 0; text-align: right;">$40.00</td>
                            <td style="padding: 6px 0; text-align: right;">$40.00</td>
                        </tr>
                        <tr style="border-bottom: 1px dashed #ccc;">
                            <td style="padding: 6px 0;">Restauración Resina Clase I</td>
                            <td style="padding: 6px 0; text-align: center;">2</td>
                            <td style="padding: 6px 0; text-align: right;">$45.00</td>
                            <td style="padding: 6px 0; text-align: right;">$90.00</td>
                        </tr>
                    </tbody>
                </table>

                <div style="text-align: right; font-size: 0.9rem; font-weight: bold; border-top: 1px solid #000; padding-top: 8px; margin-bottom: 15px;">
                    Total REF: $130.00 USD<br>
                    Tasa BCV: Bs. 36.50<br>
                    <span style="font-size: 1rem; color: #0284c7;">TOTAL A PAGAR: $130.00 REF</span>
                </div>

                <div style="font-size: 0.75rem; text-align: center; border-top: 1px dashed #ccc; padding-top: 10px; color: #555;">
                    <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${footerText}</pre>
                </div>
            </div>
        `;
    } else if (currentPreviewTemplate === 'cotizacion') {
        contentHtml = `
            <div style="font-family: monospace; font-size: 0.8rem; color: #000; line-height: 1.4;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                    ${logoSrc ? `<img src="${logoSrc}" style="max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;">` : ''}
                    <pre style="margin: 0; font-family: inherit; font-size: 0.8rem; white-space: pre-wrap;">${headerText}</pre>
                </div>
                <div style="text-align: center; font-weight: bold; font-size: 1.1rem; margin-bottom: 15px;">PRESUPUESTO / COTIZACIÓN: COT-001</div>
                
                <div style="margin-bottom: 15px; font-size: 0.8rem; border-bottom: 1px solid #000; padding-bottom: 8px;">
                    <strong>Fecha:</strong> ${new Date().toISOString().split('T')[0]}<br>
                    <strong>Paciente:</strong> María Elena Rodríguez<br>
                    <strong>Cédula:</strong> V-18492102<br>
                    <strong>Validez:</strong> 15 días a partir de la emisión
                </div>

                <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 15px;">
                    <thead>
                        <tr style="border-bottom: 1px solid #000; font-weight: bold;">
                            <th style="padding: 4px 0; text-align: left;">Tratamiento</th>
                            <th style="padding: 4px 0; text-align: center; width: 40px;">Cant</th>
                            <th style="padding: 4px 0; text-align: right; width: 80px;">Precio</th>
                            <th style="padding: 4px 0; text-align: right; width: 90px;">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px dashed #ccc;">
                            <td style="padding: 6px 0;">Tratamiento Conducto Multirradicular (Pieza 36)</td>
                            <td style="padding: 6px 0; text-align: center;">1</td>
                            <td style="padding: 6px 0; text-align: right;">$180.00</td>
                            <td style="padding: 6px 0; text-align: right;">$180.00</td>
                        </tr>
                    </tbody>
                </table>

                <div style="text-align: right; font-size: 0.9rem; font-weight: bold; border-top: 1px solid #000; padding-top: 8px; margin-bottom: 15px;">
                    Subtotal: $180.00 USD<br>
                    <span style="font-size: 1rem; color: #10b981;">TOTAL PRESUPUESTADO: $180.00 USD</span>
                </div>

                <div style="font-size: 0.75rem; text-align: center; border-top: 1px dashed #ccc; padding-top: 10px; color: #555;">
                    <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${footerText}</pre>
                </div>
            </div>
        `;
    } else if (currentPreviewTemplate === 'recibo') {
        contentHtml = `
            <div style="font-family: monospace; font-size: 0.8rem; color: #000; line-height: 1.4;">
                <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px;">
                    ${logoSrc ? `<img src="${logoSrc}" style="max-height: 50px; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;">` : ''}
                    <pre style="margin: 0; font-family: inherit; font-size: 0.8rem; white-space: pre-wrap;">${headerText}</pre>
                </div>
                <div style="text-align: center; font-weight: bold; font-size: 1.1rem; margin-bottom: 15px;">RECIBO DE ABONO / PAGO: REC-001</div>
                
                <div style="margin-bottom: 15px; font-size: 0.82rem; border-bottom: 1px solid #000; padding-bottom: 8px; line-height: 1.6;">
                    <strong>Fecha:</strong> ${new Date().toISOString().split('T')[0]}<br>
                    <strong>Paciente:</strong> María Elena Rodríguez (C.I: V-18492102)<br>
                    <strong>Abono Recibido:</strong> $50.00 USD<br>
                    <strong>Concepto:</strong> Abono Inicial Corona Zirconio<br>
                    <strong>Saldo Restante:</strong> $200.00 USD
                </div>

                <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 0.8rem; text-align: center;">
                    <div style="width: 180px;">
                        <div style="border-bottom: 1px solid #000; height: 35px; margin-bottom: 5px;"></div>
                        Recibido por (Firma)
                    </div>
                    <div style="width: 180px;">
                        <div style="border-bottom: 1px solid #000; height: 35px; margin-bottom: 5px;"></div>
                        Paciente (Firma)
                    </div>
                </div>

                <div style="font-size: 0.75rem; text-align: center; border-top: 1px dashed #ccc; padding-top: 10px; color: #555; margin-top: 25px;">
                    <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">${footerText}</pre>
                </div>
            </div>
        `;
    }

    container.innerHTML = contentHtml;
}

function toDataURL(url) {
    return new Promise((resolve) => {
        try {
            if (!url) return resolve('');
            if (url.startsWith('data:')) return resolve(url);
            
            const xhr = new XMLHttpRequest();
            xhr.onload = function() {
                try {
                    const reader = new FileReader();
                    reader.onloadend = function() {
                        resolve(reader.result);
                    };
                    reader.readAsDataURL(xhr.response);
                } catch (e) {
                    resolve('');
                }
            };
            xhr.onerror = function() {
                resolve('');
            };
            xhr.open('GET', url);
            xhr.responseType = 'blob';
            xhr.send();
        } catch (err) {
            console.error("toDataURL error:", err);
            resolve('');
        }
    });
}

function generatePDFFromElement(element, filename) {
    // Style the element so it renders inside the viewport but behind the Swal loader overlay
    element.style.position = 'absolute';
    element.style.left = '0';
    element.style.top = window.scrollY + 'px';
    element.style.width = '750px';
    element.style.zIndex = '1';
    element.style.backgroundColor = '#ffffff';
    element.style.color = '#000000';
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.margin = '0';
    element.style.padding = '30px';

    document.body.appendChild(element);

    Swal.fire({
        title: 'Generando Documento PDF...',
        html: `
            <div style="margin-bottom: 10px; font-weight: bold; color: #0284c7;">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Compilando lienzo, imágenes y firmas...
            </div>
            <div style="font-size: 0.8rem; color: #64748b;">
                Por favor espere, esto tomará unos segundos.
            </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();

            setTimeout(() => {
                const opt = {
                    margin:       10,
                    filename:     filename,
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { scale: 2, useCORS: false, logging: true },
                    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                html2pdf().set(opt).from(element).save().then(() => {
                    document.body.removeChild(element);
                    Swal.close();
                    Swal.fire({ icon: 'success', title: '¡PDF Descargado!', text: 'El archivo se ha guardado en tu dispositivo.', timer: 2000, showConfirmButton: false });
                }).catch(err => {
                    document.body.removeChild(element);
                    console.error("html2pdf processing error:", err);
                    Swal.close();
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de Renderizado',
                        text: `No se pudo compilar el PDF. Detalle: ${err.message || err}`
                    });
                });
            }, 600); // 600ms delay to let the browser paint the DOM fully
        }
    });
}
