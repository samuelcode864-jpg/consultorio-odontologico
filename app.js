/* ==========================================================================
   DENTALCARE PRO - MAIN APPLICATION CONTROLLER
   Single-Page Application Router, Auth System, DolarApi & PDF Export Engine
   ========================================================================== */

window.onerror = function (msg, url, lineNo, columnNo, error) {
    const message = [
        'Message: ' + msg,
        'URL: ' + url,
        'Line: ' + lineNo,
        'Column: ' + columnNo,
        'Error: ' + (error ? error.stack : 'No stack')
    ].join('\n');
    alert("CRITICAL ERROR:\n" + message);
    return false;
};

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

    // 6. Render Initial Views & Data from Supabase Cloud (Only if user is logged in)
    if (getCurrentUser()) {
        try { await renderDashboard(); } catch(e) { console.error("Error rendering Dashboard:", e); }
        try { await renderPatientsTable(); } catch(e) { console.error("Error rendering Patients:", e); }
        try { await renderInventoryTable(); } catch(e) { console.error("Error rendering Inventory:", e); }
        try { await renderPricingTable(); } catch(e) { console.error("Error rendering Pricing:", e); }
        try { await renderEHRView(); } catch(e) { console.error("Error rendering EHR:", e); }
        try { await renderUsersTable(); } catch(e) { console.error("Error rendering Users:", e); }
    }

    // 7. Global Event Listeners & Modals
    initGlobalEvents();

    document.addEventListener('click', (e) => {
        const resultsBox = document.getElementById('od-patient-search-results');
        const searchInput = document.getElementById('od-patient-search-input');
        if (resultsBox && searchInput && !resultsBox.contains(e.target) && e.target !== searchInput) {
            resultsBox.style.display = 'none';
        }
    });
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
    if (currencyBtn) {
        const formattedRate = rate.toFixed(2);
        if (isLive) {
            currencyBtn.innerHTML = `<i class="fa-solid fa-dollar-sign text-green"></i> BCV: <strong>Bs. ${formattedRate}</strong> <small class="text-muted" style="font-size:0.68rem; margin-left:2px;">(En vivo)</small>`;
            currencyBtn.style.border = '1px solid #10b981';
        } else {
            currencyBtn.innerHTML = `<i class="fa-solid fa-dollar-sign text-amber"></i> BCV: <strong>Bs. ${formattedRate}</strong>`;
        }
    }

    const tasaBadge = document.getElementById('tasa-bcv-badge');
    if (tasaBadge) {
        tasaBadge.innerText = rate.toFixed(2);
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
            const roleEl = document.getElementById('dr-role-display');
            if (roleEl) {
                roleEl.innerText = user.role;
                roleEl.className = 'role-badge-tag';
                const r = user.role.toLowerCase();
                if (r.includes('admin') || r.includes('super')) {
                    roleEl.classList.add('badge-admin');
                } else if (r.includes('medico') || r.includes('odont') || r.includes('doctor')) {
                    roleEl.classList.add('badge-doctor');
                } else {
                    roleEl.classList.add('badge-assistant');
                }
            }

            applyRolePermissionsUI(user.role);
            
            // Start/reset timer upon validation
            resetInactivityTimer();
            return;
        } catch(e) {
            alert("Auth Session Try-Catch Error:\n" + e.message + "\nStack:\n" + e.stack);
            sessionStorage.removeItem('dental_current_user');
        }
    }
    loginOverlay.classList.remove('hidden');
}

function applyRolePermissionsUI(role) {
    const r = (role || '').toLowerCase();
    const isAdmin = r.includes('admin') || r.includes('super');
    const isDoctor = r.includes('medico') || r.includes('odont') || r.includes('doctor') || r.includes('dentista') || r.includes('médico');
    const isAssistant = r.includes('asistente') || r.includes('recep');

    const roleType = isAdmin ? 'admin' : (isDoctor ? 'doctor' : 'assistant');

    const tabSelectors = {
        dashboard: '.nav-item[data-tab="dashboard"]',
        patients: '.nav-item[data-tab="patients"]',
        agenda: '.nav-item[data-tab="agenda"]',
        odontogram: '.nav-item[data-tab="odontogram"]',
        ehr: '.nav-item[data-tab="ehr"]',
        inventory: '.nav-item[data-tab="inventory"]',
        pricing: '.nav-item[data-tab="pricing"]',
        users: '.nav-item[data-tab="users"]',
        billing: '.nav-item[data-tab="billing"]',
        finance: '.nav-item[data-tab="finance"]',
        stationery: '.nav-item[data-tab="stationery"]',
        settings: '.nav-item[data-tab="settings"]',
        help: '.nav-item[data-tab="help"]'
    };

    const permissions = {
        admin: ['dashboard', 'patients', 'agenda', 'odontogram', 'ehr', 'inventory', 'pricing', 'users', 'billing', 'finance', 'stationery', 'settings', 'help'],
        doctor: ['dashboard', 'patients', 'odontogram', 'ehr', 'settings', 'help'],
        assistant: ['dashboard', 'patients', 'agenda', 'billing', 'settings', 'help']
    };

    const allowedTabs = permissions[roleType] || permissions.assistant;

    for (const [tab, selector] of Object.entries(tabSelectors)) {
        const el = document.querySelector(selector);
        if (el) {
            if (allowedTabs.includes(tab)) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        }
    }

    // Toggle business settings tab based on admin role
    const paneBusBtn = document.getElementById('btn-pane-business');
    if (paneBusBtn) {
        if (roleType === 'admin') {
            paneBusBtn.style.display = 'flex';
        } else {
            paneBusBtn.style.display = 'none';
        }
    }

    // Additional UI restrictions for assistant
    const addSrvBtn = document.getElementById('btn-add-service');
    if (addSrvBtn) {
        addSrvBtn.style.display = (roleType === 'assistant') ? 'none' : 'inline-flex';
    }

    // Separation of duties: Hide register patient buttons for doctors
    const quickPatientBtn = document.getElementById('btn-quick-patient');
    const newPatientModalBtn = document.getElementById('btn-new-patient-modal');
    const editClinicalWizardBtn = document.getElementById('btn-edit-clinical-wizard');
    if (quickPatientBtn) {
        quickPatientBtn.style.display = (roleType === 'doctor') ? 'none' : 'inline-flex';
    }
    if (newPatientModalBtn) {
        newPatientModalBtn.style.display = (roleType === 'doctor') ? 'none' : 'inline-flex';
    }
    if (editClinicalWizardBtn) {
        // Only Doctors and Admins can complete or edit clinical history
        editClinicalWizardBtn.style.display = (roleType === 'assistant') ? 'none' : 'inline-flex';
    }

    // Hide/show doctor signature pad in profile adjustments
    const docSigSection = document.getElementById('doctor-signature-setting-section');
    if (docSigSection) {
        if (roleType === 'doctor' || roleType === 'admin') {
            docSigSection.classList.remove('hidden');
        } else {
            docSigSection.classList.add('hidden');
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
        
        // Render initial views for the newly authenticated session
        try { renderDashboard(); } catch(e) { console.error(e); }
        try { renderPatientsTable(); } catch(e) { console.error(e); }
        try { renderInventoryTable(); } catch(e) { console.error(e); }
        try { renderPricingTable(); } catch(e) { console.error(e); }
        try { renderEHRView(); } catch(e) { console.error(e); }
        try { renderUsersTable(); } catch(e) { console.error(e); }

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
let activeEditingBudgetId = null;

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

            // RBAC Navigation Guard
            const user = getCurrentUser();
            if (user) {
                const r = (user.role || '').toLowerCase();
                const isAdmin = r.includes('admin') || r.includes('super');
                const isDoctor = r.includes('medico') || r.includes('odont') || r.includes('doctor') || r.includes('dentista') || r.includes('médico');
                const roleType = isAdmin ? 'admin' : (isDoctor ? 'doctor' : 'assistant');
                const allowedTabs = {
                    admin: ['dashboard', 'patients', 'agenda', 'odontogram', 'ehr', 'inventory', 'pricing', 'users', 'billing', 'finance', 'stationery', 'settings', 'help'],
                    doctor: ['dashboard', 'patients', 'odontogram', 'ehr', 'settings', 'help'],
                    assistant: ['dashboard', 'patients', 'agenda', 'billing', 'settings', 'help']
                }[roleType] || ['dashboard', 'help'];

                if (!allowedTabs.includes(tabName)) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Acceso Denegado',
                        text: 'Su rol no cuenta con permisos para ver este módulo.'
                    });
                    return;
                }
            }

            navItems.forEach(n => n.classList.remove('active'));
            tabViews.forEach(v => v.classList.remove('active'));

            item.classList.add('active');
            const targetView = document.getElementById(`view-${tabName}`);
            if (targetView) targetView.classList.add('active');

            if (tabName === 'odontogram') {
                await renderBudgetListView();
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
            } else if (tabName === 'settings') {
                await renderSettingsView();
            } else if (tabName === 'help') {
                await renderHelpView();
            }
        });
    });
}

async function updateActivePatientUI(filterText = '') {
    const activeId = getActivePatientId();
    const activePill = document.getElementById('active-patient-bar');
    const activeName = document.getElementById('active-patient-name');
    const odSelect = document.getElementById('od-patient-select');

    const patients = await SupabaseDataService.getPatients();

    const query = filterText.toLowerCase().trim();
    const filteredPatients = patients.filter(p => {
        const name = (p.fullname || '').toLowerCase();
        const ci = (p.id || '').toLowerCase();
        return name.includes(query) || ci.includes(query);
    });

    if (odSelect) {
        odSelect.innerHTML = '<option value="">-- Seleccionar Paciente --</option>';
        filteredPatients.forEach(p => {
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

async function renderPatientSearchResults(query) {
    const resultsContainer = document.getElementById('od-patient-search-results');
    if (!resultsContainer) return;

    const trimmedQuery = query.toLowerCase().trim();
    if (!trimmedQuery) {
        resultsContainer.style.display = 'none';
        return;
    }

    const patients = await SupabaseDataService.getPatients();
    const filtered = patients.filter(p => {
        const name = (p.fullname || '').toLowerCase();
        const ci = (p.id || '').toLowerCase();
        return name.includes(trimmedQuery) || ci.includes(trimmedQuery);
    });

    if (filtered.length === 0) {
        resultsContainer.innerHTML = '<div style="padding: 10px 15px; color: var(--text-muted); font-size: 0.88rem; text-align: left;">No se encontraron pacientes</div>';
        resultsContainer.style.display = 'block';
        return;
    }

    resultsContainer.innerHTML = '';
    filtered.forEach(p => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.innerHTML = `<strong>${p.fullname}</strong> <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: 5px;">(${p.id})</span>`;
        item.onclick = async () => {
            document.getElementById('od-patient-search-input').value = p.fullname;
            resultsContainer.style.display = 'none';
            setActivePatientId(p.id);
            await renderOdontogramView();
        };
        resultsContainer.appendChild(item);
    });
    resultsContainer.style.display = 'block';
}

async function renderBudgetListView() {
    const listContainer = document.getElementById('odontogram-list-container');
    const editorContainer = document.getElementById('odontogram-editor-container');
    if (listContainer) listContainer.classList.remove('hidden');
    if (editorContainer) editorContainer.classList.add('hidden');

    const searchInput = document.getElementById('budget-search-input');
    const statusFilter = document.getElementById('budget-status-filter');
    const tableBody = document.getElementById('budget-list-table-body');
    if (!tableBody) return;

    const invoices = await SupabaseDataService.getInvoices();
    const budgets = invoices.filter(inv => inv.id && inv.id.startsWith('PRE-'));

    if (searchInput && !searchInput.oninput) {
        searchInput.oninput = () => drawTable();
    }
    if (statusFilter && !statusFilter.onchange) {
        statusFilter.onchange = () => drawTable();
    }

    drawTable();

    async function drawTable() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const status = statusFilter ? statusFilter.value : 'all';

        const patients = await SupabaseDataService.getPatients();

        const filtered = budgets.filter(b => {
            const patient = patients.find(p => p.id === b.patientId);
            const patientName = patient ? patient.fullname.toLowerCase() : '';
            const spec = b.items && b.items[0] && b.items[0].specialist ? b.items[0].specialist.toLowerCase() : '';
            const matchText = b.id.toLowerCase().includes(query) || patientName.includes(query) || spec.includes(query);

            if (status === 'all') return matchText;
            if (status === 'Presupuesto') return matchText && b.status !== 'Aprobado';
            if (status === 'Aprobado') return matchText && b.status === 'Aprobado';
            return matchText;
        });

        tableBody.innerHTML = '';
        if (filtered.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron presupuestos.</td></tr>';
            return;
        }

        filtered.forEach(b => {
            const patient = patients.find(p => p.id === b.patientId);
            const patientName = patient ? patient.fullname : 'Desconocido';
            const spec = b.items && b.items[0] && b.items[0].specialist ? b.items[0].specialist : 'Varios';
            
            const isApproved = b.status === 'Aprobado';
            const badgeClass = isApproved ? 'badge-tag green' : 'badge-tag orange';
            const statusLabel = isApproved ? 'Aprobado' : 'Borrador';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${b.id}</strong></td>
                <td>${patientName}</td>
                <td>${b.invoiceDate}</td>
                <td>$${b.totalRef.toFixed(2)}</td>
                <td>${spec}</td>
                <td><span class="${badgeClass}" style="font-size:0.75rem; text-transform:none; padding: 2px 6px;">${statusLabel}</span></td>
                <td style="text-align: center;">
                    <button class="btn btn-xs btn-outline" onclick="loadBudgetIntoEditor('${b.id}')" style="padding: 4px 8px; font-weight:600; border-radius:4px; cursor: pointer;"><i class="fa-solid fa-folder-open"></i> Abrir</button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

window.loadBudgetIntoEditor = async function(budgetId) {
    const listContainer = document.getElementById('odontogram-list-container');
    const editorContainer = document.getElementById('odontogram-editor-container');
    if (listContainer) listContainer.classList.add('hidden');
    if (editorContainer) editorContainer.classList.remove('hidden');

    const invoices = await SupabaseDataService.getInvoices();
    const budget = invoices.find(inv => inv.id === budgetId);
    if (!budget) return;

    activeEditingBudgetId = budget.id;

    // Load active patient ID
    setActivePatientId(budget.patientId);

    // Load treatments
    currentBudgetItems = (budget.items || []).map((item, idx) => ({
        key: 'proc-' + idx + '-' + Date.now(),
        tooth: item.tooth || 'General',
        face: item.face || 'Gnl',
        serviceCode: item.code || '',
        name: item.name,
        price: item.price,
        specialist: item.specialist || 'Dr. Carlos Mendoza'
    }));

    await renderOdontogramView();

    // Populate notes and consent
    document.getElementById('budget-notes').value = budget.footerText || '';
    
    // Set discount input
    const totalUSD = budget.totalRef;
    let subtotalUSD = 0;
    currentBudgetItems.forEach(item => subtotalUSD += item.price);
    const discountPct = subtotalUSD > 0 ? Math.round(((subtotalUSD - totalUSD) / subtotalUSD) * 100) : 0;
    document.getElementById('budget-discount-input').value = discountPct;

    // Set payment method select
    const paymentMethodSelect = document.getElementById('budget-payment-method');
    if (paymentMethodSelect) {
        paymentMethodSelect.value = budget.paymentMethod || 'pagomovil';
    }
    
    // Sync payment selector buttons visual state
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        const method = btn.getAttribute('data-method');
        if (method === budget.paymentMethod) {
            btn.classList.add('active');
            btn.style.background = '#0d9488';
            btn.style.color = '#fff';
            btn.style.borderColor = '#0d9488';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-main)';
            btn.style.borderColor = 'var(--border-color)';
        }
    });

    renderBudgetTable();
};

// ==========================================
// ODONTOGRAM & BUDGET VIEW
// ==========================================
async function renderOdontogramView() {
    await updateActivePatientUI();

    const searchInput = document.getElementById('od-patient-search-input');
    if (searchInput) {
        searchInput.oninput = async (e) => {
            const val = e.target.value;
            await updateActivePatientUI(val);
            await renderPatientSearchResults(val);
        };
        searchInput.onfocus = async (e) => {
            await renderPatientSearchResults(e.target.value);
        };
    }

    const activeId = getActivePatientId();
    const alertBanner = document.getElementById('od-medical-header-banner');
    const alertsText = document.getElementById('od-patient-alerts-text');

    if (activeId) {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === activeId);
        if (patient) {
            window.odontogram.setData(patient.odontogramData || {});
            
            // Sincronizar datos del expediente (Seccion 2)
            document.getElementById('info-patient-name').innerText = patient.fullname || 'Paciente';
            document.getElementById('info-patient-cedula').innerText = patient.id || 'V-00000000';
            document.getElementById('info-patient-category').innerText = patient.category || 'Privado';
            document.getElementById('info-patient-doctor').innerText = patient.assignedDoctor || 'Dr. Carlos Mendoza';

            const searchInput = document.getElementById('od-patient-search-input');
            if (searchInput && !searchInput.value) {
                searchInput.value = patient.fullname;
            }

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
        
        // Reset a valores por defecto
        document.getElementById('info-patient-name').innerText = 'Paciente';
        document.getElementById('info-patient-cedula').innerText = 'V-00000000';
        document.getElementById('info-patient-category').innerText = 'Privado';
        document.getElementById('info-patient-doctor').innerText = 'Dr. Carlos Mendoza';

        const searchInput = document.getElementById('od-patient-search-input');
        if (searchInput) searchInput.value = '';
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

    const searchInput = document.getElementById('tooth-treatment-search');
    if (searchInput) searchInput.value = '';

    const baremo = await SupabaseDataService.getBaremo();
    const listContainer = document.getElementById('tooth-treatment-options');

    function filterAndRenderOptions(query = '') {
        if (!listContainer) return;
        listContainer.innerHTML = '';
        const normalizedQuery = query.toLowerCase().trim();
        
        const filtered = baremo.filter(proc => 
            proc.name.toLowerCase().includes(normalizedQuery) ||
            proc.category.toLowerCase().includes(normalizedQuery) ||
            proc.code.toLowerCase().includes(normalizedQuery)
        );

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="text-center text-muted p-10" style="width: 100%;">No se encontraron procedimientos</div>';
            return;
        }

        filtered.forEach(proc => {
            const btn = document.createElement('button');
            btn.className = 'treatment-opt-btn';
            btn.innerHTML = `
                <div style="text-align: left;">
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
    }

    if (searchInput) {
        searchInput.oninput = (e) => {
            filterAndRenderOptions(e.target.value);
        };
    }

    filterAndRenderOptions('');
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

async function getDoctorsList() {
    try {
        const users = await SupabaseDataService.getUsers();
        const doctors = users.filter(u => u.role && (u.role.toLowerCase().includes('odont') || u.role.toLowerCase().includes('médic') || u.role.toLowerCase().includes('doctor')));
        if (doctors.length === 0) {
            return [{ fullname: 'Dr. Alejandro Silva' }, { fullname: 'Dr. Rodrigo Navas' }];
        }
        return doctors;
    } catch (err) {
        return [{ fullname: 'Dr. Alejandro Silva' }, { fullname: 'Dr. Rodrigo Navas' }];
    }
}

async function renderBudgetTable() {
    const tbody = document.getElementById('budget-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    const rate = getExchangeRate();
    const doctors = await getDoctorsList();

    // Setup global discount listener once
    const discInput = document.getElementById('budget-discount-input');
    if (discInput && !discInput.dataset.hasListener) {
        discInput.dataset.hasListener = 'true';
        discInput.addEventListener('input', () => {
            renderBudgetTable();
        });
    }

    if (currentBudgetItems.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="6" class="text-center text-muted">Haga clic en el odontodiagrama o en "+ Agregar Item" para armar el presupuesto.</td></tr>`;
        document.getElementById('budget-subtotal').innerText = '$0.00';
        document.getElementById('budget-subtotal-bs').innerText = 'Bs. 0.00';
        document.getElementById('budget-discount-amount').innerText = '$0.00';
        document.getElementById('budget-discount-ves').innerText = 'Bs. 0.00';
        document.getElementById('budget-total-amount').innerText = '$0.00';
        document.getElementById('budget-total-ves').innerText = 'Bs. 0.00';
        return;
    }

    let subtotalUSD = 0;

    currentBudgetItems.forEach((item, index) => {
        if (item.price === undefined) item.price = 0;
        if (!item.specialist) {
            item.specialist = doctors[0] ? doctors[0].fullname : 'Dr. Alejandro Silva';
        }

        subtotalUSD += item.price;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>#${item.tooth || '-'}</strong></td>
            <td><strong>${item.name}</strong></td>
            <td>
                <select class="form-control btn-xs srv-specialist-select" style="width: 160px; font-size: 0.82rem; padding: 4px 8px; border-radius: 6px;" data-idx="${index}">
                    ${doctors.map(doc => `<option value="${doc.fullname}" ${item.specialist === doc.fullname ? 'selected' : ''}>${doc.fullname}</option>`).join('')}
                </select>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 4px; font-weight: 600;">
                    $ <input type="number" class="form-control btn-xs srv-price-input" style="width: 70px; padding: 4px 6px; height: auto; text-align: center; border-radius: 4px;" value="${item.price}" step="0.01" data-idx="${index}"> USD
                </div>
            </td>
            <td style="font-weight: 700; color: #1e3a8a;">${(item.price * rate).toFixed(2)} Bs</td>
            <td>
                <button class="btn btn-xs btn-outline text-red" style="border-radius: 6px; padding: 4px 8px;" onclick="removeBudgetItem(${index})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;

        // Handle specialist select change
        const specSelect = tr.querySelector('.srv-specialist-select');
        specSelect.addEventListener('change', (e) => {
            currentBudgetItems[index].specialist = e.target.value;
        });

        // Handle price input edit
        const priceIn = tr.querySelector('.srv-price-input');
        priceIn.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value) || 0;
            currentBudgetItems[index].price = Math.max(0, val);
            renderBudgetTable();
        });

        tbody.appendChild(tr);
    });

    const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
    const discountAmountUSD = subtotalUSD * (discountPct / 100);
    const totalUSD = subtotalUSD - discountAmountUSD;

    const subtotalVES = (subtotalUSD * rate).toFixed(2);
    const discountVES = (discountAmountUSD * rate).toFixed(2);
    const totalVES = (totalUSD * rate).toFixed(2);

    // Update labels and values
    document.getElementById('budget-subtotal').innerText = `$${subtotalUSD.toFixed(2)}`;
    document.getElementById('budget-subtotal-bs').innerText = `Bs. ${subtotalVES}`;
    document.getElementById('budget-discount-amount').innerText = `$${discountAmountUSD.toFixed(2)}`;
    document.getElementById('budget-discount-ves').innerText = `Bs. ${discountVES}`;
    
    document.getElementById('budget-total-amount').innerText = `$${totalUSD.toFixed(2)} USD`;
    document.getElementById('budget-total-ves').innerText = `${totalVES} Bs`;
    
    const vesTitleLabel = document.getElementById('ves-title-label');
    if (vesTitleLabel) {
        vesTitleLabel.innerText = `Total Final en Bolívares (Tasa BCV ${rate.toFixed(2)}):`;
    }
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
async function renderEHRView(filter = 'all', searchQuery = '') {
    const listGroup = document.getElementById('ehr-patient-list');
    if (!listGroup) return;

    listGroup.innerHTML = '';
    const allPatients = await SupabaseDataService.getPatients();
    let patients = [...allPatients];
    const activeId = getActivePatientId() || (patients[0] ? patients[0].id : null);
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    // Apply Filter
    if (filter !== 'all') {
        patients = patients.filter(p => p.status === filter);
    }

    // Apply Search
    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        patients = patients.filter(p => 
            (p.fullname && p.fullname.toLowerCase().includes(q)) || 
            (p.id && p.id.toLowerCase().includes(q)) || 
            (p.phone && p.phone.includes(q))
        );
    }

    if (patients.length === 0) {
        listGroup.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-user-slash" style="display:block; font-size:1.5rem; margin-bottom:6px;"></i>Sin coincidencias</div>`;
    } else {
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
                // Keep the current filters when reloading EHR view on selection
                const actF = document.querySelector('#view-ehr .filter-btn.active');
                const filterVal = actF ? actF.dataset.filter : 'all';
                const searchVal = document.getElementById('ehr-patient-search') ? document.getElementById('ehr-patient-search').value : '';
                await renderEHRView(filterVal, searchVal);
            };
            listGroup.appendChild(item);
        });
    }

    if (activeId) {
        const activePatient = allPatients.find(p => p.id === activeId);
        if (activePatient) {
            document.getElementById('ehr-patient-fullname').innerText = activePatient.fullname;
            document.getElementById('ehr-patient-subinfo').innerText = `Cédula: ${activePatient.id} | Edad: ${calculateAge(activePatient.birthdate)} años | Tel: ${activePatient.phone}`;
            
            const meta = activePatient.metadata || {};

            // 1. Resumen Tab
            const summaryFiliation = document.getElementById('ehr-summary-filiation');
            if (summaryFiliation) {
                let repInfo = '';
                if (meta.type === 'Infantil') {
                    repInfo = `
                        <div style="grid-column: span 2; border: 1px dashed var(--border-color); padding: 10px; border-radius: 8px; background:#f8fafc; margin-top:8px;">
                            <strong style="color:var(--primary-cyan); font-size:0.8rem;"><i class="fa-solid fa-user-shield"></i> Representante Legal:</strong>
                            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:0.8rem; margin-top:4px;">
                                <div><strong>Nombre:</strong> ${meta.repName || 'N/A'}</div>
                                <div><strong>Cédula:</strong> ${meta.repId || 'N/A'}</div>
                                <div><strong>Teléfono:</strong> ${meta.repPhone || 'N/A'}</div>
                                <div><strong>Parentesco:</strong> ${meta.repRelation || 'N/A'}</div>
                            </div>
                        </div>
                    `;
                }

                summaryFiliation.innerHTML = `
                    <div><strong>Tipo de Paciente:</strong> ${meta.type || 'Adulto'}</div>
                    <div><strong>Edad:</strong> ${meta.age || calculateAge(activePatient.birthdate)} años</div>
                    <div><strong>Sexo:</strong> ${meta.gender || 'N/A'}</div>
                    <div><strong>Profesión / Ocupación:</strong> ${activePatient.occupation || meta.profession || 'N/A'}</div>
                    <div><strong>Teléfono Principal:</strong> ${activePatient.phone || 'N/A'}</div>
                    <div><strong>Correo Electrónico:</strong> ${activePatient.email || 'N/A'}</div>
                    <div style="grid-column: span 2;"><strong>Dirección Habitación:</strong> ${meta.address || 'N/A'}</div>
                    <div style="grid-column: span 2;"><strong>Motivo de Consulta:</strong> ${meta.consultReason || 'N/A'}</div>
                    <div><strong>Contacto Emergencia:</strong> ${activePatient.emergencyContact || 'Sin registrar'}</div>
                    <div><strong>Medicación Actual:</strong> ${activePatient.medication || 'Sin registrar'}</div>
                    ${repInfo}
                `;
            }

            const gallery = document.getElementById('ehr-photo-gallery');
            if (gallery) {
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
            }

            // 2. Anamnesis Tab
            const anamnesisContent = document.getElementById('ehr-anamnesis-content');
            if (anamnesisContent) {
                anamnesisContent.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 15px; padding: 10px;">
                        <div class="details-section">
                            <h4 style="margin: 0 0 10px 0; color: #dc2626;"><i class="fa-solid fa-notes-medical"></i> Cuestionario de Anamnesis Clínica</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.88rem;">
                                <div><strong>¿Bajo tratamiento médico?:</strong> ${meta.medicalTreatment || 'NO'} ${meta.medicalTreatmentDetails ? `(${meta.medicalTreatmentDetails})` : ''}</div>
                                <div><strong>Enfermedades de la Niñez:</strong> ${meta.childDiseases || 'Ninguna'}</div>
                                <div><strong>¿Alergias?:</strong> ${meta.hasAllergies || 'NO'} ${meta.allergiesDetails ? `(${meta.allergiesDetails})` : ''}</div>
                                <div><strong>Intervenciones Quirúrgicas (Qx):</strong> ${meta.surgeries || 'Ninguna'}</div>
                                <div><strong>¿Sangra mucho al cortarse?:</strong> ${meta.bleedingIssue || 'NO'}</div>
                                <div><strong>Trastornos respiratorios (Amígdalas/Adenoides):</strong> ${meta.respiratoryIssues || 'NO'} ${meta.respiratoryIssuesDetails ? `(${meta.respiratoryIssuesDetails})` : ''}</div>
                                <div><strong>¿Reacción anormal a anestesia?:</strong> ${meta.anesthesiaReaction || 'NO'} ${meta.anesthesiaReactionDetails ? `(${meta.anesthesiaReactionDetails})` : ''}</div>
                                <div><strong>¿Alérgico a la Penicilina?:</strong> ${meta.penicillinAllergy || 'NO'} ${meta.penicillinAllergyDetails ? `(${meta.penicillinAllergyDetails})` : ''}</div>
                                <div style="grid-column: span 2;"><strong>¿Problemas del corazón / Cardiopatías?:</strong> ${meta.heartIssues || 'NO'} ${meta.heartIssuesDetails ? `(${meta.heartIssuesDetails})` : ''}</div>
                            </div>
                        </div>

                        <div class="details-section" style="border-top: 1px dashed var(--border-color); padding-top: 10px;">
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-face-smile"></i> Examen Extraoral y Tejidos Bucales</h4>
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
                            <h4 style="margin: 0 0 10px 0; color: var(--primary-cyan);"><i class="fa-solid fa-hand-holding-hand"></i> Hábitos Bucales y Disfunciones</h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.88rem;">
                                <div><strong>Deglución Anormal:</strong> ${meta.habitSwallowing || 'NO'}</div>
                                <div><strong>Onicofagia:</strong> ${meta.habitNailbiting || 'NO'}</div>
                                <div><strong>Succión Digital:</strong> ${meta.habitThumbsucking || 'NO'} ${meta.habitThumbsuckingFinger ? `(${meta.habitThumbsuckingFinger})` : ''}</div>
                                <div><strong>Respirador Bucal:</strong> ${meta.habitMouthbreather || 'NO'}</div>
                                <div><strong>Frecuencia de Hábitos:</strong> ${meta.habitFrequency || 'N/A'}</div>
                                <div><strong>Intensidad de Hábitos:</strong> ${meta.habitIntensity || 'N/A'}</div>
                                <div style="grid-column: span 2;"><strong>Otros Hábitos:</strong> ${meta.habitOthers || 'Ninguno'}</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 3. Odontograma Tab
            const initialWrapper = document.getElementById('ehr-od-initial-view');
            const currentWrapper = document.getElementById('ehr-od-current-view');
            if (initialWrapper && currentWrapper) {
                initialWrapper.innerHTML = `<div id="od-snap-initial"></div>`;
                currentWrapper.innerHTML = `<div id="od-snap-current"></div>`;
                new OdontogramEngine('od-snap-initial', { initialData: { "18-Oclusal": "patology", "36-Oclusal": "patology" } });
                new OdontogramEngine('od-snap-current', { initialData: activePatient.odontogramData || {} });
            }

            // 4. Tratamientos & Sesiones Tab
            const plan = meta.initialTreatmentPlan || { treatmentName: 'Tratamiento General', totalSessions: 6, interval: 'Quincenal' };
            const completed = activePatient.sessions ? activePatient.sessions.length : 0;
            const pct = Math.min(100, Math.round((completed / plan.totalSessions) * 100));

            document.getElementById('ehr-treatment-name-display').innerText = plan.treatmentName;
            document.getElementById('ehr-sessions-percent-display').innerText = `${pct}% (${completed} de ${plan.totalSessions} sesiones)`;
            const bar = document.getElementById('ehr-sessions-progress-bar');
            if (bar) bar.style.width = `${pct}%`;

            const timeline = document.getElementById('ehr-sessions-timeline');
            timeline.innerHTML = '';
            
            if (activePatient.sessions && activePatient.sessions.length > 0) {
                const sortedSessions = [...activePatient.sessions].sort((a, b) => b.sessionNum - a.sessionNum);
                
                sortedSessions.forEach(s => {
                    let matsHtml = '';
                    if (s.materials && s.materials.length > 0) {
                        matsHtml = '<div style="margin-top:8px; font-size:0.75rem; color:#64748b;"><strong>Insumos descargados:</strong> ';
                        matsHtml += s.materials.map(m => `${m.name} (x${m.qty})`).join(', ');
                        matsHtml += '</div>';
                    }

                    const deleteSessionBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" style="margin-left:8px;" onclick="deleteSessionFromPatient('${activePatient.id}', ${s.sessionNum})" title="Eliminar Sesión"><i class="fa-solid fa-trash"></i></button>`;

                    const div = document.createElement('div');
                    div.className = 'timeline-item';
                    div.innerHTML = `
                        <div class="timeline-meta" style="display:flex; justify-content:space-between; align-items:center;">
                            <span><strong>Sesión N° ${s.sessionNum}</strong> — <i class="fa-solid fa-clock"></i> ${s.datetime}</span>
                            <div>
                                <span class="badge-tag green">Evolución</span>
                                ${deleteSessionBtn}
                            </div>
                        </div>
                        <p style="margin:8px 0; font-size:0.88rem; color:#1e293b;">${s.procedure}</p>
                        ${s.indications ? `<p style="margin:4px 0; font-size:0.8rem; color:#0284c7;"><strong>Indicaciones:</strong> ${s.indications}</p>` : ''}
                        ${matsHtml}
                        ${s.signatureData ? `
                        <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                            <span style="font-size:0.75rem; color:#64748b;">Firma de conformidad:</span>
                            <img src="${s.signatureData}" style="max-height: 40px; border:1px solid var(--border-color); border-radius:4px; padding:2px; background:#fff;" alt="Firma de conformidad del paciente">
                        </div>` : ''}
                    `;
                    timeline.appendChild(div);
                });
            } else {
                timeline.innerHTML = `<p class="text-muted text-center" style="padding:12px;">No hay sesiones evolutivas registradas en este tratamiento. Haga clic en "+ Registrar Nueva Sesión" para comenzar.</p>`;
            }

            // Bind sessions add button
            const addSessBtn = document.getElementById('btn-add-session');
            if (addSessBtn) {
                addSessBtn.onclick = async () => {
                    document.getElementById('s-num').value = completed + 1;
                    document.getElementById('s-datetime').value = new Date().toISOString().slice(0, 16);
                    document.getElementById('s-procedure').value = '';
                    document.getElementById('s-next-notes').value = '';

                    const inventory = await SupabaseDataService.getInventory();
                    const container = document.getElementById('session-materials-container');
                    container.innerHTML = '';
                    inventory.forEach(item => {
                        const row = document.createElement('div');
                        row.style.display = 'flex';
                        row.style.justifyContent = 'space-between';
                        row.style.alignItems = 'center';
                        row.style.padding = '4px 0';
                        row.style.borderBottom = '1px dashed var(--border-color)';
                        row.innerHTML = `
                            <label style="font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px;">
                                <input type="checkbox" class="session-mat-checkbox" data-code="${item.code}">
                                <span>${item.name} <small class="text-muted">(${item.currentStock} ${item.unit})</small></span>
                            </label>
                            <input type="number" class="session-mat-qty form-control" data-code="${item.code}" min="1" max="${item.currentStock}" value="1" style="width:60px; padding:2px; font-size:0.8rem;" disabled>
                        `;
                        const chk = row.querySelector('.session-mat-checkbox');
                        const qtyIn = row.querySelector('.session-mat-qty');
                        chk.onchange = () => {
                            qtyIn.disabled = !chk.checked;
                        };
                        container.appendChild(row);
                    });

                    window.sessionSigPad = setupSignaturePad('session-signature-canvas', 'btn-clear-session-signature');
                    openModal('modal-session');
                };
            }

            // 5. Pagos Tab
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
                payTbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Sin registro de pagos o saldos pendientes. Haga clic en "+ Registrar Abono" arriba.</td></tr>`;
            }
        }
    }

    document.querySelectorAll('#view-ehr .subtab-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('#view-ehr .subtab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#view-ehr .subtab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const target = document.getElementById(`subtab-${this.dataset.subtab}`);
            if (target) target.classList.add('active');
        };
    });
}

function setupSignaturePad(canvasId, clearBtnId) {
    const canvas = document.getElementById(canvasId);
    const clearBtn = document.getElementById(clearBtnId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;

    function getCoords(e) {
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches[0]) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function startDraw(e) {
        drawing = true;
        const coords = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
    }

    function draw(e) {
        if (!drawing) return;
        e.preventDefault();
        const coords = getCoords(e);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    }

    function stopDraw() {
        drawing = false;
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDraw);
    canvas.addEventListener('mouseleave', stopDraw);

    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDraw);

    if (clearBtn) {
        clearBtn.onclick = (e) => {
            e.preventDefault();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }

    return {
        canvas,
        ctx,
        isEmpty: () => {
            const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
            return !buffer.some(color => color !== 0);
        },
        getDataURL: () => canvas.toDataURL()
    };
}

window.deleteSessionFromPatient = async function(patientId, sessionNum) {
    const user = getCurrentUser();
    if (user && user.role.toLowerCase().includes('asistente')) {
        Swal.fire({ icon: 'warning', title: 'Acción denegada', text: 'Solo los Odontólogos o Administradores pueden eliminar sesiones.' });
        return;
    }

    Swal.fire({
        title: '¿Eliminar evolución de sesión?',
        text: 'Esta acción no se puede deshacer.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const patients = await SupabaseDataService.getPatients();
            const p = patients.find(pat => pat.id === patientId);
            if (p && p.sessions) {
                p.sessions = p.sessions.filter(s => s.sessionNum !== sessionNum);
                await SupabaseDataService.savePatient(p);
                await renderEHRView();
                Swal.fire({ icon: 'success', title: 'Sesión eliminada', timer: 1500, showConfirmButton: false });
            }
        }
    });
};

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

    // Dynamic Header / Footer configuration
    let headerHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
            <div>
                <h1 style="font-family: 'Outfit', sans-serif; font-size: 1.6rem; color: #0284c7; margin: 0;">🦷 DentalCare Pro</h1>
                <p style="font-size: 0.8rem; color: #64748b; margin: 2px 0 0 0;">Consultorio Odontológico Unipersonal | Expediente Clínico Oficial</p>
                <small style="font-size: 0.72rem; color: #94a3b8;">Odontólogo: Dr. Alejandro Silva (MPPS-84920 / C.O.V-14920)</small>
            </div>
            <div style="text-align: right;">
                <span style="display: inline-block; background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.75rem;">HISTORIA CLÍNICA</span>
                <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 0 0;">Emisión: ${nowStr}</p>
            </div>
        </div>
    `;

    let footerHtml = `
        <div style="font-size:0.75rem; color:#64748b; text-align:center; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">
            Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.
        </div>
    `;

    try {
        const config = await SupabaseDataService.getStationeryConfig();
        if (config) {
            if (config.footer_text) {
                footerHtml = `
                    <div style="font-size:0.75rem; color:#64748b; text-align:center; margin-top:20px; border-top:1px solid #e2e8f0; padding-top:10px;">
                        ${config.footer_text}
                    </div>
                `;
            }
            let busData = null;
            try { busData = JSON.parse(config.header_text); } catch(e) {}
            if (busData) {
                const logo = config.logo_url ? `<img src="${config.logo_url}" style="max-height: 60px; max-width: 60px; object-fit: contain; margin-right: 15px;" alt="Logo Negocio">` : '';
                headerHtml = `
                    <div style="display: flex; align-items: center; border-bottom: 2px solid #0284c7; padding-bottom: 15px; margin-bottom: 20px;">
                        ${logo}
                        <div style="flex:1;">
                            <h1 style="font-family: 'Outfit', sans-serif; font-size: 1.5rem; color: #0284c7; margin: 0;">${busData.name}</h1>
                            <p style="font-size: 0.78rem; color: #475569; margin: 2px 0 0 0;">${busData.type} | RIF: ${busData.rif}</p>
                            <small style="font-size: 0.72rem; color: #64748b; display:block; margin-top:2px;">Dirección: ${busData.address} | Tel: ${busData.phone}</small>
                        </div>
                        <div style="text-align: right; margin-left:15px;">
                            <span style="display: inline-block; background: #e0f2fe; color: #0284c7; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 0.72rem;">HISTORIA CLÍNICA</span>
                            <p style="font-size: 0.65rem; color: #94a3b8; margin: 4px 0 0 0;">Emisión: ${nowStr}</p>
                        </div>
                    </div>
                `;
            }
        }
    } catch(e) {
        console.error("Error setting custom PDF header:", e);
    }

    // Doctor signature display
    const user = getCurrentUser();
    let signatureHtml = '<div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 6px;"></div>';
    if (user) {
        const sig = (user.doctorProfile && user.doctorProfile.signature) || (user.doctor_profile && user.doctor_profile.signature);
        if (sig) {
            signatureHtml = `
                <div style="height: 50px; display:flex; align-items:center; justify-content:center; margin-bottom: 6px;">
                    <img src="${sig}" style="max-height: 50px; object-fit: contain;" alt="Firma Médica">
                </div>
                <div style="border-bottom: 1px solid #0f172a; margin-bottom: 6px;"></div>
            `;
        }
    }

    const container = document.createElement('div');
    container.style.padding = '30px';
    container.style.fontFamily = "'Inter', Arial, sans-serif";
    container.style.color = '#0f172a';
    container.style.backgroundColor = '#ffffff';

    container.innerHTML = `
        <!-- HEADER -->
        ${headerHtml}

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
                ${signatureHtml}
                <span style="font-size: 0.78rem; color: #475569; font-weight: 600;">Firma del Médico Odontólogo</span>
            </div>
            <div style="width: 200px;">
                <div style="border-bottom: 1px solid #0f172a; height: 50px; margin-bottom: 6px;"></div>
                <span style="font-size: 0.78rem; color: #475569; font-weight: 600;">Firma del Paciente / Titular</span>
            </div>
        </div>

        ${footerHtml}
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

async function renderAgendaView(filter = 'all', searchQuery = '') {
    const agendaListMain = document.getElementById('agenda-list-main');
    if (!agendaListMain) return;

    agendaListMain.innerHTML = '';
    let appointments = await SupabaseDataService.getAppointments();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    // Apply Filter
    if (filter !== 'all') {
        const todayStr = new Date().toISOString().split('T')[0];
        if (filter === 'today') {
            appointments = appointments.filter(app => app.date === todayStr || app.date === 'today' || app.date === 'today-appt');
        } else if (filter === 'week') {
            const today = new Date();
            const nextWeek = new Date();
            nextWeek.setDate(today.getDate() + 7);
            const todayTime = today.getTime();
            const nextWeekTime = nextWeek.getTime();
            appointments = appointments.filter(app => {
                const appDate = new Date(app.date);
                return appDate.getTime() >= todayTime && appDate.getTime() <= nextWeekTime;
            });
        } else {
            appointments = appointments.filter(app => app.status === filter);
        }
    }

    // Apply Search
    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        appointments = appointments.filter(app => 
            (app.patientName && app.patientName.toLowerCase().includes(q)) ||
            (app.patientId && app.patientId.toLowerCase().includes(q)) ||
            (app.treatment && app.treatment.toLowerCase().includes(q))
        );
    }

    if (appointments.length === 0) {
        agendaListMain.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><i class="fa-solid fa-calendar-xmark" style="font-size:2rem; margin-bottom:10px; display:block;"></i>No se encontraron citas con los filtros activos.</div>`;
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

        const gCalBtn = `
            <button class="btn btn-xs btn-outline" style="margin-left: 6px; border-color: #2563eb; color: #2563eb;" onclick="addApptToGoogleCalendarDirect('${app.id}')" title="Añadir a Google Calendar">
                <i class="fa-solid fa-calendar-plus"></i> Calendar
            </button>
        `;

        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.style.marginBottom = '12px';
        div.innerHTML = `
            <div class="timeline-meta">
                <span class="timeline-time"><i class="fa-solid fa-clock"></i> ${app.time}</span>
                <div class="timeline-actions">
                    <span class="badge-tag blue">${app.status}</span>
                    ${whatsappBtnHtml}
                    ${gCalBtn}
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

window.getGoogleCalendarLinkForAppt = function(appt) {
    // Parse hour and minutes from time string (e.g. "09:30 AM", "3:00 PM", "9")
    let hours = 9;
    let minutes = 0;
    const match = (appt.time || '').match(/(\d+):?(\d*)\s*(AM|PM)?/i);
    if (match) {
        hours = parseInt(match[1]);
        if (match[2]) minutes = parseInt(match[2]);
        const ampm = match[3] ? match[3].toUpperCase() : '';
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
    }

    // Target Date
    const targetDate = new Date();
    if (appt.isTomorrow || appt.date === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    targetDate.setHours(hours, minutes, 0, 0);

    const pad = (num) => String(num).padStart(2, '0');
    const startStr = `${targetDate.getFullYear()}${pad(targetDate.getMonth() + 1)}${pad(targetDate.getDate())}T${pad(targetDate.getHours())}${pad(targetDate.getMinutes())}00`;
    
    // End time is 1 hour later
    targetDate.setHours(targetDate.getHours() + 1);
    const endStr = `${targetDate.getFullYear()}${pad(targetDate.getMonth() + 1)}${pad(targetDate.getDate())}T${pad(targetDate.getHours())}${pad(targetDate.getMinutes())}00`;

    const title = encodeURIComponent(`Cita: ${appt.patientName}`);
    const details = encodeURIComponent(`Tratamiento: ${appt.treatment}\nPaciente C.I: ${appt.patientId}`);
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${details}`;
};

window.addApptToGoogleCalendarDirect = async function(apptId) {
    const appointments = await SupabaseDataService.getAppointments();
    const appt = appointments.find(a => a.id === apptId);
    if (!appt) return;
    const url = window.getGoogleCalendarLinkForAppt(appt);
    window.open(url, '_blank');
};

window.sendWhatsAppReminderForAppt = async function(apptId) {
    const appointments = await SupabaseDataService.getAppointments();
    const appt = appointments.find(a => a.id === apptId);
    if (!appt) return;

    const patients = await SupabaseDataService.getPatients();
    let patient = patients.find(p => p.id === appt.patientId || p.fullname.toLowerCase() === appt.patientName.toLowerCase());

    const phone = patient ? patient.phone : prompt(`Ingrese el número de WhatsApp del paciente ${appt.patientName}:`, "+584141234567");
    if (!phone) return;

    const tomorrowStr = new Date(Date.now() + 86400000).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    
    // Generate calendar link for patient
    const calendarLink = window.getGoogleCalendarLinkForAppt(appt);
    const msg = WhatsAppService.generateAppointmentReminderMessage(appt.patientName, tomorrowStr, appt.time, appt.treatment, calendarLink);
    
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
async function renderInventoryTable(filter = 'all', searchQuery = '') {
    const tbody = document.getElementById('inventory-table-body');
    if (!tbody || !window.kardex) return;

    tbody.innerHTML = '';
    let items = await SupabaseDataService.getInventory();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    // Apply Filter
    if (filter !== 'all') {
        if (filter === 'low_stock') {
            items = items.filter(item => item.currentStock <= (item.minStock || 5));
        } else if (filter === 'expired') {
            const today = new Date();
            const threshold = new Date();
            threshold.setDate(today.getDate() + 30); // 30 days buffer
            items = items.filter(item => {
                if (!item.expiryDate) return false;
                const expiry = new Date(item.expiryDate);
                return expiry.getTime() <= threshold.getTime();
            });
        }
    }

    // Apply Search
    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        items = items.filter(item => 
            (item.code && item.code.toLowerCase().includes(q)) ||
            (item.name && item.name.toLowerCase().includes(q)) ||
            (item.category && item.category.toLowerCase().includes(q))
        );
    }

    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 24px;">No se encontraron insumos con los filtros activos.</td></tr>`;
        return;
    }

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

async function renderPricingTable(filter = 'all', searchQuery = '') {
    const tbody = document.getElementById('pricing-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    let baremo = await SupabaseDataService.getBaremo();
    const rate = getExchangeRate();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    // Apply Filter
    if (filter !== 'all') {
        baremo = baremo.filter(p => p.category === filter);
    }

    // Apply Search
    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        baremo = baremo.filter(p => 
            (p.code && p.code.toLowerCase().includes(q)) ||
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.category && p.category.toLowerCase().includes(q))
        );
    }

    if (baremo.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 24px;">No se encontraron servicios con los filtros activos.</td></tr>`;
        return;
    }

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
async function renderUsersTable(filter = 'all', searchQuery = '') {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    let users = await SupabaseDataService.getUsers();

    // Apply Filter
    if (filter !== 'all') {
        users = users.filter(u => {
            if (!u.role) return false;
            const role = u.role.toLowerCase();
            const f = filter.toLowerCase();
            return role.includes(f) || (f === 'médico' && (role.includes('odontólogo') || role.includes('médico') || role.includes('especialista') || role.includes('cirujano')));
        });
    }

    // Apply Search
    if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        users = users.filter(u => 
            (u.fullname && u.fullname.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.role && u.role.toLowerCase().includes(q))
        );
    }

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">No se encontraron usuarios con los filtros activos.</td></tr>`;
        return;
    }

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
    initPatientStepperWizard();
    initSettingsEvents();

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

    const saveSessionBtn = document.getElementById('btn-save-session');
    if (saveSessionBtn) {
        saveSessionBtn.onclick = async (e) => {
            e.preventDefault();
            const activeId = getActivePatientId();
            if (!activeId) return;

            const sessionNum = parseInt(document.getElementById('s-num').value);
            const datetime = document.getElementById('s-datetime').value.replace('T', ' ');
            const procedure = document.getElementById('s-procedure').value.trim();
            const indications = document.getElementById('s-next-notes').value.trim();

            if (!procedure) {
                Swal.fire({ icon: 'warning', title: 'Campos Vacíos', text: 'Por favor describa la evolución o procedimiento de la sesión.' });
                return;
            }

            if (window.sessionSigPad && window.sessionSigPad.isEmpty()) {
                Swal.fire({ icon: 'warning', title: 'Firma Requerida', text: 'El paciente debe firmar digitalmente la sesión para constatar conformidad.' });
                return;
            }

            const signatureData = window.sessionSigPad ? window.sessionSigPad.getDataURL() : '';

            // Extract materials used
            const materials = [];
            const checkboxes = document.querySelectorAll('.session-mat-checkbox:checked');
            for (const chk of checkboxes) {
                const code = chk.dataset.code;
                const qtyInput = document.querySelector(`.session-mat-qty[data-code="${code}"]`);
                const qty = parseInt(qtyInput.value) || 1;
                materials.push({ code, qty });
            }

            try {
                // Fetch active patient
                const patients = await SupabaseDataService.getPatients();
                const patient = patients.find(p => p.id === activeId);
                if (!patient) return;

                if (!patient.sessions) patient.sessions = [];
                
                // Construct new session
                const sessionObj = {
                    sessionNum,
                    datetime,
                    procedure,
                    indications,
                    signatureData,
                    materials: []
                };

                // Deduct materials from stock
                const inventory = await SupabaseDataService.getInventory();
                for (const m of materials) {
                    const item = inventory.find(inv => inv.code === m.code);
                    if (item) {
                        const newStock = Math.max(0, item.currentStock - m.qty);
                        item.currentStock = newStock;
                        
                        // Update stock locally and in cloud
                        if (window.kardex) window.kardex.updateStock(m.code, newStock);
                        await SupabaseDataService.saveInventoryItem(item);
                        
                        sessionObj.materials.push({
                            code: m.code,
                            name: item.name,
                            qty: m.qty
                        });
                    }
                }

                patient.sessions.push(sessionObj);
                await SupabaseDataService.savePatient(patient);

                closeModal('modal-session');
                await renderEHRView();
                await renderInventoryTable();
                await renderDashboard();

                Swal.fire({ icon: 'success', title: 'Sesión Registrada', text: 'La evolución de la sesión y firma de conformidad fueron guardadas exitosamente.', timer: 2000, showConfirmButton: false });
            } catch(err) {
                console.error("Error saving patient session:", err);
                Swal.fire({ icon: 'error', title: 'Error al Guardar', text: err.message || err });
            }
        };
    }

    // Direct Patient Select Dropdown Listener
    const odPatientSelect = document.getElementById('od-patient-select');
    if (odPatientSelect) {
        odPatientSelect.onchange = async (e) => {
            const val = e.target.value;
            const searchInput = document.getElementById('od-patient-search-input');
            if (searchInput) searchInput.value = '';
            
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

    // Direct Custom Item Input Add Handler
    const btnAddCustomDirect = document.getElementById('btn-add-custom-item-direct');
    if (btnAddCustomDirect) {
        btnAddCustomDirect.onclick = async (e) => {
            e.preventDefault();
            const toothVal = document.getElementById('custom-item-tooth').value.trim() || 'General';
            const nameVal = document.getElementById('custom-item-name').value.trim();
            const priceVal = parseFloat(document.getElementById('custom-item-price').value) || 0;

            if (!nameVal || priceVal <= 0) {
                Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Escriba el nombre del procedimiento y un precio válido.' });
                return;
            }

            const doctors = await getDoctorsList();
            const defaultDoc = doctors[0] ? doctors[0].fullname : 'Dr. Alejandro Silva';

            currentBudgetItems.push({
                key: 'custom-' + Date.now(),
                tooth: toothVal,
                face: toothVal.toLowerCase() === 'general' ? 'Gnl' : 'Gnl',
                serviceCode: '',
                name: nameVal,
                price: priceVal,
                specialist: defaultDoc
            });

            await autoSaveActivePatientOdontogram();
            renderBudgetTable();

            // Clear inputs for next entry
            document.getElementById('custom-item-name').value = '';
            Swal.fire({ icon: 'success', title: '¡Item Agregado!', timer: 1200, showConfirmButton: false });
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
    document.querySelectorAll('#view-patients .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-patients .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('patient-table-search') ? document.getElementById('patient-table-search').value : '';
            await renderPatientsTable(this.dataset.filter, searchVal);
        };
    });

    const patientSearchInput = document.getElementById('patient-table-search');
    if (patientSearchInput) {
        patientSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-patients .filter-btn.active');
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

    // === EXCEL IMPORT/EXPORT MASTER LOGIC ===
    
    // 0. PATIENTS EXCEL TEMPLATE & IMPORT
    const btnDownloadPatTemplate = document.getElementById('btn-download-patients-template');
    if (btnDownloadPatTemplate) {
        btnDownloadPatTemplate.onclick = () => {
            const data = [
                {
                    "Cédula / ID": "V-18492102",
                    "Nombre Completo": "María Elena Rodríguez",
                    "Fecha Nacimiento (AAAA-MM-DD)": "1988-04-12",
                    "Teléfono": "+584141234567",
                    "Correo Electrónico": "maria.rodriguez@gmail.com",
                    "Ocupación": "Ingeniero de Sistemas",
                    "Alergias (separadas por comas)": "Penicilina",
                    "Enfermedades Sistémicas (separadas por comas)": "Hipertensión",
                    "Medicamentos que Toma": "Enalapril 10mg diario por la mañana",
                    "Contacto de Emergencia": "Carlos Rodríguez (Esposo) - 0412-9876543",
                    "Estado (Activo / En Tratamiento / Presupuesto Pendiente)": "Activo"
                },
                {
                    "Cédula / ID": "V-22105894",
                    "Nombre Completo": "Carlos Eduardo Mendoza",
                    "Fecha Nacimiento (AAAA-MM-DD)": "1994-09-25",
                    "Teléfono": "+584249876543",
                    "Correo Electrónico": "carlos.mendoza@hotmail.com",
                    "Ocupación": "Diseñador Gráfico",
                    "Alergias (separadas por comas)": "",
                    "Enfermedades Sistémicas (separadas por comas)": "",
                    "Medicamentos que Toma": "Ninguno",
                    "Contacto de Emergencia": "Ana Mendoza (Madre) - 0416-1112233",
                    "Estado (Activo / En Tratamiento / Presupuesto Pendiente)": "Presupuesto Pendiente"
                }
            ];
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Pacientes");
            XLSX.writeFile(workbook, "plantilla_pacientes.xlsx");
        };
    }

    const btnImportPat = document.getElementById('btn-import-patients');
    const importPatFile = document.getElementById('import-patients-file');
    if (btnImportPat && importPatFile) {
        btnImportPat.onclick = () => importPatFile.click();
        importPatFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            Swal.fire({
                title: 'Cargando Excel...',
                text: 'Procesando los registros de pacientes.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        Swal.fire({ icon: 'warning', title: 'Archivo vacío', text: 'El archivo Excel no contiene filas.' });
                        return;
                    }

                    let count = 0;
                    for (const row of jsonData) {
                        const id = (row["Cédula / ID"] || row["ID"] || "").toString().trim();
                        const fullname = (row["Nombre Completo"] || "").toString().trim();
                        const birthdate = (row["Fecha Nacimiento (AAAA-MM-DD)"] || row["Fecha Nacimiento"] || "").toString().trim();
                        const phone = (row["Teléfono"] || "").toString().trim();
                        const email = (row["Correo Electrónico"] || row["Email"] || "").toString().trim();
                        const occupation = (row["Ocupación"] || "").toString().trim();
                        const allergiesStr = (row["Alergias (separadas por comas)"] || row["Alergias"] || "").toString().trim();
                        const systemicStr = (row["Enfermedades Sistémicas (separadas por comas)"] || row["Enfermedades Sistémicas"] || "").toString().trim();
                        const medication = (row["Medicamentos que Toma"] || row["Medicamentos"] || "").toString().trim();
                        const emergencyContact = (row["Contacto de Emergencia"] || "").toString().trim();
                        const status = (row["Estado (Activo / En Tratamiento / Presupuesto Pendiente)"] || row["Estado"] || "Activo").toString().trim();

                        if (id && fullname && birthdate && phone) {
                            const allergies = allergiesStr ? allergiesStr.split(',').map(s => s.trim()) : [];
                            const systemic = systemicStr ? systemicStr.split(',').map(s => s.trim()) : [];

                            const patientObj = {
                                id,
                                fullname,
                                birthdate,
                                phone,
                                email,
                                occupation,
                                allergies,
                                systemic,
                                medication,
                                emergencyContact,
                                status,
                                createdAt: new Date().toISOString().split('T')[0],
                                odontogramData: {},
                                clinicalNotes: [],
                                photos: [],
                                payments: [],
                                metadata: {
                                    type: 'Adulto',
                                    age: calculateAge(birthdate),
                                    gender: 'Masculino',
                                    address: '',
                                    mobilePhone: phone,
                                    localPhone: '',
                                    workPhone: '',
                                    profession: occupation,
                                    consultReason: '',
                                    repName: '',
                                    repId: '',
                                    repPhone: '',
                                    repRelation: '',
                                    medicalTreatment: 'No',
                                    medicalTreatmentDetails: '',
                                    childDiseases: '',
                                    hasAllergies: allergiesStr ? 'Sí' : 'No',
                                    allergiesDetails: allergiesStr,
                                    surgeries: '',
                                    bleedingIssue: 'No',
                                    respiratoryIssues: 'No',
                                    respiratoryIssuesDetails: '',
                                    anesthesiaReaction: 'No',
                                    anesthesiaReactionDetails: '',
                                    penicillinAllergy: allergiesStr.toLowerCase().includes('penicil') ? 'Sí' : 'No',
                                    penicillinAllergyDetails: '',
                                    heartIssues: 'No',
                                    heartIssuesDetails: '',
                                    tissueHardPalate: 'Normal',
                                    tissueSoftPalate: 'Normal',
                                    tissueMouthFloor: 'Normal',
                                    tissueCheeks: 'Normal',
                                    tissueTongue: 'Normal',
                                    tissueFrenum: 'Normal',
                                    habitSwallowing: 'No',
                                    habitNailbiting: 'No',
                                    habitThumbsucking: 'No',
                                    habitThumbsuckingFinger: '',
                                    habitOthers: '',
                                    habitMouthbreather: 'No',
                                    habitFrequency: '',
                                    habitIntensity: ''
                                }
                            };

                            await SupabaseDataService.savePatient(patientObj);
                            count++;
                        }
                    }

                    await renderPatientsTable();
                    Swal.fire({ icon: 'success', title: '¡Importación Completada!', text: `Se cargaron/actualizaron ${count} pacientes correctamente.` });
                } catch (err) {
                    console.error("Error al importar pacientes:", err);
                    Swal.fire({ icon: 'error', title: 'Error de Lectura', text: `No se pudo procesar el archivo Excel. Detalle: ${err.message || err}` });
                } finally {
                    importPatFile.value = '';
                }
            };
            reader.onerror = () => {
                Swal.fire({ icon: 'error', title: 'Error de Lectura', text: 'No se pudo leer el archivo físico.' });
                importPatFile.value = '';
            };
            reader.readAsArrayBuffer(file);
        };
    }
    
    // 1. SERVICES EXCEL TEMPLATE & IMPORT
    const btnDownloadSrvTemplate = document.getElementById('btn-download-services-template');
    if (btnDownloadSrvTemplate) {
        btnDownloadSrvTemplate.onclick = () => {
            const data = [
                {
                    "Código": "OD-01",
                    "Categoría": "Diagnóstico",
                    "Nombre del Servicio": "Consulta y Diagnóstico Clínico + Rx Periapical",
                    "Precio Base (USD)": 25.00,
                    "Tiempo en Silla (Minutos)": 20,
                    "Bono Higienista (USD)": 5.00
                },
                {
                    "Código": "OP-01",
                    "Categoría": "Operatoria",
                    "Nombre del Servicio": "Restauración Fotocurada (Resina Clase I)",
                    "Precio Base (USD)": 45.00,
                    "Tiempo en Silla (Minutos)": 45,
                    "Bono Higienista (USD)": 10.00
                }
            ];
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Servicios");
            XLSX.writeFile(workbook, "plantilla_servicios.xlsx");
        };
    }

    const btnImportSrv = document.getElementById('btn-import-services');
    const importSrvFile = document.getElementById('import-services-file');
    if (btnImportSrv && importSrvFile) {
        btnImportSrv.onclick = () => importSrvFile.click();
        importSrvFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            Swal.fire({
                title: 'Cargando Excel...',
                text: 'Procesando los registros de servicios.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        Swal.fire({ icon: 'warning', title: 'Archivo vacío', text: 'El archivo Excel no contiene filas.' });
                        return;
                    }

                    let count = 0;
                    for (const row of jsonData) {
                        const code = (row["Código"] || "").toString().trim();
                        const category = (row["Categoría"] || "General").toString().trim();
                        const name = (row["Nombre del Servicio"] || row["Nombre del Tratamiento"] || "").toString().trim();
                        const priceUSD = parseFloat(row["Precio Base (USD)"] || row["Precio Base"] || 0);
                        const chairTimeMin = parseInt(row["Tiempo en Silla (Minutos)"] || row["Tiempo en Silla"] || 30);
                        const hygienistBonus = parseFloat(row["Bono Higienista (USD)"] || row["Bono Higienista"] || 0);

                        if (code && name) {
                            await SupabaseDataService.saveBaremoService({
                                code,
                                category,
                                name,
                                priceUSD,
                                chairTimeMin,
                                materials: [],
                                hygienistBonus
                            });
                            count++;
                        }
                    }

                    await renderPricingTable();
                    Swal.fire({ icon: 'success', title: '¡Importación Completada!', text: `Se cargaron/actualizaron ${count} servicios correctamente.` });
                } catch (err) {
                    console.error("Error al importar servicios:", err);
                    Swal.fire({ icon: 'error', title: 'Error de Lectura', text: `No se pudo procesar el archivo Excel. Detalle: ${err.message || err}` });
                } finally {
                    importSrvFile.value = '';
                }
            };
            reader.onerror = () => {
                Swal.fire({ icon: 'error', title: 'Error de Lectura', text: 'No se pudo leer el archivo físico.' });
                importSrvFile.value = '';
            };
            reader.readAsArrayBuffer(file);
        };
    }

    // 2. MATERIALS EXCEL TEMPLATE & IMPORT
    const btnDownloadMatTemplate = document.getElementById('btn-download-materials-template');
    if (btnDownloadMatTemplate) {
        btnDownloadMatTemplate.onclick = () => {
            const data = [
                {
                    "Código": "INS-01",
                    "Nombre del Insumo": "Resina Nanohíbrida A2 (Jeringa 4g)",
                    "Categoría": "Material de Restauración",
                    "Stock Actual": 8,
                    "Stock Mínimo": 3,
                    "Unidad de Medida": "Jeringa",
                    "Fecha de Vencimiento (AAAA-MM-DD)": "2027-05-15"
                },
                {
                    "Código": "INS-02",
                    "Nombre del Insumo": "Cartuchos Anestesia Lidocaína 2%",
                    "Categoría": "Anestésicos",
                    "Stock Actual": 45,
                    "Stock Mínimo": 20,
                    "Unidad de Medida": "Cartuchos",
                    "Fecha de Vencimiento (AAAA-MM-DD)": "2026-11-30"
                }
            ];
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Insumos");
            XLSX.writeFile(workbook, "plantilla_insumos.xlsx");
        };
    }

    const btnImportMat = document.getElementById('btn-import-materials');
    const importMatFile = document.getElementById('import-materials-file');
    if (btnImportMat && importMatFile) {
        btnImportMat.onclick = () => importMatFile.click();
        importMatFile.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            Swal.fire({
                title: 'Cargando Excel...',
                text: 'Procesando los registros de insumos y materiales.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    if (jsonData.length === 0) {
                        Swal.fire({ icon: 'warning', title: 'Archivo vacío', text: 'El archivo Excel no contiene filas.' });
                        return;
                    }

                    let count = 0;
                    for (const row of jsonData) {
                        const code = (row["Código"] || "").toString().trim();
                        const name = (row["Nombre del Insumo"] || "").toString().trim();
                        const category = (row["Categoría"] || "Materiales").toString().trim();
                        const currentStock = parseInt(row["Stock Actual"] || 0);
                        const minStock = parseInt(row["Stock Mínimo"] || 0);
                        const unit = (row["Unidad de Medida"] || "Unidades").toString().trim();
                        const expiryDate = row["Fecha de Vencimiento (AAAA-MM-DD)"] || null;

                        if (code && name) {
                            await SupabaseDataService.saveInventoryItem({
                                code,
                                name,
                                category,
                                unit,
                                currentStock,
                                minStock,
                                expiryDate
                            });
                            count++;
                        }
                    }

                    await renderInventoryTable();
                    await renderDashboard();
                    Swal.fire({ icon: 'success', title: '¡Importación Completada!', text: `Se cargaron/actualizaron ${count} insumos correctamente.` });
                } catch (err) {
                    console.error("Error al importar insumos:", err);
                    Swal.fire({ icon: 'error', title: 'Error de Lectura', text: `No se pudo procesar el archivo Excel. Detalle: ${err.message || err}` });
                } finally {
                    importMatFile.value = '';
                }
            };
            reader.onerror = () => {
                Swal.fire({ icon: 'error', title: 'Error de Lectura', text: 'No se pudo leer el archivo físico.' });
                importMatFile.value = '';
            };
            reader.readAsArrayBuffer(file);
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
        const triggerGoogleCalendarWebhook = async (appt) => {
            const webhookUrl = localStorage.getItem('dental_google_calendar_webhook');
            if (!webhookUrl) return;
            try {
                // Parse hours and minutes from time string (e.g. "09:30 AM", "3:00 PM", "9")
                let hours = 9;
                let minutes = 0;
                const match = (appt.time || '').match(/(\d+):?(\d*)\s*(AM|PM)?/i);
                if (match) {
                    hours = parseInt(match[1]);
                    if (match[2]) minutes = parseInt(match[2]);
                    const ampm = match[3] ? match[3].toUpperCase() : '';
                    if (ampm === 'PM' && hours < 12) hours += 12;
                    if (ampm === 'AM' && hours === 12) hours = 0;
                }

                // Calculate actual target date
                const targetDate = new Date();
                if (appt.isTomorrow) {
                    targetDate.setDate(targetDate.getDate() + 1);
                }
                targetDate.setHours(hours, minutes, 0, 0);
                const startDateISO = targetDate.toISOString();

                // End date is 1 hour later
                targetDate.setHours(targetDate.getHours() + 1);
                const endDateISO = targetDate.toISOString();

                await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: appt.id,
                        time: appt.time,
                        patientName: appt.patientName,
                        patientId: appt.patientId,
                        treatment: appt.treatment,
                        status: appt.status,
                        isTomorrow: appt.isTomorrow,
                        date: appt.date || new Date().toISOString().split('T')[0],
                        startDateISO,
                        endDateISO,
                        timestamp: new Date().toISOString()
                    })
                });
                console.log('Google Calendar Webhook triggered successfully!');
            } catch (err) {
                console.error('Error triggering Google Calendar Webhook:', err);
            }
        };

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

            const appointmentObj = {
                id: 'appt-' + Date.now(),
                time,
                patientName,
                patientId,
                treatment,
                status: 'Programada',
                isTomorrow: dayTarget === 'tomorrow',
                date: dayTarget
            };

            await SupabaseDataService.saveAppointment(appointmentObj);

            closeModal('modal-appointment');
            await renderDashboard();
            await renderAgendaView();

            Swal.fire({
                icon: 'success',
                title: '¡Cita Agendada!',
                text: 'La cita ha sido añadida a la agenda.',
                showCancelButton: true,
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                confirmButtonText: '<i class="fa-solid fa-calendar-plus"></i> Añadir a Google Calendar',
                cancelButtonText: 'Cerrar'
            }).then((result) => {
                if (result.isConfirmed) {
                    window.addApptToGoogleCalendarDirect(appointmentObj.id);
                }
            });
        };
    }

    const btnQuickP = document.getElementById('btn-quick-patient');
    if (btnQuickP) {
        btnQuickP.onclick = () => {
            if (window.selectRegisterFlow) window.selectRegisterFlow();
            else openModal('modal-patient');
        };
    }
    
    const btnNewPM = document.getElementById('btn-new-patient-modal');
    if (btnNewPM) {
        btnNewPM.onclick = () => {
            if (window.selectRegisterFlow) window.selectRegisterFlow();
            else openModal('modal-patient');
        };
    }

    const btnNewUM = document.getElementById('btn-new-user-modal');
    if (btnNewUM) btnNewUM.onclick = () => openModal('modal-user');

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.onclick = () => closeModal(btn.dataset.close);
    });

    // Agenda View Filters and Search Handler
    document.querySelectorAll('#view-agenda .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-agenda .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('agenda-table-search') ? document.getElementById('agenda-table-search').value : '';
            await renderAgendaView(this.dataset.filter, searchVal);
        };
    });
    const agendaSearchInput = document.getElementById('agenda-table-search');
    if (agendaSearchInput) {
        agendaSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-agenda .filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderAgendaView(activeFilter, e.target.value);
        });
    }

    // EHR View Filters and Search Handler
    document.querySelectorAll('#view-ehr .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-ehr .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('ehr-patient-search') ? document.getElementById('ehr-patient-search').value : '';
            await renderEHRView(this.dataset.filter, searchVal);
        };
    });
    const ehrSearchInput = document.getElementById('ehr-patient-search');
    if (ehrSearchInput) {
        ehrSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-ehr .filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderEHRView(activeFilter, e.target.value);
        });
    }

    // Servicios / Pricing View Filters and Search Handler
    document.querySelectorAll('#view-pricing .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-pricing .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('pricing-table-search') ? document.getElementById('pricing-table-search').value : '';
            await renderPricingTable(this.dataset.filter, searchVal);
        };
    });
    const pricingSearchInput = document.getElementById('pricing-table-search');
    if (pricingSearchInput) {
        pricingSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-pricing .filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderPricingTable(activeFilter, e.target.value);
        });
    }

    // Insumos / Inventory View Filters and Search Handler
    document.querySelectorAll('#view-inventory .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-inventory .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('inventory-table-search') ? document.getElementById('inventory-table-search').value : '';
            await renderInventoryTable(this.dataset.filter, searchVal);
        };
    });
    const inventorySearchInput = document.getElementById('inventory-table-search');
    if (inventorySearchInput) {
        inventorySearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-inventory .filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderInventoryTable(activeFilter, e.target.value);
        });
    }

    // Personal / Users View Filters and Search Handler
    document.querySelectorAll('#view-users .filter-btn').forEach(btn => {
        btn.onclick = async function() {
            document.querySelectorAll('#view-users .filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const searchVal = document.getElementById('users-table-search') ? document.getElementById('users-table-search').value : '';
            await renderUsersTable(this.dataset.filter, searchVal);
        };
    });
    const usersSearchInput = document.getElementById('users-table-search');
    if (usersSearchInput) {
        usersSearchInput.addEventListener('input', async (e) => {
            const activeFilterBtn = document.querySelector('#view-users .filter-btn.active');
            const activeFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';
            await renderUsersTable(activeFilter, e.target.value);
        });
    }

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

            const getVal = (id) => {
                const el = document.getElementById(id);
                return el ? el.value.trim() : '';
            };
            const getChecked = (id) => {
                const el = document.getElementById(id);
                return el ? (el.checked ? 'Sí' : 'No') : 'No';
            };

            const id = getVal('p-id');
            const firstname = getVal('p-firstname');
            const lastname = getVal('p-lastname');
            const fullname = `${firstname} ${lastname}`.trim();
            const birthdate = getVal('p-birthdate');
            const phone = getVal('p-mobile-phone');

            if (!id || !firstname || !lastname || !birthdate || !phone) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const allergies = Array.from(document.querySelectorAll('input[name="p-allergies"]:checked')).map(cb => cb.value);
            const systemic = Array.from(document.querySelectorAll('input[name="p-systemic"]:checked')).map(cb => cb.value);
            const medication = getVal('p-medication');
            const emergencyContact = getVal('p-emergency');

            // Extract all detailed metadata fields
            const type = getVal('p-type') || 'Adulto';
            const age = parseInt(getVal('p-age')) || 0;
            const gender = getVal('p-gender') || 'Femenino';
            const address = getVal('p-address');
            const mobilePhone = getVal('p-mobile-phone');
            const localPhone = getVal('p-local-phone');
            const workPhone = getVal('p-work-phone');
            const profession = getVal('p-profession');
            const consultReason = getVal('p-consult-reason');

            const repName = getVal('p-rep-name');
            const repId = getVal('p-rep-id');
            const repPhone = getVal('p-rep-phone');
            const repRelation = getVal('p-rep-relation');

            const medicalTreatment = getChecked('p-medical-treatment');
            const medicalTreatmentDetails = getVal('p-medical-treatment-details');
            const childDiseases = getVal('p-child-diseases');
            const hasAllergies = getChecked('p-has-allergies');
            const allergiesDetails = getVal('p-allergies-details');
            const surgeries = getVal('p-surgeries');
            const bleedingIssue = getChecked('p-bleeding-issue');
            const respiratoryIssues = getChecked('p-respiratory-issues');
            const respiratoryIssuesDetails = getVal('p-respiratory-issues-details');
            const anesthesiaReaction = getChecked('p-anesthesia-reaction');
            const anesthesiaReactionDetails = getVal('p-anesthesia-reaction-details');
            const penicillinAllergy = getChecked('p-penicillin-allergy');
            const penicillinAllergyDetails = getVal('p-penicillin-allergy-details');
            const heartIssues = getChecked('p-heart-issues');
            const heartIssuesDetails = getVal('p-heart-issues-details');

            const tissueHardPalate = getVal('p-tissue-hard-palate');
            const tissueSoftPalate = getVal('p-tissue-soft-palate');
            const tissueMouthFloor = getVal('p-tissue-mouth-floor');
            const tissueCheeks = getVal('p-tissue-cheeks');
            const tissueTongue = getVal('p-tissue-tongue');
            const tissueFrenum = getVal('p-tissue-frenum');

            const habitSwallowing = getChecked('p-habit-swallowing');
            const habitNailbiting = getChecked('p-habit-nailbiting');
            const habitThumbsucking = getChecked('p-habit-thumbsucking');
            const habitThumbsuckingFinger = getVal('p-habit-thumbsucking-finger');
            const habitOthers = getVal('p-habit-others');
            const habitMouthbreather = getChecked('p-habit-mouthbreather');
            const habitFrequency = getVal('p-habit-frequency');
            const habitIntensity = getVal('p-habit-intensity');

            // Collect sessions data from step 4
            const sessionsData = [];
            const planSessionsContainer = document.getElementById('plan-sessions-container');
            const bItems = window.currentBudgetItems || [];
            if (planSessionsContainer && bItems.length > 0) {
                const sessionBlocks = planSessionsContainer.querySelectorAll('.session-date-input');
                sessionBlocks.forEach(input => {
                    const sessionNum = parseInt(input.dataset.session);
                    const dateVal = input.value;
                    const timeSelect = planSessionsContainer.querySelector(`.session-time-select[data-session="${sessionNum}"]`);
                    const timeVal = timeSelect ? timeSelect.value : '09:00 AM';
                    const checkedBoxes = planSessionsContainer.querySelectorAll(`.session-service-checkbox[data-session="${sessionNum}"]:checked`);
                    const services = Array.from(checkedBoxes).map(cb => {
                        const idx = parseInt(cb.dataset.itemIdx);
                        return bItems[idx];
                    });
                    sessionsData.push({
                        sessionNumber: sessionNum,
                        date: dateVal,
                        time: timeVal,
                        services: services
                    });
                });
            }

            let patientToSave = {};

            try {
                if (typeof wizardMode !== 'undefined' && wizardMode === 'clinical_complete') {
                    // Update mode - Fetch patient, merge clinical info, preserve odontogram, notes, etc.
                    const patients = await SupabaseDataService.getPatients();
                    const existing = patients.find(p => p.id === id);
                    if (!existing) {
                        throw new Error(`No se encontró el paciente seleccionado (${id}) en el sistema.`);
                    }

                    patientToSave = {
                        ...existing,
                        allergies,
                        systemic,
                        medication,
                        emergencyContact,
                        metadata: {
                            ...(existing.metadata || {}),
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
                            habitIntensity,
                            initTreatmentName: getVal('p-init-treatment-name'),
                            initTreatmentSessions: getVal('p-init-treatment-sessions'),
                            initTreatmentInterval: getVal('p-init-treatment-interval'),
                            sessionsPlan: sessionsData
                        }
                    };
                } else {
                    // New registration (filiación básica)
                    // Check duplicate ID
                    const patients = await SupabaseDataService.getPatients();
                    const duplicate = patients.find(p => p.id === id);
                    if (duplicate) {
                        Swal.fire({ icon: 'error', title: 'Cédula Duplicada', text: 'Ya existe un paciente registrado con esta Cédula / ID.' });
                        return;
                    }

                    patientToSave = {
                        id,
                        fullname,
                        birthdate,
                        phone,
                        email: getVal('p-email'),
                        occupation: profession,
                        allergies: [],
                        systemic: [],
                        medication: '',
                        emergencyContact: '',
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
                            repRelation
                        }
                    };
                }

                await SupabaseDataService.savePatient(patientToSave);
                
                // Create automatically scheduled appointments for each session with a date
                if (sessionsData && sessionsData.length > 0) {
                    let appointmentsScheduledCount = 0;
                    for (const session of sessionsData) {
                        if (session.date) {
                            const servicesText = session.services && session.services.length > 0
                                ? session.services.map(s => `Pza ${s.tooth || 'Gnl'}: ${s.name}`).join(', ')
                                : 'Tratamiento Planificado';
                            
                            const apptId = 'appt-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
                            const appt = {
                                id: apptId,
                                patientId: id,
                                patientName: fullname,
                                date: session.date,
                                time: session.time || "09:00 AM",
                                treatment: `Sesión ${session.sessionNumber}: ${servicesText}`,
                                status: "Programada",
                                isTomorrow: false
                            };
                            await SupabaseDataService.saveAppointment(appt);
                            appointmentsScheduledCount++;
                        }
                    }
                    if (appointmentsScheduledCount > 0) {
                        await renderAgendaView(); // Reload agenda immediately
                    }
                }

                closeModal('modal-patient');
                setActivePatientId(id);
                await renderPatientsTable();
                Swal.fire({ icon: 'success', title: '¡Paciente Guardado!', text: `${fullname} ha sido guardado exitosamente en la nube de Supabase.`, timer: 2000, showConfirmButton: false });
            } catch (err) {
                console.error("Error al guardar paciente:", err);
                Swal.fire({
                    icon: 'error',
                    title: 'Error de Servidor / Supabase',
                    text: `No se pudo guardar el paciente. Detalle: ${err.message || err}`
                });
            }
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

    // Setup payment selector buttons click handler
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
        btn.onclick = function() {
            document.querySelectorAll('.pay-method-btn').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = 'var(--text-main)';
                b.style.borderColor = 'var(--border-color)';
            });
            this.classList.add('active');
            this.style.background = '#0d9488';
            this.style.color = '#fff';
            this.style.borderColor = '#0d9488';
            
            const method = this.getAttribute('data-method');
            const select = document.getElementById('budget-payment-method');
            if (select) {
                select.value = method;
                select.dispatchEvent(new Event('change'));
            }
        };
    });

    const approveBudgetBtn = document.getElementById('btn-approve-budget');
    if (approveBudgetBtn) {
        approveBudgetBtn.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'info', title: 'Seleccione un paciente', text: 'Por favor active un paciente antes de aprobar el presupuesto.' });
                return;
            }
            const patients = await SupabaseDataService.getPatients();
            const patient = patients.find(p => p.id === activeId);
            if (!patient) return;

            if (currentBudgetItems.length === 0) {
                Swal.fire({ icon: 'warning', title: 'Presupuesto vacío', text: 'Agregue al menos un tratamiento al presupuesto.' });
                return;
            }

            // Deduct materials from Kardex
            currentBudgetItems.forEach(item => {
                if (item.serviceCode) {
                    window.kardex.deductForTreatment(item.serviceCode);
                }
            });

            // Calculate totals
            const rate = getExchangeRate();
            let subtotalUSD = 0;
            currentBudgetItems.forEach(item => {
                subtotalUSD += item.price;
            });
            const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
            const discountAmountUSD = subtotalUSD * (discountPct / 100);
            const totalUSD = subtotalUSD - discountAmountUSD;
            const totalVES = (totalUSD * rate).toFixed(2);
            const discountVES = (discountAmountUSD * rate).toFixed(2);

            const paymentModeSelect = document.getElementById('payment-mode-select');
            const paymentModeText = paymentModeSelect.options[paymentModeSelect.selectedIndex].text;
            const paymentMethodSelect = document.getElementById('budget-payment-method');
            const paymentMethod = paymentMethodSelect.value;
            const paymentMethodLabel = paymentMethodSelect.options[paymentMethodSelect.selectedIndex].text;
            
            const notes = document.getElementById('budget-notes').value;
            const consentText = document.getElementById('consent-text').value;

            // Generate or load budget invoice record ID
            const invoiceId = activeEditingBudgetId || `PRE-${Date.now().toString().slice(-6)}`;
            const invoiceObj = {
                id: invoiceId,
                patientId: patient.id,
                invoiceDate: new Date().toISOString().split('T')[0],
                paymentMethod: paymentMethod,
                paymentTerms: paymentModeText,
                currency: 'REF',
                items: currentBudgetItems.map(item => ({
                    code: item.serviceCode,
                    name: item.name,
                    price: item.price,
                    specialist: item.specialist || ''
                })),
                totalRef: totalUSD,
                totalBcv: parseFloat(totalVES),
                status: 'Aprobado',
                footerText: `Descuento global del ${discountPct}% aplicado. Ahorro: $${discountAmountUSD.toFixed(2)}.`
            };

            try {
                // Save Invoice
                await SupabaseDataService.saveInvoice(invoiceObj);

                // Save in patient clinical notes
                if (!patient.clinicalNotes) patient.clinicalNotes = [];
                patient.clinicalNotes.unshift({
                    id: 'note-' + Date.now(),
                    datetime: new Date().toISOString().slice(0, 16).replace('T', ' '),
                    content: `Presupuesto Aprobado y Certificado (${invoiceObj.id}). Subtotal: $${subtotalUSD.toFixed(2)}, Descuento: ${discountPct}% (-$${discountAmountUSD.toFixed(2)}), Total: $${totalUSD.toFixed(2)}. Método de pago: ${paymentMethodLabel}. Consentimiento: ${consentText}. Observaciones: ${notes}`,
                    paymentUSD: 0
                });

                // Save in patient payments history
                if (!patient.payments) patient.payments = [];
                patient.payments.unshift({
                    date: invoiceObj.invoiceDate,
                    concept: `Presupuesto Aprobado ${invoiceObj.id}`,
                    totalUSD: totalUSD,
                    paidUSD: totalUSD,
                    balanceUSD: 0,
                    status: 'Pagado',
                    method: paymentMethod
                });

                await SupabaseDataService.savePatient(patient);

                activeEditingBudgetId = invoiceId;
                await renderBudgetListView();

                Swal.fire({
                    icon: 'success',
                    title: '¡Presupuesto Aprobado y Certificado!',
                    text: `Se registró la transacción ${invoiceId} en el historial financiero y clínico del paciente.`,
                    timer: 3500,
                    showConfirmButton: true
                });
            } catch (err) {
                console.error("Error al aprobar presupuesto:", err);
                Swal.fire({ icon: 'error', title: 'Error de Guardado', text: 'No se pudo guardar la aprobación en la base de datos.' });
            }
        };
    }

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

            if (currentBudgetItems.length === 0) {
                Swal.fire({ icon: 'warning', title: 'Presupuesto vacío', text: 'Agregue al menos un tratamiento al presupuesto.' });
                return;
            }

            // Calculate totals
            let subtotalUSD = 0;
            currentBudgetItems.forEach(item => {
                subtotalUSD += item.price;
            });
            const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
            const discountAmountUSD = subtotalUSD * (discountPct / 100);
            const totalUSD = subtotalUSD - discountAmountUSD;

            const paymentModeSelect = document.getElementById('payment-mode-select');
            const paymentModeText = paymentModeSelect.options[paymentModeSelect.selectedIndex].text;
            const paymentMethodSelect = document.getElementById('budget-payment-method');
            const paymentMethodLabel = paymentMethodSelect.options[paymentMethodSelect.selectedIndex].text;
            
            const notes = document.getElementById('budget-notes').value;
            const consentText = document.getElementById('consent-text').value;

            const msg = WhatsAppService.generateBudgetMessage(patient, currentBudgetItems, totalUSD, paymentModeText, notes, subtotalUSD, discountPct, paymentMethodLabel);
            WhatsAppService.sendToPatient(patient.phone, msg);
        };
    }

    const customizeWpBtn = document.getElementById('btn-customize-whatsapp');
    if (customizeWpBtn) {
        customizeWpBtn.onclick = async () => {
            const currentTemplate = WhatsAppService.getTemplate();
            const { value: text } = await Swal.fire({
                title: 'Personalizar Mensaje de WhatsApp',
                input: 'textarea',
                inputLabel: 'Plantilla del Mensaje',
                inputValue: currentTemplate,
                inputAttributes: {
                    rows: 12,
                    style: 'font-family: monospace; font-size: 0.85rem;'
                },
                footer: '<div style="font-size:0.75rem; text-align:left; color:#555;">Variables disponibles:<br><b>{PACIENTE}</b>, <b>{CLINICA}</b>, <b>{SUBTOTAL_USD}</b>, <b>{DESCUENTO_PCT}</b>, <b>{TOTAL_USD}</b>, <b>{TOTAL_BS}</b>, <b>{METODO_PAGO}</b>, <b>{LINK_PRESUPUESTO}</b></div>',
                showCancelButton: true,
                confirmButtonText: 'Guardar Plantilla',
                cancelButtonText: 'Cancelar'
            });

            if (text) {
                WhatsAppService.saveTemplate(text);
                Swal.fire({ icon: 'success', title: '¡Plantilla guardada!', timer: 1500, showConfirmButton: false });
            }
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

    // Historial y Listado de Presupuestos Buttons
    const btnNewBudget = document.getElementById('btn-new-budget');
    if (btnNewBudget) {
        btnNewBudget.onclick = async () => {
            activeEditingBudgetId = null;
            setActivePatientId(null);
            currentBudgetItems = [];
            
            const listContainer = document.getElementById('odontogram-list-container');
            const editorContainer = document.getElementById('odontogram-editor-container');
            if (listContainer) listContainer.classList.add('hidden');
            if (editorContainer) editorContainer.classList.remove('hidden');

            await renderOdontogramView();
            
            document.getElementById('budget-notes').value = '';
            document.getElementById('budget-discount-input').value = '0';
            
            if (window.doctorSigPad) window.doctorSigPad.clear();
            if (window.patientSigPad) window.patientSigPad.clear();
            
            renderBudgetTable();
        };
    }

    const btnBackToBudgets = document.getElementById('btn-back-to-budgets');
    if (btnBackToBudgets) {
        btnBackToBudgets.onclick = async () => {
            activeEditingBudgetId = null;
            await renderBudgetListView();
        };
    }

    const btnBudgetCompleteHistory = document.getElementById('btn-budget-complete-history');
    if (btnBudgetCompleteHistory) {
        btnBudgetCompleteHistory.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'warning', title: 'Paciente No Seleccionado', text: 'Por favor, seleccione un paciente para el presupuesto primero.' });
                return;
            }
            try {
                const patients = await SupabaseDataService.getPatients();
                const p = patients.find(pat => pat.id === activeId);
                if (p) {
                    if (window.openClinicalWizardForPatientId) {
                        window.openClinicalWizardForPatientId(p);
                    }
                } else {
                    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo encontrar al paciente en el sistema.' });
                }
            } catch(e) {
                console.error("Error launching clinical wizard from budget:", e);
            }
        };
    }

    const btnBillBudgetDirect = document.getElementById('btn-bill-budget-direct');
    if (btnBillBudgetDirect) {
        btnBillBudgetDirect.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'warning', title: 'Seleccione un paciente', text: 'Por favor active un paciente antes de facturar.' });
                return;
            }
            if (currentBudgetItems.length === 0) {
                Swal.fire({ icon: 'warning', title: 'Presupuesto vacío', text: 'Agregue tratamientos al presupuesto.' });
                return;
            }

            const billingTabBtn = document.querySelector('.nav-item[data-tab="billing"]');
            if (billingTabBtn) {
                billingTabBtn.click();
            }

            setTimeout(async () => {
                const billPatientSelect = document.getElementById('bill-patient-select');
                if (billPatientSelect) {
                    billPatientSelect.value = activeId;
                    billPatientSelect.dispatchEvent(new Event('change'));
                }
                
                billingItems = currentBudgetItems.map(item => ({
                    code: item.serviceCode || 'CUSTOM',
                    name: item.name,
                    price: item.price,
                    hygienistBonus: 0,
                    qty: 1
                }));

                const baremo = await SupabaseDataService.getBaremo();
                billingItems.forEach(bi => {
                    const srv = baremo.find(b => b.code === bi.code);
                    if (srv) bi.hygienistBonus = srv.hygienistBonus || 0;
                });

                renderBillingItemsTable();
                Swal.fire({ icon: 'success', title: 'Presupuesto cargado en Factura', text: 'Los tratamientos se cargaron en el módulo de facturación.', timer: 2000, showConfirmButton: false });
            }, 200);
        };
    }

    const btnScheduleBudgetDirect = document.getElementById('btn-schedule-budget-direct');
    if (btnScheduleBudgetDirect) {
        btnScheduleBudgetDirect.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'warning', title: 'Seleccione un paciente', text: 'Por favor active un paciente antes de agendar.' });
                return;
            }
            if (currentBudgetItems.length === 0) {
                Swal.fire({ icon: 'warning', title: 'Presupuesto vacío', text: 'No hay tratamientos para agendar.' });
                return;
            }

            const agendaTabBtn = document.querySelector('.nav-item[data-tab="agenda"]');
            if (agendaTabBtn) {
                agendaTabBtn.click();
            }

            setTimeout(async () => {
                openModal('modal-appointment');
                
                const appPatientSelect = document.getElementById('app-patient-select');
                if (appPatientSelect) {
                    appPatientSelect.value = activeId;
                }

                const treatmentNames = currentBudgetItems.map(item => item.name).join(' + ');
                const appTreatmentInput = document.getElementById('app-treatment');
                if (appTreatmentInput) {
                    appTreatmentInput.value = treatmentNames;
                }
            }, 200);
        };
    }

    const btnUpdateBudgetEdits = document.getElementById('btn-update-budget-edits');
    if (btnUpdateBudgetEdits) {
        btnUpdateBudgetEdits.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'warning', title: 'Seleccione un paciente', text: 'Por favor active un paciente antes de guardar.' });
                return;
            }
            if (currentBudgetItems.length === 0) {
                Swal.fire({ icon: 'warning', title: 'Presupuesto vacío', text: 'Agregue al menos un tratamiento.' });
                return;
            }

            const rate = getExchangeRate();
            let subtotalUSD = 0;
            currentBudgetItems.forEach(item => subtotalUSD += item.price);
            const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
            const discountAmountUSD = subtotalUSD * (discountPct / 100);
            const totalUSD = subtotalUSD - discountAmountUSD;
            const totalVES = (totalUSD * rate).toFixed(2);

            const paymentMethodSelect = document.getElementById('budget-payment-method');
            const paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'pagomovil';
            const notes = document.getElementById('budget-notes').value;

            const budgetId = activeEditingBudgetId || `PRE-${Date.now().toString().slice(-6)}`;
            
            const budgetObj = {
                id: budgetId,
                patientId: activeId,
                invoiceDate: new Date().toISOString().split('T')[0],
                paymentMethod: paymentMethod,
                paymentTerms: 'Contado',
                currency: 'REF',
                items: currentBudgetItems.map(item => ({
                    code: item.serviceCode,
                    name: item.name,
                    price: item.price,
                    specialist: item.specialist || ''
                })),
                totalRef: totalUSD,
                totalBcv: parseFloat(totalVES),
                status: 'Borrador',
                footerText: notes
            };

            try {
                await SupabaseDataService.saveInvoice(budgetObj);
                activeEditingBudgetId = budgetObj.id;
                
                Swal.fire({
                    icon: 'success',
                    title: '¡Presupuesto Guardado!',
                    text: `Se actualizaron los cambios en el presupuesto ${budgetId}.`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (err) {
                console.error(err);
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudieron guardar los cambios.' });
            }
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
            const paymentMethod = document.getElementById('note-payment-method') ? document.getElementById('note-payment-method').value : 'cash';

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
                        status: 'Pagado',
                        method: paymentMethod
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

async function renderSettingsView() {
    const user = getCurrentUser();
    if (!user) return;

    const r = (user.role || '').toLowerCase();
    const isAdmin = r.includes('admin') || r.includes('super');
    const isDoctor = r.includes('medico') || r.includes('odont') || r.includes('doctor') || r.includes('dentista') || r.includes('médico');

    const navButtons = document.querySelectorAll('.settings-nav-btn');
    const panes = document.querySelectorAll('.settings-pane');

    navButtons.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const paneName = btn.dataset.pane;
            
            navButtons.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(`pane-${paneName}`);
            if (targetPane) targetPane.classList.add('active');
        };
    });

    // If not admin, hide business pane and activate profile pane by default
    if (!isAdmin) {
        const paneBus = document.getElementById('pane-business');
        const paneProf = document.getElementById('pane-profile');
        if (paneBus && paneProf) {
            paneBus.classList.remove('active');
            paneProf.classList.add('active');
        }
        const busBtn = document.getElementById('btn-pane-business');
        const profileBtn = document.querySelector('.settings-nav-btn[data-pane="profile"]');
        if (busBtn) busBtn.classList.remove('active');
        if (profileBtn) profileBtn.classList.add('active');
    } else {
        // If admin, default back to business pane active
        const paneBus = document.getElementById('pane-business');
        const paneProf = document.getElementById('pane-profile');
        if (paneBus && paneProf) {
            paneBus.classList.add('active');
            paneProf.classList.remove('active');
        }
        const busBtn = document.getElementById('btn-pane-business');
        const profileBtn = document.querySelector('.settings-nav-btn[data-pane="profile"]');
        if (busBtn) busBtn.classList.add('active');
        if (profileBtn) profileBtn.classList.remove('active');
    }

    if (isAdmin) {
        let config = null;
        try {
            config = await SupabaseDataService.getStationeryConfig();
        } catch(e) {
            console.error("Error fetching stationery config:", e);
        }

        let busData = { name: '', type: 'Consultorio Privado', phone: '', email: '', rif: '', address: '', footer: '', logoUrl: '' };
        if (config) {
            try {
                busData = JSON.parse(config.header_text);
            } catch(e) {
                busData.name = config.header_text || '';
            }
            busData.footer = config.footer_text || '';
            busData.logoUrl = config.logo_url || '';
        }

        document.getElementById('set-bus-name').value = busData.name || '';
        document.getElementById('set-bus-type').value = busData.type || 'Consultorio Privado';
        document.getElementById('set-bus-phone').value = busData.phone || '';
        document.getElementById('set-bus-email').value = busData.email || '';
        document.getElementById('set-bus-rif').value = busData.rif || '';
        document.getElementById('set-bus-address').value = busData.address || '';
        document.getElementById('set-bus-footer').value = busData.footer || '';

        const logoImg = document.getElementById('settings-logo-img');
        const placeholder = document.getElementById('settings-logo-placeholder');
        if (logoImg && placeholder) {
            if (busData.logoUrl) {
                logoImg.src = busData.logoUrl;
                logoImg.classList.remove('hidden');
                placeholder.classList.add('hidden');
            } else {
                logoImg.src = '';
                logoImg.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }
        }
    }

    document.getElementById('set-prof-fullname').value = user.fullname || '';
    document.getElementById('set-prof-email').value = user.email || '';
    document.getElementById('set-prof-phone').value = user.phone || '';
    document.getElementById('set-prof-username').value = user.username || '';

    document.getElementById('set-pwd-current').value = '';
    document.getElementById('set-pwd-new').value = '';
    document.getElementById('set-pwd-confirm').value = '';

    const docSigSection = document.getElementById('doctor-signature-setting-section');
    if (isDoctor || isAdmin) {
        if (docSigSection) docSigSection.classList.remove('hidden');
        window.settingsDoctorSigPad = setupSignaturePad('doctor-signature-canvas', 'btn-clear-doctor-signature');
        
        const sigData = (user.doctorProfile && user.doctorProfile.signature) || (user.doctor_profile && user.doctor_profile.signature);
        const previewContainer = document.getElementById('doctor-signature-preview-img-container');
        const previewImg = document.getElementById('doctor-signature-preview-img');
        if (previewContainer && previewImg) {
            if (sigData) {
                previewImg.src = sigData;
                previewContainer.classList.remove('hidden');
            } else {
                previewImg.src = '';
                previewContainer.classList.add('hidden');
            }
        }
    } else {
        if (docSigSection) docSigSection.classList.add('hidden');
    }
}

async function updateConflictInfoForSession(dateVal, sessionNum) {
    const infoDiv = document.getElementById(`conflict-info-${sessionNum}`);
    if (!infoDiv) return;

    if (!dateVal) {
        infoDiv.innerHTML = '';
        infoDiv.style.background = 'transparent';
        infoDiv.style.border = 'none';
        return;
    }

    infoDiv.innerHTML = '<span style="color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Consultando agenda...</span>';
    infoDiv.style.background = 'rgba(0,0,0,0.02)';
    infoDiv.style.border = '1px solid var(--border-color)';

    try {
        const appts = await SupabaseDataService.getAppointments();
        const dailyAppts = appts.filter(a => a.date === dateVal && a.status !== 'Cancelada');

        if (dailyAppts.length === 0) {
            infoDiv.innerHTML = '<span style="color:#059669; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Día Libre: Sin citas registradas para esta fecha.</span>';
            infoDiv.style.background = 'rgba(5, 150, 105, 0.05)';
            infoDiv.style.border = '1px solid rgba(5, 150, 105, 0.2)';
        } else {
            const times = dailyAppts.map(a => `<strong style="color:var(--text-main); font-weight:700;">${a.time}</strong> (${a.patientName})`).join(', ');
            infoDiv.innerHTML = `<span style="color:#d97706; font-weight: 600;"><i class="fa-solid fa-calendar-check"></i> Citas ocupadas para esta fecha: ${times}</span>`;
            infoDiv.style.background = 'rgba(217, 119, 6, 0.05)';
            infoDiv.style.border = '1px solid rgba(217, 119, 6, 0.2)';
        }
    } catch (err) {
        console.error("Error checking conflict:", err);
        infoDiv.innerHTML = '<span style="color:var(--text-red);">Error al verificar disponibilidad</span>';
        infoDiv.style.background = 'rgba(239, 68, 68, 0.05)';
        infoDiv.style.border = '1px solid rgba(239, 68, 68, 0.2)';
    }
}

function renderSessionsPlanner() {
    const container = document.getElementById('plan-sessions-container');
    if (!container) return;

    const sessionsInput = document.getElementById('p-init-treatment-sessions');
    const sessionsCount = parseInt(sessionsInput ? sessionsInput.value : 0) || 0;

    if (sessionsCount <= 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px;">Indique al menos 1 sesión estimada.</div>';
        return;
    }

    const budgetItems = window.currentBudgetItems || [];
    if (budgetItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px; border: 1px dashed var(--border-color); border-radius:6px; background:var(--bg-main);"><i class="fa-solid fa-triangle-exclamation text-amber"></i> No hay tratamientos cargados en el presupuesto activo para distribuir en las sesiones.</div>';
        return;
    }

    // Preserve current selections, dates and times before redrawing
    const prevData = {};
    container.querySelectorAll('.session-date-input').forEach(input => {
        const sNum = input.dataset.session;
        const timeSelect = container.querySelector(`.session-time-select[data-session="${sNum}"]`);
        prevData[sNum] = {
            date: input.value,
            time: timeSelect ? timeSelect.value : '09:00 AM',
            selectedIdxs: []
        };
    });
    container.querySelectorAll('.session-service-checkbox:checked').forEach(cb => {
        const sNum = cb.dataset.session;
        const idx = cb.dataset.itemIdx;
        if (prevData[sNum]) {
            prevData[sNum].selectedIdxs.push(idx);
        }
    });

    let html = '';
    const timesArray = [
        "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
        "11:00 AM", "11:30 AM", "12:00 PM", "01:00 PM", "01:30 PM", "02:00 PM",
        "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM", "05:00 PM"
    ];

    for (let i = 1; i <= sessionsCount; i++) {
        const defaultDate = prevData[i] ? prevData[i].date : '';
        const savedTime = prevData[i] ? prevData[i].time : '09:00 AM';
        const savedSelected = prevData[i] ? prevData[i].selectedIdxs : [];

        let servicesHtml = '';
        budgetItems.forEach((item, idx) => {
            const isChecked = savedSelected.includes(idx.toString()) ? 'checked' : '';
            servicesHtml += `
                <label style="font-size:0.8rem; display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:normal; margin:0; color: var(--text-main);">
                    <input type="checkbox" class="session-service-checkbox" data-session="${i}" data-item-idx="${idx}" ${isChecked}>
                    Pza ${item.tooth || 'Gnl'} (${item.face || 'Gnl'}): ${item.name}
                </label>
            `;
        });

        let timeOptionsHtml = '';
        timesArray.forEach(t => {
            const isSel = (savedTime === t) ? 'selected' : '';
            timeOptionsHtml += `<option value="${t}" ${isSel}>${t}</option>`;
        });

        html += `
            <div class="card" style="padding: 12px; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
                    <strong style="color:var(--primary-cyan); font-size:0.9rem;"><i class="fa-solid fa-calendar-day"></i> Sesión ${i}</strong>
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <label style="font-size:0.78rem; margin:0; font-weight:600; color:var(--text-muted);">Fecha:</label>
                            <input type="date" class="form-control session-date-input" data-session="${i}" value="${defaultDate}" style="padding:4px 8px; font-size:0.8rem; width:135px; border-radius:4px; border: 1px solid var(--border-color); background: var(--bg-main); color: var(--text-main);">
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <label style="font-size:0.78rem; margin:0; font-weight:600; color:var(--text-muted);">Hora:</label>
                            <select class="form-control session-time-select" data-session="${i}" style="padding:4px 8px; font-size:0.8rem; width:110px; border-radius:4px; border: 1px solid var(--border-color); background: var(--bg-main); color: var(--text-main);">
                                ${timeOptionsHtml}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="session-conflict-info" id="conflict-info-${i}" style="font-size:0.8rem; margin-bottom:10px; padding:6px 10px; border-radius:6px; display:none;"></div>
                <div style="font-size:0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:6px; border-bottom:1px dashed var(--border-color); padding-bottom:4px;">Servicios a realizar:</div>
                <div class="session-services-list" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:8px;">
                    ${servicesHtml}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Attach dynamic date change listener for conflicts checking
    container.querySelectorAll('.session-date-input').forEach(input => {
        const sNum = input.dataset.session;
        
        // Check conflict immediately if a date already exists
        if (input.value) {
            const infoDiv = document.getElementById(`conflict-info-${sNum}`);
            if (infoDiv) infoDiv.style.display = 'block';
            updateConflictInfoForSession(input.value, sNum);
        }

        input.onchange = async () => {
            const infoDiv = document.getElementById(`conflict-info-${sNum}`);
            if (infoDiv) {
                infoDiv.style.display = input.value ? 'block' : 'none';
            }
            await updateConflictInfoForSession(input.value, sNum);
        };
    });
}

function initPatientStepperWizard() {
    let currentStep = 1;
    const totalSteps = 4;
    window.currentPatientId = null;
    window.wizardMode = 'new_basic';

    const btnPrev = document.getElementById('btn-patient-prev');
    const btnNext = document.getElementById('btn-patient-next');
    const btnSave = document.getElementById('btn-save-patient');

    function showStep(step) {
        for (let i = 1; i <= totalSteps; i++) {
            const pane = document.getElementById(`step-content-${i}`);
            const indicator = document.getElementById(`step-ind-${i}`);
            if (pane) {
                if (i === step) {
                    pane.classList.remove('hidden');
                } else {
                    pane.classList.add('hidden');
                }
            }
            if (indicator) {
                if (i === step) {
                    indicator.classList.add('active');
                    indicator.classList.remove('completed');
                } else if (i < step) {
                    indicator.classList.remove('active');
                    indicator.classList.add('completed');
                } else {
                    indicator.classList.remove('active', 'completed');
                }
            }
        }

        if (btnPrev) {
            if (step === 1) {
                btnPrev.setAttribute('disabled', 'true');
            } else {
                btnPrev.removeAttribute('disabled');
            }
        }
        if (btnNext) {
            if (step === totalSteps || (window.wizardMode === 'new_basic' && step === 1)) {
                btnNext.classList.add('hidden');
            } else {
                btnNext.classList.remove('hidden');
            }
        }
        if (btnSave) {
            if (step === totalSteps || (window.wizardMode === 'new_basic' && step === 1)) {
                btnSave.classList.remove('hidden');
            } else {
                btnSave.classList.add('hidden');
            }
        }
        if (step === 4) {
            renderSessionsPlanner();
        }
    }

    if (btnPrev) {
        btnPrev.onclick = (e) => {
            e.preventDefault();
            if (currentStep > 1) {
                currentStep--;
                showStep(currentStep);
            }
        };
    }

    if (btnNext) {
        btnNext.onclick = async (e) => {
            e.preventDefault();
            
            // Validation for Step 1
            if (currentStep === 1) {
                const firstname = document.getElementById('p-firstname') ? document.getElementById('p-firstname').value.trim() : '';
                const lastname = document.getElementById('p-lastname') ? document.getElementById('p-lastname').value.trim() : '';
                const id = document.getElementById('p-id').value.trim();
                const birthdate = document.getElementById('p-birthdate').value;
                const phone = document.getElementById('p-mobile-phone').value.trim();

                if (!firstname || !lastname || !id || !birthdate || !phone) {
                    Swal.fire({ icon: 'warning', title: 'Campos Incompletos', text: 'Por favor complete todos los campos obligatorios del Paso 1.' });
                    return;
                }

                // Check for representative fields if child
                const age = calculateAge(birthdate);
                if (age < 18) {
                    const repName = document.getElementById('p-rep-name').value.trim();
                    const repId = document.getElementById('p-rep-id').value.trim();
                    const repPhone = document.getElementById('p-rep-phone').value.trim();
                    const repRelation = document.getElementById('p-rep-relation').value.trim();

                    if (!repName || !repId || !repPhone || !repRelation) {
                        Swal.fire({ icon: 'warning', title: 'Representante Obligatorio', text: 'El paciente es menor de edad. Por favor complete los datos del representante legal.' });
                        return;
                    }
                }
            }

            if (currentStep < totalSteps) {
                currentStep++;
                showStep(currentStep);
            }
        };
    }

    // Auto calculate age and toggle pediatrician
    const pBirthdate = document.getElementById('p-birthdate');
    if (pBirthdate) {
        pBirthdate.onchange = () => {
            const birthdate = pBirthdate.value;
            if (birthdate) {
                const age = calculateAge(birthdate);
                const pAge = document.getElementById('p-age');
                if (pAge) pAge.value = age;
                
                const pTypeSelect = document.getElementById('p-type');
                const repFieldsDiv = document.getElementById('representative-fields');
                
                if (pTypeSelect && repFieldsDiv) {
                    if (age < 18) {
                        pTypeSelect.value = 'Infantil';
                        repFieldsDiv.classList.remove('hidden');
                        document.getElementById('p-rep-name').setAttribute('required', 'true');
                        document.getElementById('p-rep-id').setAttribute('required', 'true');
                        document.getElementById('p-rep-phone').setAttribute('required', 'true');
                        document.getElementById('p-rep-relation').setAttribute('required', 'true');
                    } else {
                        pTypeSelect.value = 'Adulto';
                        repFieldsDiv.classList.add('hidden');
                        document.getElementById('p-rep-name').removeAttribute('required');
                        document.getElementById('p-rep-id').removeAttribute('required');
                        document.getElementById('p-rep-phone').removeAttribute('required');
                        document.getElementById('p-rep-relation').removeAttribute('required');
                    }
                }
            }
        };
    }

    // Tissue cards interactiveness
    document.querySelectorAll('.tissue-card').forEach(card => {
        const tissueId = card.dataset.tissue;
        const input = document.getElementById(tissueId);
        const badge = card.querySelector('.tissue-status-badge');
        
        card.onclick = (e) => {
            if (e.target === input) return;
            const isNormal = card.classList.contains('normal');
            if (isNormal) {
                card.className = 'tissue-card has-finding';
                if (badge) badge.innerText = 'Con Hallazgo';
                if (input) {
                    input.style.display = 'block';
                    input.focus();
                }
            } else {
                card.className = 'tissue-card normal';
                if (badge) badge.innerText = 'Normal';
                if (input) {
                    input.value = '';
                    input.style.display = 'none';
                }
            }
        };
    });

    // Auto redraw sessions on sessions count change
    const sessionsCountInput = document.getElementById('p-init-treatment-sessions');
    if (sessionsCountInput) {
        sessionsCountInput.onchange = sessionsCountInput.oninput = () => {
            renderSessionsPlanner();
        };
    }

    // Reset wizard state on modal open
    const resetWizard = () => {
        currentStep = 1;
        showStep(currentStep);
        
        // Clear inputs
        document.getElementById('form-patient').reset();
        const repFieldsDiv = document.getElementById('representative-fields');
        if (repFieldsDiv) repFieldsDiv.classList.add('hidden');

        document.querySelectorAll('.tissue-card').forEach(card => {
            card.className = 'tissue-card normal';
            const badge = card.querySelector('.tissue-status-badge');
            if (badge) badge.innerText = 'Normal';
            const input = document.getElementById(card.dataset.tissue);
            if (input) {
                input.value = '';
                input.style.display = 'none';
            }
        });
    };

    const openPatientModalForNew = () => {
        window.currentPatientId = null;
        window.wizardMode = 'new_basic';
        resetWizard();
        
        // Enable Step 1 inputs
        toggleStep1InputsReadonly(false);
        
        // Hide Step indicators 2, 3, 4 and lines
        document.getElementById('step-ind-2').classList.add('hidden');
        document.getElementById('step-ind-3').classList.add('hidden');
        document.getElementById('step-ind-4').classList.add('hidden');
        document.getElementById('step-line-1').classList.add('hidden');
        document.getElementById('step-line-2').classList.add('hidden');
        document.getElementById('step-line-3').classList.add('hidden');
        
        // Show step 1
        showStep(1);
        openModal('modal-patient');
    };

    const openPatientModalForExisting = async () => {
        try {
            const patients = await SupabaseDataService.getPatients();
            if (patients.length === 0) {
                Swal.fire({ icon: 'info', title: 'Sin Pacientes', text: 'No hay pacientes registrados en el sistema para completar su historia.' });
                return;
            }

            const { value: selectedId } = await Swal.fire({
                title: 'Seleccione el Paciente',
                html: `
                    <div style="text-align: left; margin-top: 15px;">
                        <label style="font-weight: 600; margin-bottom: 8px; display: block; color: var(--text-heading); font-size: 0.9rem;">Buscar por Nombre o Cédula:</label>
                        <input type="text" id="swal-patient-search" class="swal2-input" placeholder="Escriba C.I. o Nombre..." style="margin: 0; width: 100%; box-sizing: border-box; border-radius: 6px; font-size: 1rem; padding: 10px 15px; border: 1px solid #cbd5e1;">
                        <div id="swal-patient-results" style="margin-top: 8px; max-height: 150px; overflow-y: auto; background: white; border: 1px solid #cbd5e1; border-radius: 6px; display: none; color: black; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);"></div>
                    </div>
                    <style>
                        .swal-search-item {
                            padding: 10px 14px;
                            cursor: pointer;
                            border-bottom: 1px solid #f1f5f9;
                            text-align: left;
                            transition: background-color 0.2s;
                        }
                        .swal-search-item:hover {
                            background-color: #f8fafc !important;
                        }
                        .swal-search-item strong {
                            color: #0f172a;
                        }
                        .swal-search-item:last-child {
                            border-bottom: none;
                        }
                    </style>
                `,
                showCancelButton: true,
                confirmButtonText: 'Cargar Historia',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#2563eb',
                cancelButtonColor: '#64748b',
                preConfirm: () => {
                    const selId = window.selectedSwalPatientId;
                    if (!selId) {
                        Swal.showValidationMessage('Debe escribir y seleccionar un paciente de las sugerencias filtradas.');
                        return false;
                    }
                    return selId;
                },
                didOpen: () => {
                    const searchInput = document.getElementById('swal-patient-search');
                    const resultsDiv = document.getElementById('swal-patient-results');
                    window.selectedSwalPatientId = null;

                    searchInput.oninput = () => {
                        const q = searchInput.value.trim().toLowerCase();
                        if (q.length < 2) {
                            resultsDiv.style.display = 'none';
                            return;
                        }

                        const matches = patients.filter(p => 
                            p.fullname.toLowerCase().includes(q) || 
                            p.id.toLowerCase().includes(q)
                        );

                        if (matches.length === 0) {
                            resultsDiv.innerHTML = '<div style="padding: 10px; color: #64748b; text-align: center;">Sin coincidencias</div>';
                        } else {
                            resultsDiv.innerHTML = matches.map(p => `
                                <div class="swal-search-item" data-id="${p.id}">
                                    <strong style="color: #1e293b; font-size: 0.9rem;">${p.fullname}</strong><br>
                                    <small style="color: #64748b; font-size: 0.75rem;">C.I: ${p.id}</small>
                                </div>
                            `).join('');

                            resultsDiv.querySelectorAll('.swal-search-item').forEach(item => {
                                item.onclick = () => {
                                    const pId = item.dataset.id;
                                    const match = matches.find(m => m.id === pId);
                                    searchInput.value = `${match.fullname} (C.I: ${match.id})`;
                                    window.selectedSwalPatientId = pId;
                                    resultsDiv.style.display = 'none';
                                };
                            });
                        }
                        resultsDiv.style.display = 'block';
                    };

                    // Close suggestions when clicking outside
                    document.addEventListener('click', (e) => {
                        if (e.target !== searchInput && e.target !== resultsDiv) {
                            resultsDiv.style.display = 'none';
                        }
                    });
                }
            });

            if (selectedId) {
                window.currentPatientId = selectedId;
                window.wizardMode = 'clinical_complete';
                resetWizard();

                const p = patients.find(pat => pat.id === selectedId);
                loadPatientDataIntoForm(p);

                // Disable Step 1 inputs (read-only)
                toggleStep1InputsReadonly(true);

                // Show all indicators and lines
                document.getElementById('step-ind-2').classList.remove('hidden');
                document.getElementById('step-ind-3').classList.remove('hidden');
                document.getElementById('step-ind-4').classList.remove('hidden');
                document.getElementById('step-line-1').classList.remove('hidden');
                document.getElementById('step-line-2').classList.remove('hidden');
                document.getElementById('step-line-3').classList.remove('hidden');

                // Open modal starting at step 1
                showStep(1);
                openModal('modal-patient');
            }
        } catch(e) {
            console.error("Error loading existing patient list:", e);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo cargar la lista de pacientes.' });
        }
    };

    window.openClinicalWizardForPatientId = (patient) => {
        window.currentPatientId = patient.id;
        window.wizardMode = 'clinical_complete';
        resetWizard();

        loadPatientDataIntoForm(patient);

        // Disable Step 1 inputs (read-only)
        toggleStep1InputsReadonly(true);

        // Show all indicators and lines
        document.getElementById('step-ind-2').classList.remove('hidden');
        document.getElementById('step-ind-3').classList.remove('hidden');
        document.getElementById('step-ind-4').classList.remove('hidden');
        document.getElementById('step-line-1').classList.remove('hidden');
        document.getElementById('step-line-2').classList.remove('hidden');
        document.getElementById('step-line-3').classList.remove('hidden');

        // Open modal starting at step 1
        showStep(1);
        openModal('modal-patient');
    };

    window.selectRegisterFlow = async () => {
        // Assistants and Admins register new patients directly (Step 1 Filiación only)
        openPatientModalForNew();
    };

    const btnQuickP = document.getElementById('btn-quick-patient');
    if (btnQuickP) {
        btnQuickP.onclick = window.selectRegisterFlow;
    }
    
    const btnNewPM = document.getElementById('btn-new-patient-modal');
    if (btnNewPM) {
        btnNewPM.onclick = window.selectRegisterFlow;
    }

    const btnEditClinical = document.getElementById('btn-edit-clinical-wizard');
    if (btnEditClinical) {
        btnEditClinical.onclick = async () => {
            const activeId = getActivePatientId();
            if (!activeId) {
                Swal.fire({ icon: 'warning', title: 'Paciente No Seleccionado', text: 'Por favor, seleccione un paciente de la lista de la izquierda primero para completar su historia clínica.' });
                return;
            }
            try {
                const patients = await SupabaseDataService.getPatients();
                const p = patients.find(pat => pat.id === activeId);
                if (p) {
                    window.openClinicalWizardForPatientId(p);
                } else {
                    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo encontrar al paciente en el sistema.' });
                }
            } catch(e) {
                console.error("Error launching clinical wizard:", e);
            }
        };
    }
}

function toggleStep1InputsReadonly(isReadonly) {
    const ids = ['p-type', 'p-id', 'p-firstname', 'p-lastname', 'p-birthdate', 'p-age', 'p-gender', 'p-profession', 'p-mobile-phone', 'p-local-phone', 'p-work-phone', 'p-email', 'p-address', 'p-consult-reason', 'p-rep-name', 'p-rep-id', 'p-rep-phone', 'p-rep-relation'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (isReadonly) {
                el.setAttribute('disabled', 'true');
            } else {
                el.removeAttribute('disabled');
            }
        }
    });
}

function loadPatientDataIntoForm(p) {
    document.getElementById('p-id').value = p.id;
    if (document.getElementById('p-firstname') && p.fullname) {
        const parts = p.fullname.split(' ');
        document.getElementById('p-firstname').value = parts[0] || '';
        document.getElementById('p-lastname').value = parts.slice(1).join(' ') || '';
    }
    document.getElementById('p-birthdate').value = p.birthdate;
    const age = calculateAge(p.birthdate);
    document.getElementById('p-age').value = age;
    document.getElementById('p-mobile-phone').value = p.phone;
    if (document.getElementById('p-email')) document.getElementById('p-email').value = p.email || '';
    if (document.getElementById('p-profession')) document.getElementById('p-profession').value = p.occupation || '';
    
    if (document.getElementById('p-type')) {
        document.getElementById('p-type').value = p.metadata?.type || (age < 18 ? 'Infantil' : 'Adulto');
        document.getElementById('p-birthdate').dispatchEvent(new Event('change'));
    }
    
    if (p.metadata?.gender) {
        document.getElementById('p-gender').value = p.metadata.gender;
    }
    if (p.metadata?.address) {
        document.getElementById('p-address').value = p.metadata.address;
    }
    if (p.metadata?.localPhone) {
        document.getElementById('p-local-phone').value = p.metadata.localPhone;
    }
    if (p.metadata?.workPhone) {
        document.getElementById('p-work-phone').value = p.metadata.workPhone;
    }
    if (p.metadata?.consultReason) {
        document.getElementById('p-consult-reason').value = p.metadata.consultReason;
    }

    if (p.metadata?.repName) document.getElementById('p-rep-name').value = p.metadata.repName;
    if (p.metadata?.repId) document.getElementById('p-rep-id').value = p.metadata.repId;
    if (p.metadata?.repPhone) document.getElementById('p-rep-phone').value = p.metadata.repPhone;
    if (p.metadata?.repRelation) document.getElementById('p-rep-relation').value = p.metadata.repRelation;

    document.querySelectorAll('input[name="p-allergies"]').forEach(cb => cb.checked = false);
    if (p.allergies) {
        p.allergies.forEach(val => {
            const cb = document.querySelector(`input[name="p-allergies"][value="${val}"]`);
            if (cb) cb.checked = true;
        });
    }

    document.querySelectorAll('input[name="p-systemic"]').forEach(cb => cb.checked = false);
    if (p.systemic) {
        p.systemic.forEach(val => {
            const cb = document.querySelector(`input[name="p-systemic"][value="${val}"]`);
            if (cb) cb.checked = true;
        });
    }

    document.getElementById('p-medication').value = p.medication || '';
    document.getElementById('p-emergency').value = p.emergencyContact || '';

    if (p.metadata?.medicalTreatment) document.getElementById('p-medical-treatment').value = p.metadata.medicalTreatment;
    if (p.metadata?.medicalTreatmentDetails) document.getElementById('p-medical-treatment-details').value = p.metadata.medicalTreatmentDetails;
    if (p.metadata?.childDiseases) document.getElementById('p-child-diseases').value = p.metadata.childDiseases;
    if (p.metadata?.hasAllergies) document.getElementById('p-has-allergies').value = p.metadata.hasAllergies;
    if (p.metadata?.allergiesDetails) document.getElementById('p-allergies-details').value = p.metadata.allergiesDetails;
    if (p.metadata?.surgeries) document.getElementById('p-surgeries').value = p.metadata.surgeries;
    if (p.metadata?.bleedingIssue) document.getElementById('p-bleeding-issue').value = p.metadata.bleedingIssue;
    if (p.metadata?.respiratoryIssues) document.getElementById('p-respiratory-issues').value = p.metadata.respiratoryIssues;
    if (p.metadata?.respiratoryIssuesDetails) document.getElementById('p-respiratory-issues-details').value = p.metadata.respiratoryIssuesDetails;
    if (p.metadata?.anesthesiaReaction) document.getElementById('p-anesthesia-reaction').value = p.metadata.anesthesiaReaction;
    if (p.metadata?.anesthesiaReactionDetails) document.getElementById('p-anesthesia-reaction-details').value = p.metadata.anesthesiaReactionDetails;
    if (p.metadata?.penicillinAllergy) document.getElementById('p-penicillin-allergy').value = p.metadata.penicillinAllergy;
    if (p.metadata?.penicillinAllergyDetails) document.getElementById('p-penicillin-allergy-details').value = p.metadata.penicillinAllergyDetails;
    if (p.metadata?.heartIssues) document.getElementById('p-heart-issues').value = p.metadata.heartIssues;
    if (p.metadata?.heartIssuesDetails) document.getElementById('p-heart-issues-details').value = p.metadata.heartIssuesDetails;

    const tissues = ['hardPalate', 'softPalate', 'mouthFloor', 'cheeks', 'tongue', 'frenum'];
    tissues.forEach(t => {
        const key = 'tissue' + t.charAt(0).toUpperCase() + t.slice(1);
        const val = p.metadata?.[key] || '';
        const inputId = 'p-tissue-' + t.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        const input = document.getElementById(inputId);
        const card = document.querySelector(`.tissue-card[data-tissue="${inputId}"]`);
        const badge = card ? card.querySelector('.tissue-status-badge') : null;
        
        if (input) {
            input.value = val;
            if (val) {
                if (card) card.className = 'tissue-card has-finding';
                if (badge) badge.innerText = 'Con Hallazgo';
                input.style.display = 'block';
            } else {
                if (card) card.className = 'tissue-card normal';
                if (badge) badge.innerText = 'Normal';
                input.style.display = 'none';
            }
        }
    });

    if (p.metadata?.habitSwallowing) document.getElementById('p-habit-swallowing').value = p.metadata.habitSwallowing;
    if (p.metadata?.habitNailbiting) document.getElementById('p-habit-nailbiting').value = p.metadata.habitNailbiting;
    if (p.metadata?.habitThumbsucking) document.getElementById('p-habit-thumbsucking').value = p.metadata.habitThumbsucking;
    if (p.metadata?.habitThumbsuckingFinger) document.getElementById('p-habit-thumbsucking-finger').value = p.metadata.habitThumbsuckingFinger;
    if (p.metadata?.habitOthers) document.getElementById('p-habit-others').value = p.metadata.habitOthers;
    if (p.metadata?.habitMouthbreather) document.getElementById('p-habit-mouthbreather').value = p.metadata.habitMouthbreather;
    if (p.metadata?.habitFrequency) document.getElementById('p-habit-frequency').value = p.metadata.habitFrequency;
    if (p.metadata?.habitIntensity) document.getElementById('p-habit-intensity').value = p.metadata.habitIntensity;
}

function initSettingsEvents() {
    const logoUpload = document.getElementById('settings-logo-upload');
    if (logoUpload) {
        logoUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 400;
                        canvas.height = 400;
                        const ctx = canvas.getContext('2d');
                        const minDim = Math.min(img.width, img.height);
                        const sx = (img.width - minDim) / 2;
                        const sy = (img.height - minDim) / 2;
                        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 400, 400);

                        const scaledDataUrl = canvas.toDataURL('image/png');
                        const logoImg = document.getElementById('settings-logo-img');
                        const placeholder = document.getElementById('settings-logo-placeholder');
                        if (logoImg && placeholder) {
                            logoImg.src = scaledDataUrl;
                            logoImg.classList.remove('hidden');
                            placeholder.classList.add('hidden');
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const clearLogoBtn = document.getElementById('btn-clear-settings-logo');
    if (clearLogoBtn) {
        clearLogoBtn.onclick = () => {
            const logoImg = document.getElementById('settings-logo-img');
            const placeholder = document.getElementById('settings-logo-placeholder');
            if (logoImg && placeholder) {
                logoImg.src = '';
                logoImg.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }
        };
    }

    const docSigUpload = document.getElementById('doctor-signature-upload');
    if (docSigUpload) {
        docSigUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.getElementById('doctor-signature-canvas');
                        if (canvas) {
                            const ctx = canvas.getContext('2d');
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                            const w = img.width * scale;
                            const h = img.height * scale;
                            const x = (canvas.width - w) / 2;
                            const y = (canvas.height - h) / 2;
                            ctx.drawImage(img, x, y, w, h);

                            const previewContainer = document.getElementById('doctor-signature-preview-img-container');
                            const previewImg = document.getElementById('doctor-signature-preview-img');
                            if (previewContainer && previewImg) {
                                previewImg.src = canvas.toDataURL();
                                previewContainer.classList.remove('hidden');
                            }
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const formBusiness = document.getElementById('form-settings-business');
    if (formBusiness) {
        formBusiness.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('set-bus-name').value.trim();
            const type = document.getElementById('set-bus-type').value;
            const phone = document.getElementById('set-bus-phone').value.trim();
            const email = document.getElementById('set-bus-email').value.trim();
            const rif = document.getElementById('set-bus-rif').value.trim();
            const address = document.getElementById('set-bus-address').value.trim();
            const footer = document.getElementById('set-bus-footer').value.trim();

            const logoImg = document.getElementById('settings-logo-img');
            const logoUrl = logoImg.classList.contains('hidden') ? '' : logoImg.src;

            const busData = { name, type, phone, email, rif, address };

            try {
                await SupabaseDataService.saveStationeryConfig({
                    id: 'default',
                    header_text: JSON.stringify(busData),
                    footer_text: footer,
                    logo_url: logoUrl
                });
                Swal.fire({ icon: 'success', title: 'Ajustes de Negocio Guardados', text: 'Se actualizaron los membretes clínicos y papelería en la nube de Supabase.', timer: 2500, showConfirmButton: false });
            } catch(err) {
                console.error("Error saving business configuration:", err);
                Swal.fire({ icon: 'error', title: 'Error al Guardar', text: err.message || err });
            }
        };
    }

    const formProfile = document.getElementById('form-settings-profile');
    if (formProfile) {
        formProfile.onsubmit = async (e) => {
            e.preventDefault();
            const currentUser = getCurrentUser();
            if (!currentUser) return;

            const fullname = document.getElementById('set-prof-fullname').value.trim();
            const email = document.getElementById('set-prof-email').value.trim();
            const phone = document.getElementById('set-prof-phone').value.trim();

            const pwdCurrent = document.getElementById('set-pwd-current').value;
            const pwdNew = document.getElementById('set-pwd-new').value;
            const pwdConfirm = document.getElementById('set-pwd-confirm').value;

            if (pwdNew) {
                if (pwdCurrent !== currentUser.password) {
                    Swal.fire({ icon: 'error', title: 'Contraseña Incorrecta', text: 'La contraseña actual ingresada no coincide con su registro.' });
                    return;
                }
                if (pwdNew.length < 6) {
                    Swal.fire({ icon: 'warning', title: 'Contraseña Muy Corta', text: 'La nueva contraseña debe tener al menos 6 caracteres.' });
                    return;
                }
                if (pwdNew !== pwdConfirm) {
                    Swal.fire({ icon: 'error', title: 'Error de Coincidencia', text: 'Las nuevas contraseñas no coinciden.' });
                    return;
                }
                currentUser.password = pwdNew;
            }

            let signatureData = '';
            if (window.settingsDoctorSigPad && !window.settingsDoctorSigPad.isEmpty()) {
                signatureData = window.settingsDoctorSigPad.getDataURL();
            } else {
                const previewImg = document.getElementById('doctor-signature-preview-img');
                if (previewImg && !previewImg.parentElement.classList.contains('hidden')) {
                    signatureData = previewImg.src;
                }
            }

            currentUser.fullname = fullname;
            currentUser.email = email;
            currentUser.phone = phone;

            if (signatureData) {
                if (!currentUser.doctorProfile) currentUser.doctorProfile = {};
                currentUser.doctorProfile.signature = signatureData;
                currentUser.doctor_profile = currentUser.doctorProfile;
            }

            try {
                await SupabaseDataService.saveUser(currentUser);
                sessionStorage.setItem('dental_current_user', JSON.stringify(currentUser));
                
                document.getElementById('dr-name-display').innerText = currentUser.fullname;
                const roleEl = document.getElementById('dr-role-display');
                if (roleEl) {
                    roleEl.innerText = currentUser.role;
                    roleEl.className = 'role-badge-tag';
                    const r = currentUser.role.toLowerCase();
                    if (r.includes('admin') || r.includes('super')) {
                        roleEl.classList.add('badge-admin');
                    } else if (r.includes('medico') || r.includes('odont') || r.includes('doctor')) {
                        roleEl.classList.add('badge-doctor');
                    } else {
                        roleEl.classList.add('badge-assistant');
                    }
                }

                document.getElementById('set-pwd-current').value = '';
                document.getElementById('set-pwd-new').value = '';
                document.getElementById('set-pwd-confirm').value = '';

                const previewContainer = document.getElementById('doctor-signature-preview-img-container');
                const previewImg = document.getElementById('doctor-signature-preview-img');
                if (previewContainer && previewImg && signatureData) {
                    previewImg.src = signatureData;
                    previewContainer.classList.remove('hidden');
                }

                Swal.fire({ icon: 'success', title: 'Perfil Personal Actualizado', text: 'Sus datos de acceso y firma médica fueron sincronizados en Supabase.', timer: 2000, showConfirmButton: false });
            } catch(err) {
                console.error("Error updating user profile:", err);
                Swal.fire({ icon: 'error', title: 'Error al Sincronizar', text: err.message || err });
            }
        };
    }
}

async function renderHelpView() {
    document.querySelectorAll('.faq-item').forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.onclick = (e) => {
                e.preventDefault();
                const isActive = item.classList.contains('active');
                
                document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
                
                if (!isActive) {
                    item.classList.add('active');
                }
            };
        }
    });
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

    let subtotalUSD = 0;
    currentBudgetItems.forEach(item => {
        subtotalUSD += item.price || 0;
    });

    const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
    const discountAmountUSD = subtotalUSD * (discountPct / 100);
    const totalUSD = subtotalUSD - discountAmountUSD;

    const paymentModeSelect = document.getElementById('payment-mode-select');
    const paymentModeText = paymentModeSelect ? paymentModeSelect.options[paymentModeSelect.selectedIndex].text : 'Contado';
    const budgetPaymentMethod = document.getElementById('budget-payment-method');
    const budgetPaymentMethodText = budgetPaymentMethod ? budgetPaymentMethod.options[budgetPaymentMethod.selectedIndex].text : 'Pago Móvil';
    const notes = document.getElementById('budget-notes') ? document.getElementById('budget-notes').value : '';
    const consentText = document.getElementById('consent-text') ? document.getElementById('consent-text').value : '';

    const rate = getExchangeRate();
    const subtotalVES = (subtotalUSD * rate).toFixed(2);
    const discountVES = (discountAmountUSD * rate).toFixed(2);
    const totalVES = (totalUSD * rate).toFixed(2);

    let itemsHtml = '';
    currentBudgetItems.forEach(item => {
        itemsHtml += `
            <tr style="border-bottom: 1px dashed #cbd5e1;">
                <td style="padding: 8px 0;">Pieza ${item.tooth || 'Gnl'} (${item.face || 'Gnl'})</td>
                <td style="padding: 8px 0;">${item.name}</td>
                <td style="padding: 8px 0;">${item.specialist || '-'}</td>
                <td style="padding: 8px 0;">$${item.price.toFixed(2)}</td>
                <td style="padding: 8px 0; text-align: right;">Bs. ${(item.price * rate).toFixed(2)}</td>
            </tr>
        `;
    });

    const stationery = await SupabaseDataService.getStationeryConfig();
    const logoBase64 = await toDataURL(stationery.logoUrl);

    let docSig = (window.doctorSigPad && !window.doctorSigPad.isEmpty()) ? window.doctorSigPad.toDataURL() : '';
    if (!docSig) {
        const u = getCurrentUser();
        if (u) {
            docSig = (u.doctorProfile && u.doctorProfile.signature) || (u.doctor_profile && u.doctor_profile.signature) || '';
        }
    }
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
        <div style="margin-bottom: 20px; font-size: 0.9rem; line-height: 1.4;">
            <strong>Paciente:</strong> ${patient.fullname}<br>
            <strong>Cédula:</strong> ${patient.id}<br>
            <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}<br>
            <strong>Forma de Pago:</strong> ${paymentModeText}<br>
            <strong>Método de Pago Sugerido:</strong> ${budgetPaymentMethodText}<br>
            <strong>Tasa de Cambio BCV:</strong> Bs. ${rate.toFixed(2)}
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 0.85rem;">
            <thead>
                <tr style="border-bottom: 2px solid #000; font-weight: bold;">
                    <th style="padding: 8px 0; text-align: left;">Pieza/Cara</th>
                    <th style="padding: 8px 0; text-align: left;">Tratamiento</th>
                    <th style="padding: 8px 0; text-align: left;">Especialista</th>
                    <th style="padding: 8px 0; text-align: left;">Precio (USD)</th>
                    <th style="padding: 8px 0; text-align: right; width: 110px;">Precio (Bs.)</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div style="text-align: right; margin-bottom: 25px; font-size: 0.92rem; line-height: 1.5; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px;">
            Subtotal Bruto: $${subtotalUSD.toFixed(2)} (Bs. ${subtotalVES})<br>
            Descuento Global (${discountPct}%): -$${discountAmountUSD.toFixed(2)} (Bs. -${discountVES})<br>
            <strong style="font-size: 1.1rem; color: #000;">Total Final Ref.: $${totalUSD.toFixed(2)} (Bs. ${totalVES})</strong>
        </div>
        ${notes ? `<div style="margin-bottom: 15px; border: 1px solid #cbd5e1; padding: 10px; font-size: 0.82rem; border-radius: 4px; line-height: 1.4; background-color: #fafafa;"><strong>Observaciones Clínicas (Notas del Médico):</strong><br>${notes}</div>` : ''}
        ${consentText ? `<div style="margin-bottom: 25px; border: 1px solid #cbd5e1; padding: 10px; font-size: 0.80rem; border-radius: 4px; line-height: 1.4; color: #444; background-color: #fafafa;"><strong>Consentimiento Informado:</strong><br>${consentText}</div>` : ''}
        <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 0.85rem; text-align: center;">
            <div style="width: 230px;">
                ${docSig ? `<img src="${docSig}" style="max-height: 50px; display: block; margin-left: auto; margin-right: auto; margin-bottom: 5px;">` : '<div style="height: 55px;"></div>'}
                <div style="border-top: 1px solid #000; padding-top: 5px;">Firma del Odontólogo Tratante</div>
            </div>
            <div style="width: 230px;">
                ${patSig ? `<img src="${patSig}" style="max-height: 50px; display: block; margin-left: auto; margin-right: auto; margin-bottom: 5px;">` : '<div style="height: 55px;"></div>'}
                <div style="border-top: 1px solid #000; padding-top: 5px;">Firma del Paciente / Representante</div>
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
                status: 'Pagado',
                method: method
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
                <strong>Términos:</strong> ${invoice.paymentTerms} | <strong>Método:</strong> ${getPaymentMethodLabel(invoice.paymentMethod)}<br>
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

    const methodTotals = {
        'pagomovil': 0,
        'cash': 0,
        'zelle': 0,
        'binance': 0
    };

    patients.forEach(p => {
        (p.payments || []).forEach(pay => {
            if (pay.paidUSD > 0) {
                inflows += pay.paidUSD;
                
                // Map and track breakdown totals
                const m = pay.method ? pay.method.toLowerCase() : 'cash';
                if (methodTotals[m] !== undefined) {
                    methodTotals[m] += pay.paidUSD;
                } else {
                    // Backwards compatibility mapping for old records
                    if (m.includes('dólar') || m.includes('usd') || m.includes('efectivo') || m === 'dólares') {
                        methodTotals['cash'] += pay.paidUSD;
                    } else if (m.includes('bs') || m.includes('pago') || m.includes('transferencia')) {
                        methodTotals['pagomovil'] += pay.paidUSD;
                    } else if (m.includes('zelle')) {
                        methodTotals['zelle'] += pay.paidUSD;
                    } else {
                        methodTotals['cash'] += pay.paidUSD;
                    }
                }

                transactions.push({
                    date: pay.date,
                    concept: `Abono de Paciente: ${p.fullname} (${pay.concept})`,
                    type: 'Ingreso',
                    method: pay.method ? getPaymentMethodLabel(pay.method) : 'Cash (Efectivo)',
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
                method: 'Cash (Efectivo)',
                amount: bill.amount
            });
        }
    });

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('cf-total-inflows').innerText = `$${inflows.toFixed(2)}`;
    document.getElementById('cf-total-outflows').innerText = `$${outflows.toFixed(2)}`;
    
    // Update payment method breakdown display cards
    if (document.getElementById('cf-total-pagomovil')) {
        document.getElementById('cf-total-pagomovil').innerText = `$${methodTotals['pagomovil'].toFixed(2)}`;
        document.getElementById('cf-total-cash').innerText = `$${methodTotals['cash'].toFixed(2)}`;
        document.getElementById('cf-total-zelle').innerText = `$${methodTotals['zelle'].toFixed(2)}`;
        document.getElementById('cf-total-binance').innerText = `$${methodTotals['binance'].toFixed(2)}`;
    }
    
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

    const webhookInput = document.getElementById('setting-calendar-webhook');
    if (webhookInput) {
        webhookInput.value = localStorage.getItem('dental_google_calendar_webhook') || '';
    }

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

        const webhookVal = document.getElementById('setting-calendar-webhook') ? document.getElementById('setting-calendar-webhook').value.trim() : '';
        localStorage.setItem('dental_google_calendar_webhook', webhookVal);

        await SupabaseDataService.saveStationeryConfig({
            id: 'default',
            headerText,
            footerText,
            logoUrl
        });

        renderBudgetTable();

        Swal.fire({ icon: 'success', title: 'Configuración guardada', text: 'Se actualizaron la plantilla oficial y los ajustes del sistema.', timer: 2000, showConfirmButton: false });
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

function getPaymentMethodLabel(method) {
    const map = {
        'pagomovil': 'Pago Móvil',
        'cash': 'Cash (Efectivo)',
        'zelle': 'Zelle',
        'binance': 'Binance'
    };
    if (!method) return 'Cash (Efectivo)';
    const m = method.toLowerCase();
    return map[m] || method;
}

async function generatePDFFromElement(element, filename) {
    // Style the element so it has a normal relative layout at the bottom of the body
    element.style.position = 'relative';
    element.style.width = '750px';
    element.style.margin = '40px auto';
    element.style.backgroundColor = '#ffffff';
    element.style.color = '#000000';
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.padding = '30px';

    document.body.appendChild(element);

    Swal.fire({
        title: 'Generando Documento PDF...',
        html: `
            <div style="margin-bottom: 10px; font-weight: bold; color: #0284c7;">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Compilando firmas, logos y tratamientos...
            </div>
            <div style="font-size: 0.8rem; color: #64748b;">
                Generando lienzo de alta resolución. Por favor espere.
            </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();

            setTimeout(async () => {
                try {
                    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
                    if (!jsPDFClass) {
                        throw new Error("Librería jsPDF no encontrada.");
                    }
                    if (!window.html2canvas) {
                        throw new Error("Librería html2canvas no encontrada.");
                    }

                    // Render using html2canvas directly to inspect the output canvas
                    const canvas = await window.html2canvas(element, {
                        scale: 2,
                        useCORS: false,
                        backgroundColor: '#ffffff',
                        logging: true
                    });

                    // Verify if canvas has any non-white/non-transparent pixels
                    const ctx = canvas.getContext('2d');
                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    let hasColor = false;
                    for (let i = 0; i < imgData.length; i += 4) {
                        if (imgData[i+3] !== 0 && (imgData[i] !== 255 || imgData[i+1] !== 255 || imgData[i+2] !== 255)) {
                            hasColor = true;
                            break;
                        }
                    }

                    if (!hasColor) {
                        throw new Error("El motor de dibujo devolvió un lienzo vacío (blanco).");
                    }

                    // Convert canvas to image and add to PDF
                    const imgString = canvas.toDataURL('image/jpeg', 0.95);
                    const pdf = new jsPDFClass('p', 'mm', 'a4');
                    const imgWidth = 210; // A4 width
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;
                    
                    pdf.addImage(imgString, 'JPEG', 0, 0, imgWidth, imgHeight);
                    pdf.save(filename);

                    // Clean up and close modal
                    document.body.removeChild(element);
                    Swal.close();
                    Swal.fire({ icon: 'success', title: '¡PDF Descargado!', text: 'El archivo se ha guardado en tu dispositivo.', timer: 2000, showConfirmButton: false });

                } catch (err) {
                    console.error("PDF generation failure:", err);
                    try {
                        document.body.removeChild(element);
                    } catch (e) {}
                    Swal.close();

                    // Fallback to Native Print/Save Window
                    Swal.fire({
                        icon: 'warning',
                        title: 'Fallo en Generador local',
                        text: `${err.message || err}. Abriendo ventana de impresión alternativa para que puedas guardarlo como PDF de forma nativa...`,
                        confirmButtonText: 'Abrir Ventana'
                    }).then(() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                            printWindow.document.write(`
                                <html>
                                    <head>
                                        <title>${filename}</title>
                                        <style>
                                            body { margin: 30px; font-family: monospace; background: #fff; color: #000; }
                                            table { width: 100%; border-collapse: collapse; }
                                            th, td { padding: 8px; text-align: left; border-bottom: 1px dashed #ccc; }
                                            @media print {
                                                body { margin: 0; }
                                            }
                                        </style>
                                    </head>
                                    <body>
                                        ${element.innerHTML}
                                        <script>
                                            window.onload = function() {
                                                window.print();
                                                window.close();
                                            };
                                        </script>
                                    </body>
                                </html>
                            `);
                            printWindow.document.close();
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Bloqueador de Ventanas Activo',
                                text: 'Por favor permite las ventanas emergentes en este sitio para imprimir.'
                            });
                        }
                    });
                }
            }, 600);
        }
    });
}
