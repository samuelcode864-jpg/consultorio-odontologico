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
    // 1. Initialize Persistent State, Branding & Live Exchange Rate API
    initStorage();
    await loadClinicBranding();
    fetchLiveExchangeRate();

    // 2. Initialize Theme (Light Mode Default)
    initTheme();

    // Update live current date badge
    const dateBadge = document.getElementById('current-date-badge');
    if (dateBadge) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const todayStr = new Date().toLocaleDateString('es-ES', options);
        dateBadge.textContent = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);
    }

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

// ==========================================
// CLINIC BRANDING & DOCTOR SIGNATURE AUTOMATION
// ==========================================
async function loadClinicBranding() {
    try {
        const config = await SupabaseDataService.getStationeryConfig();
        if (config) {
            applyClinicBrandingUI(config);
        }
    } catch(e) {
        console.warn("Could not load clinic branding from Supabase:", e);
    }
}

function applyClinicBrandingUI(config) {
    if (!config) return;
    
    // Parse business name if present in header_text or config
    let busName = 'DentalCare Pro';
    let busAddress = '';
    let busPhone = '';
    if (config.headerText || config.header_text) {
        try {
            const raw = config.headerText || config.header_text;
            if (raw.startsWith('{')) {
                const parsed = JSON.parse(raw);
                if (parsed.name) busName = parsed.name;
                if (parsed.address) busAddress = parsed.address;
                if (parsed.phone) busPhone = parsed.phone;
            }
        } catch(e) {}
    }

    localStorage.setItem('dental_clinic_name', busName);
    if (busAddress) localStorage.setItem('dental_clinic_address', busAddress);
    if (busPhone) localStorage.setItem('dental_clinic_phone', busPhone);

    const logoUrl = config.logoUrl || config.logo_url || '';

    // 1. Sidebar Brand Logo & Clinic Name
    const sideLogoContainer = document.getElementById('sidebar-brand-logo-container');
    const sideName = document.getElementById('sidebar-brand-name');
    if (sideLogoContainer) {
        if (logoUrl) {
            sideLogoContainer.innerHTML = `<img src="${logoUrl}" alt="Logo" class="clinic-logo-sidebar">`;
        } else {
            sideLogoContainer.innerHTML = `<i class="fa-solid fa-tooth"></i>`;
        }
    }
    if (sideName && busName) sideName.textContent = busName;

    // 2. Mobile Top Header Brand Logo (Prominent, High-Resolution, No Superfluous User Text)
    const mobBrandContainer = document.getElementById('mobile-header-brand-container');
    if (mobBrandContainer) {
        if (logoUrl) {
            mobBrandContainer.innerHTML = `
                <img src="${logoUrl}" alt="Logo" class="clinic-logo-header">
            `;
        } else {
            mobBrandContainer.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 1.05rem; color: var(--text-main);">
                    <i class="fa-solid fa-tooth text-cyan" style="font-size: 1.25rem;"></i>
                    <span id="mobile-header-brand-name">${busName}</span>
                </div>
            `;
        }
    }

    // 3. Login Brand Logo
    const loginLogoContainer = document.getElementById('login-brand-logo-container');
    const loginName = document.getElementById('login-brand-name');
    if (loginLogoContainer && logoUrl) {
        loginLogoContainer.innerHTML = `<img src="${logoUrl}" alt="Logo" style="max-height: 70px; max-width: 180px; object-fit: contain; border-radius: 8px;">`;
    }
    if (loginName && busName) loginName.textContent = busName;
}

function autoLoadDoctorSignatureInBudget() {
    if (!window.doctorSigPad) return;
    
    // Check if currently active user or logged-in doctor has signature
    const user = getCurrentUser();
    if (!user) return;
    
    const sig = (user.doctorProfile && user.doctorProfile.signature) || (user.doctor_profile && user.doctor_profile.signature);
    if (sig) {
        window.doctorSigPad.loadFromDataURL(sig);
    }
}

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
    const currencyType = localStorage.getItem('dental_exchange_currency') || 'USD';

    if (currencyBtn) {
        currencyBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin text-cyan"></i> <span>Actualizando...</span>`;
    }

    try {
        const endpoint = currencyType === 'EUR' 
            ? 'https://ve.dolarapi.com/v1/euros/oficial' 
            : 'https://ve.dolarapi.com/v1/dolares/oficial';

        const response = await fetch(endpoint);
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
    const currencyType = localStorage.getItem('dental_exchange_currency') || 'USD';
    const symbol = currencyType === 'EUR' ? '€' : '$';
    const coinColor = currencyType === 'EUR' ? '#0284c7' : '#10b981';

    if (currencyBtn) {
        const formattedRate = rate.toFixed(2);
        currencyBtn.innerHTML = `<i class="fa-solid fa-coins" style="color: ${coinColor}; font-size: 0.95rem;"></i> <span>${symbol} <strong>${formattedRate} Bs.</strong></span>`;
        currencyBtn.title = `Tasa oficial BCV (${currencyType}): ${formattedRate} Bs.\nHaga clic para cambiar a ${currencyType === 'USD' ? 'EUR (€)' : 'USD ($)'}`;
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

    // Theme toggle button in Settings -> Appearance
    const settingsThemeBtn = document.getElementById('btn-theme-toggle-settings');
    if (settingsThemeBtn) {
        settingsThemeBtn.onclick = () => {
            const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
            const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(nextTheme);
        };
    }

    const cardLight = document.getElementById('card-theme-light');
    if (cardLight) {
        cardLight.onclick = () => applyTheme('light');
    }

    const cardDark = document.getElementById('card-theme-dark');
    if (cardDark) {
        cardDark.onclick = () => applyTheme('dark');
    }
}

function applyTheme(theme) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    const iconSettings = document.getElementById('theme-icon-settings');
    const btnTextSettings = document.getElementById('theme-btn-text-settings');
    const statusTextSettings = document.getElementById('theme-status-text');
    const cardLight = document.getElementById('card-theme-light');
    const cardDark = document.getElementById('card-theme-dark');
    const badgeLight = document.getElementById('badge-theme-light');
    const badgeDark = document.getElementById('badge-theme-dark');

    if (theme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        if (icon) icon.className = 'fa-solid fa-sun';
        if (text) text.innerText = 'Modo Claro';

        if (iconSettings) iconSettings.className = 'fa-solid fa-sun';
        if (btnTextSettings) btnTextSettings.innerText = 'Cambiar a Modo Claro';
        if (statusTextSettings) statusTextSettings.innerText = 'Actualmente en Modo Oscuro';

        if (cardDark) {
            cardDark.style.border = '2px solid #00f2fe';
            cardDark.style.boxShadow = '0 4px 12px rgba(0, 242, 254, 0.15)';
        }
        if (badgeDark) badgeDark.classList.remove('hidden');

        if (cardLight) {
            cardLight.style.border = '2px solid var(--border-color)';
            cardLight.style.boxShadow = 'none';
        }
        if (badgeLight) badgeLight.classList.add('hidden');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        if (icon) icon.className = 'fa-solid fa-moon';
        if (text) text.innerText = 'Modo Oscuro';

        if (iconSettings) iconSettings.className = 'fa-solid fa-moon';
        if (btnTextSettings) btnTextSettings.innerText = 'Cambiar a Modo Oscuro';
        if (statusTextSettings) statusTextSettings.innerText = 'Actualmente en Modo Claro';

        if (cardLight) {
            cardLight.style.border = '2px solid #0284c7';
            cardLight.style.boxShadow = '0 4px 12px rgba(2, 132, 199, 0.1)';
        }
        if (badgeLight) badgeLight.classList.remove('hidden');

        if (cardDark) {
            cardDark.style.border = '2px solid var(--border-color)';
            cardDark.style.boxShadow = 'none';
        }
        if (badgeDark) badgeDark.classList.add('hidden');
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
    const urlParams = new URLSearchParams(window.location.search);
    const isPublicBudget = urlParams.get('view') === 'budget' && urlParams.get('patientId');
    const isPublicReceipt = urlParams.get('view') === 'receipt' && urlParams.get('patientId');
    const loginOverlay = document.getElementById('login-screen');

    if (isPublicBudget) {
        document.documentElement.classList.add('has-auth-session');
        document.documentElement.classList.remove('no-auth-session');
        if (loginOverlay) loginOverlay.classList.add('hidden');
        renderPublicBudgetView();
        return;
    }

    if (isPublicReceipt) {
        document.documentElement.classList.add('has-auth-session');
        document.documentElement.classList.remove('no-auth-session');
        if (loginOverlay) loginOverlay.classList.add('hidden');
        renderPublicSessionReceiptView();
        return;
    }

    const currentSession = sessionStorage.getItem('dental_current_user');

    if (currentSession) {
        try {
            const user = JSON.parse(currentSession);
            document.documentElement.classList.add('has-auth-session');
            document.documentElement.classList.remove('no-auth-session');
            if (loginOverlay) loginOverlay.classList.add('hidden');
            
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
            console.error("Auth Session Error:", e);
            sessionStorage.removeItem('dental_current_user');
        }
    }
    document.documentElement.classList.remove('has-auth-session');
    document.documentElement.classList.add('no-auth-session');
    if (loginOverlay) loginOverlay.classList.remove('hidden');
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
        doctor: ['dashboard', 'patients', 'agenda', 'odontogram', 'ehr', 'pricing', 'settings', 'help'],
        assistant: ['dashboard', 'patients', 'agenda', 'billing', 'finance', 'pricing', 'settings', 'help']
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

    // Adapt Mobile Navigation Bar & FAB based on role
    renderMobileNavigationForRole(roleType);

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

function renderMobileNavigationForRole(roleType) {
    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (!bottomNav) return;

    let bottomButtons = [];
    if (roleType === 'doctor') {
        // DOCTOR: Enfoque clínico prioritario
        bottomButtons = [
            { tab: 'dashboard', icon: 'fa-house', label: 'Home' },
            { tab: 'agenda', icon: 'fa-calendar-days', label: 'Agenda' },
            { tab: 'odontogram', icon: 'fa-file-invoice-dollar', label: 'Presupuesto' },
            { tab: 'ehr', icon: 'fa-notes-medical', label: 'Historias' },
            { tab: 'pricing', icon: 'fa-tags', label: 'Servicios' }
        ];
    } else if (roleType === 'assistant') {
        // ASISTENTE: Enfoque de recepción, agenda y facturación
        bottomButtons = [
            { tab: 'dashboard', icon: 'fa-house', label: 'Home' },
            { tab: 'agenda', icon: 'fa-calendar-days', label: 'Agenda' },
            { tab: 'patients', icon: 'fa-hospital-user', label: 'Pacientes' },
            { tab: 'billing', icon: 'fa-receipt', label: 'Facturación' },
            { tab: 'pricing', icon: 'fa-tags', label: 'Servicios' }
        ];
    } else {
        // SUPER ADMIN: Acceso integral
        bottomButtons = [
            { tab: 'dashboard', icon: 'fa-house', label: 'Home' },
            { tab: 'agenda', icon: 'fa-calendar-days', label: 'Agenda' },
            { tab: 'pricing', icon: 'fa-tags', label: 'Servicios' },
            { tab: 'finance', icon: 'fa-wallet', label: 'Finanzas' },
            { tab: 'odontogram', icon: 'fa-file-invoice-dollar', label: 'Presupuesto' }
        ];
    }

    // Determine currently active view
    const currentActiveView = document.querySelector('.tab-view.active');
    const currentTab = currentActiveView ? currentActiveView.id.replace('view-', '') : 'dashboard';

    bottomNav.innerHTML = bottomButtons.map(btn => `
        <button type="button" class="mobile-nav-btn ${btn.tab === currentTab ? 'active' : ''}" data-tab="${btn.tab}">
            <i class="fa-solid ${btn.icon}"></i>
            <span>${btn.label}</span>
        </button>
    `).join('');

    // Rebind click events on bottom buttons
    bottomNav.querySelectorAll('.mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.navigateToTab(btn.dataset.tab);
        });
    });

    // Adjust Mobile Drawer (hide tabs present in the bottom bar)
    const bottomTabNames = bottomButtons.map(b => b.tab);
    document.querySelectorAll('.nav-menu .nav-item').forEach(item => {
        const itemTab = item.dataset.tab;
        if (bottomTabNames.includes(itemTab)) {
            item.classList.add('mobile-sidebar-hide');
        } else {
            item.classList.remove('mobile-sidebar-hide');
        }
    });

    // Adjust FAB Quick Action Cards by Role
    const fabPatient = document.getElementById('fab-act-patient');
    const fabAppt = document.getElementById('fab-act-appointment');
    const fabBudget = document.getElementById('fab-act-budget');
    const fabEvol = document.getElementById('fab-act-evolution');
    const fabExpense = document.getElementById('fab-act-expense');
    const fabIncome = document.getElementById('fab-act-income');
    const fabTransfer = document.getElementById('fab-act-transfer');
    const fabBilling = document.getElementById('fab-act-billing');

    if (roleType === 'doctor') {
        if (fabPatient) fabPatient.style.display = 'none'; // Doctors don't handle frontdesk patient creation
        if (fabAppt) fabAppt.style.display = 'flex';
        if (fabBudget) fabBudget.style.display = 'flex';
        if (fabEvol) fabEvol.style.display = 'flex';
        if (fabExpense) fabExpense.style.display = 'none';
        if (fabIncome) fabIncome.style.display = 'none';
        if (fabTransfer) fabTransfer.style.display = 'none';
        if (fabBilling) fabBilling.style.display = 'flex';
    } else if (roleType === 'assistant') {
        if (fabPatient) fabPatient.style.display = 'flex';
        if (fabAppt) fabAppt.style.display = 'flex';
        if (fabBudget) fabBudget.style.display = 'none'; // Doctors formulate clinical budgets
        if (fabEvol) fabEvol.style.display = 'none'; // Doctors formulate clinical notes
        if (fabExpense) fabExpense.style.display = 'flex';
        if (fabIncome) fabIncome.style.display = 'flex';
        if (fabTransfer) fabTransfer.style.display = 'none';
        if (fabBilling) fabBilling.style.display = 'flex';
    } else {
        // Admin: all actions enabled
        if (fabPatient) fabPatient.style.display = 'flex';
        if (fabAppt) fabAppt.style.display = 'flex';
        if (fabBudget) fabBudget.style.display = 'flex';
        if (fabEvol) fabEvol.style.display = 'flex';
        if (fabExpense) fabExpense.style.display = 'flex';
        if (fabIncome) fabIncome.style.display = 'flex';
        if (fabTransfer) fabTransfer.style.display = 'flex';
        if (fabBilling) fabBilling.style.display = 'flex';
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
        try { await loadClinicBranding(); } catch(e) { console.error(e); }
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
    document.documentElement.classList.remove('has-auth-session');
    document.documentElement.classList.add('no-auth-session');
    const loginOverlay = document.getElementById('login-screen');
    if (loginOverlay) loginOverlay.classList.remove('hidden');
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
window.navigateToTab = async function(tabName) {
    const navItems = document.querySelectorAll('.nav-item');
    const mobNavBtns = document.querySelectorAll('.mobile-nav-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    // RBAC Navigation Guard
    const user = getCurrentUser();
    if (user) {
        const r = (user.role || '').toLowerCase();
        const isAdmin = r.includes('admin') || r.includes('super');
        const isDoctor = r.includes('medico') || r.includes('odont') || r.includes('doctor') || r.includes('dentista') || r.includes('médico');
        const roleType = isAdmin ? 'admin' : (isDoctor ? 'doctor' : 'assistant');
        const allowedTabs = {
            admin: ['dashboard', 'patients', 'agenda', 'odontogram', 'ehr', 'inventory', 'pricing', 'users', 'billing', 'finance', 'stationery', 'settings', 'help'],
            doctor: ['dashboard', 'patients', 'agenda', 'odontogram', 'ehr', 'pricing', 'settings', 'help'],
            assistant: ['dashboard', 'patients', 'agenda', 'billing', 'finance', 'pricing', 'settings', 'help']
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

    navItems.forEach(n => {
        if (n.dataset.tab === tabName) n.classList.add('active');
        else n.classList.remove('active');
    });

    mobNavBtns.forEach(m => {
        if (m.dataset.tab === tabName) m.classList.add('active');
        else m.classList.remove('active');
    });

    tabViews.forEach(v => v.classList.remove('active'));

    const targetView = document.getElementById(`view-${tabName}`);
    if (targetView) targetView.classList.add('active');

    // Close mobile sidebar if open
    if (window.closeMobileSidebar) window.closeMobileSidebar();

    if (tabName === 'odontogram') {
        const editorContainer = document.getElementById('odontogram-editor-container');
        if (editorContainer && !editorContainer.classList.contains('hidden')) {
            // Do nothing, stay in editor view
        } else {
            await renderBudgetListView();
        }
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
};

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            const tabName = item.dataset.tab;
            if (tabName) {
                await window.navigateToTab(tabName);
            }
        });
    });

    const mobNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobNavBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const tabName = btn.dataset.tab;
            if (tabName) {
                await window.navigateToTab(tabName);
            }
        });
    });

    // Mobile FAB button
    const fabBtn = document.getElementById('mobile-fab-btn');
    if (fabBtn) {
        fabBtn.onclick = () => {
            openModal('modal-mobile-quick-actions');
        };
    }

    // Bind all FAB actions
    initMobileFabActions();
}

function initMobileFabActions() {
    // 1. Registrar Paciente
    const actPatient = document.getElementById('fab-act-patient');
    if (actPatient) {
        actPatient.onclick = () => {
            closeModal('modal-mobile-quick-actions');
            const patientForm = document.getElementById('form-patient');
            if (patientForm) patientForm.reset();
            const patientIdInput = document.getElementById('patient-id');
            if (patientIdInput) patientIdInput.value = '';
            openModal('modal-patient');
        };
    }

    // 2. Agendar Cita
    const actAppointment = document.getElementById('fab-act-appointment');
    if (actAppointment) {
        actAppointment.onclick = async () => {
            closeModal('modal-mobile-quick-actions');
            await window.openNewAppointmentModal();
        };
    }

    // 3. Nuevo Presupuesto
    const actBudget = document.getElementById('fab-act-budget');
    if (actBudget) {
        actBudget.onclick = async () => {
            closeModal('modal-mobile-quick-actions');
            await window.navigateToTab('odontogram');
            const newBudgetBtn = document.getElementById('btn-new-budget');
            if (newBudgetBtn) newBudgetBtn.click();
        };
    }

    // 4. Agregar Evolución
    const actEvolution = document.getElementById('fab-act-evolution');
    if (actEvolution) {
        actEvolution.onclick = async () => {
            closeModal('modal-mobile-quick-actions');
            const activeId = getActivePatientId();
            if (activeId) {
                const sessionPatientId = document.getElementById('session-patient-id');
                if (sessionPatientId) sessionPatientId.value = activeId;
                openModal('modal-session');
            } else {
                await window.navigateToTab('ehr');
                Swal.fire({
                    icon: 'info',
                    title: 'Seleccione un Paciente',
                    text: 'Seleccione un paciente de la lista para registrar una nueva sesión o evolución clínica.'
                });
            }
        };
    }

    // 5. Registrar Gasto
    const actExpense = document.getElementById('fab-act-expense');
    if (actExpense) {
        actExpense.onclick = () => {
            closeModal('modal-mobile-quick-actions');
            const billForm = document.getElementById('form-provider-bill');
            if (billForm) billForm.reset();
            openModal('modal-provider-bill');
        };
    }

    // 6. Registrar Ingreso / Abono
    const actIncome = document.getElementById('fab-act-income');
    if (actIncome) {
        actIncome.onclick = async () => {
            closeModal('modal-mobile-quick-actions');
            const activeId = getActivePatientId();
            if (activeId) {
                const paymentPatientId = document.getElementById('payment-patient-id');
                if (paymentPatientId) paymentPatientId.value = activeId;
                openModal('modal-payment');
            } else {
                await window.navigateToTab('finance');
                Swal.fire({
                    icon: 'info',
                    title: 'Registro de Abonos / Ingresos',
                    text: 'Puede registrar abonos desde la ficha de cada paciente en Historias Clínicas o Cuentas por Cobrar.'
                });
            }
        };
    }

    // 7. Transferencia / Traslado entre Cuentas
    const actTransfer = document.getElementById('fab-act-transfer');
    if (actTransfer) {
        actTransfer.onclick = () => {
            closeModal('modal-mobile-quick-actions');
            openModal('modal-account-transfer');
        };
    }

    // 8. Facturación
    const actBilling = document.getElementById('fab-act-billing');
    if (actBilling) {
        actBilling.onclick = async () => {
            closeModal('modal-mobile-quick-actions');
            await window.navigateToTab('billing');
        };
    }
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
            const isFacturado = b.status === 'Facturado';
            const badgeClass = isFacturado ? 'badge-tag blue' : (isApproved ? 'badge-tag green' : 'badge-tag orange');
            const statusLabel = isFacturado ? 'Finalizado' : (isApproved ? 'Aprobado' : 'Borrador');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${b.id}</strong></td>
                <td>${patientName}</td>
                <td>${b.invoiceDate}</td>
                <td>$${b.totalRef.toFixed(2)}</td>
                <td>${spec}</td>
                <td><span class="${badgeClass}" style="font-size:0.75rem; text-transform:none; padding: 2px 6px;">${statusLabel}</span></td>
                <td style="text-align: center;">
                    <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-xs btn-outline" onclick="loadBudgetIntoEditor('${b.id}')" style="padding: 4px 8px; font-weight:600; border-radius:4px; cursor: pointer;"><i class="fa-solid fa-folder-open"></i> Abrir</button>
                        <button class="btn btn-xs btn-success" onclick="window.sendBudgetWhatsApp('${b.id}')" style="padding: 4px 8px; font-weight:600; border-radius:4px; cursor: pointer; background:#25D366; border:none; color:#fff;" title="Enviar Presupuesto por WhatsApp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
                        ${isApproved ? `<button class="btn btn-xs btn-success" onclick="window.finalizeBudgetDirect('${b.id}')" style="padding: 4px 8px; font-weight:600; border-radius:4px; cursor: pointer; background:#10b981; border:none; color:#fff;" title="Finalizar Tratamiento / Presupuesto"><i class="fa-solid fa-circle-check"></i> Finalizar</button>` : ''}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }
}

window.sendBudgetWhatsApp = async function(budgetId) {
    try {
        const invoices = await SupabaseDataService.getInvoices();
        const budget = invoices.find(inv => inv.id === budgetId);
        if (!budget) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el presupuesto.' });
            return;
        }

        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => String(p.id) === String(budget.patientId));
        if (!patient || !patient.phone) {
            Swal.fire({ icon: 'warning', title: 'Sin Teléfono', text: 'El paciente asociado a este presupuesto no tiene un número de teléfono / WhatsApp registrado.' });
            return;
        }

        const items = budget.items || [];
        const totalUSD = budget.totalRef || budget.totalUSD || 0;
        const subtotalUSD = budget.subtotal || totalUSD;
        const discountPct = budget.discountPct || 0;
        const paymentMode = budget.paymentTerms || 'Contado';

        const msg = WhatsAppService.generateBudgetMessage(patient, items, totalUSD, paymentMode, '', subtotalUSD, discountPct, paymentMode, budget.id);
        WhatsAppService.sendToPatient(patient.phone, msg);
    } catch(err) {
        console.error("Error sending budget via WhatsApp:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message || err });
    }
};

window.finalizeBudgetDirect = async function(budgetId) {
    try {
        const invoices = await SupabaseDataService.getInvoices();
        const budget = invoices.find(inv => inv.id === budgetId);
        if (!budget) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el presupuesto especificado.' });
            return;
        }

        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => String(p.id) === String(budget.patientId)) || { fullname: 'Paciente', id: budget.patientId };

        const totalUSD = budget.totalRef || budget.totalUSD || 0;

        const { value: formValues } = await Swal.fire({
            title: `<i class="fa-solid fa-circle-check text-green"></i> Finalizar Tratamiento / Presupuesto`,
            html: `
                <div style="text-align: left; font-size: 0.92rem; display: flex; flex-direction: column; gap: 12px;">
                    <div style="background: rgba(5,150,105,0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(5,150,105,0.2);">
                        <div><strong>Paciente:</strong> ${patient.fullname} (${patient.id})</div>
                        <div><strong>Presupuesto N°:</strong> ${budget.id}</div>
                        <div><strong>Monto Total:</strong> <span style="color:#059669; font-weight:bold; font-size:1.1rem;">$${totalUSD.toFixed(2)}</span></div>
                    </div>
                    
                    <div>
                        <label style="font-weight: 600; display: block; margin-bottom: 4px;">N° de Control / Factura o Recibo Físico (Opcional):</label>
                        <input id="swal-finalize-num" class="swal2-input" style="margin: 0; width: 100%;" placeholder="Ej: REC-00${budget.id.replace(/[^0-9]/g,'') || '101'}" value="REC-${budget.id}">
                    </div>

                    <div>
                        <label style="font-weight: 600; display: block; margin-bottom: 4px;">Método de Liquidación / Cierre:</label>
                        <select id="swal-finalize-method" class="swal2-select" style="margin: 0; width: 100%; display: block;">
                            <option value="cash">Dólares Efectivo ($ USD)</option>
                            <option value="zelle">Zelle ($ USD)</option>
                            <option value="transfer_bs">Transferencia / Pago Móvil (Bs.)</option>
                            <option value="pos">Punto de Venta (Bs.)</option>
                            <option value="mixed">Pago Mixto / Múltiples Métodos</option>
                            <option value="already_settled">Ya Liquidado / Pagado Previamente</option>
                        </select>
                    </div>

                    <div style="margin-top: 5px;">
                        <label style="font-weight: 600; display: block; margin-bottom: 4px;">Notas o Observaciones Finales:</label>
                        <textarea id="swal-finalize-notes" class="swal2-textarea" style="margin: 0; width: 100%; height: 60px;" placeholder="Tratamiento completado satisfactoriamente."></textarea>
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fa-solid fa-check-circle"></i> Confirmar y Finalizar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#64748b',
            preConfirm: () => {
                return {
                    receiptNum: document.getElementById('swal-finalize-num').value.trim(),
                    method: document.getElementById('swal-finalize-method').value,
                    notes: document.getElementById('swal-finalize-notes').value.trim()
                };
            }
        });

        if (!formValues) return;

        // 1. Update invoice in Supabase
        budget.status = 'Facturado';
        budget.paymentTerms = 'Contado';
        budget.finalizedDate = new Date().toISOString().split('T')[0];
        budget.receiptNumber = formValues.receiptNum;
        budget.closureMethod = formValues.method;
        budget.closureNotes = formValues.notes;
        await SupabaseDataService.saveInvoice(budget);

        // 2. Update patient treatment status & payments
        const pat = patients.find(p => String(p.id) === String(budget.patientId));
        if (pat) {
            if (!pat.metadata) pat.metadata = {};
            pat.metadata.treatmentStatus = 'Finalizado';
            pat.metadata.lastFinalizedBudget = budget.id;
            
            // Complete all treatments in metadata
            if (pat.metadata.treatments && pat.metadata.treatments.length > 0) {
                pat.metadata.treatments.forEach(t => {
                    t.status = 'Completado';
                });
            }

            // Register final payment entry if not already registered
            if (!pat.payments) pat.payments = [];
            const alreadyPaid = pat.payments.some(p => p.concept && p.concept.includes(budget.id));
            if (!alreadyPaid && formValues.method !== 'already_settled') {
                pat.payments.unshift({
                    date: new Date().toISOString().split('T')[0],
                    concept: `Liquidación Final Presupuesto #${budget.id} (${formValues.receiptNum || 'Recibo'})`,
                    totalUSD: totalUSD,
                    paidUSD: totalUSD,
                    balanceUSD: 0.00,
                    status: 'Pagado',
                    method: formValues.method
                });
            }

            await SupabaseDataService.savePatient(pat);
        }

        // 3. Refresh views
        await renderOdontogramHistoryTable();
        await renderPatientsTable();
        await renderEHRView();
        await renderDashboard();
        if (typeof renderFinanceView === 'function') await renderFinanceView();

        Swal.fire({
            icon: 'success',
            title: '¡Tratamiento / Presupuesto Finalizado!',
            text: `El presupuesto ${budget.id} ha sido finalizado con éxito.`,
            timer: 2200,
            showConfirmButton: false
        });
    } catch(err) {
        console.error("Error finalizing budget:", err);
        Swal.fire({ icon: 'error', title: 'Error al Finalizar', text: err.message || err });
    }
};

window.closeBudgetFinanciallyDirect = window.finalizeBudgetDirect;

window.finalizePatientTreatment = async function(patientId) {
    try {
        const invoices = await SupabaseDataService.getInvoices();
        const patientBudgets = invoices.filter(inv => String(inv.patientId) === String(patientId));
        const activeBudget = patientBudgets.find(b => b.status === 'Aprobado') || patientBudgets[0];

        if (activeBudget) {
            await window.finalizeBudgetDirect(activeBudget.id);
        } else {
            // Patient has no formal invoice, finalize directly
            const patients = await SupabaseDataService.getPatients();
            const pat = patients.find(p => String(p.id) === String(patientId));
            if (!pat) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el paciente.' });
                return;
            }

            const { isConfirmed } = await Swal.fire({
                title: `<i class="fa-solid fa-circle-check text-green"></i> Finalizar Tratamiento`,
                text: `¿Desea marcar como "Finalizado" el ciclo de tratamiento de ${pat.fullname}?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Sí, Finalizar Tratamiento',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b'
            });

            if (isConfirmed) {
                if (!pat.metadata) pat.metadata = {};
                pat.metadata.treatmentStatus = 'Finalizado';
                pat.status = 'Activo';
                if (pat.metadata.treatments) {
                    pat.metadata.treatments.forEach(t => t.status = 'Completado');
                }
                await SupabaseDataService.savePatient(pat);
                await renderPatientsTable();
                await renderEHRView();
                await renderDashboard();
                Swal.fire({ icon: 'success', title: 'Tratamiento Finalizado', text: `El tratamiento de ${pat.fullname} ha sido finalizado exitosamente.`, timer: 2000, showConfirmButton: false });
            }
        }
    } catch(err) {
        console.error("Error finalizing patient treatment:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message || err });
    }
};

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

    // Load Signatures if present or auto-load doctor profile signature
    if (window.doctorSigPad) {
        window.doctorSigPad.clear();
        if (budget.doctorSignature) {
            window.doctorSigPad.loadFromDataURL(budget.doctorSignature);
        } else {
            autoLoadDoctorSignatureInBudget();
        }
    }
    if (window.patientSigPad) {
        window.patientSigPad.clear();
        if (budget.patientSignature) {
            window.patientSigPad.loadFromDataURL(budget.patientSignature);
        }
    }

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
        currentBudgetItems = currentBudgetItems.filter(item => item.key !== key && item.key !== `${toothNumber}-absence` && item.key !== `${toothNumber}-extraction`);
        await autoSaveActivePatientOdontogram();
        renderBudgetTable();
        return;
    }

    if (mode === 'absence') {
        currentBudgetItems = currentBudgetItems.filter(item => item.key !== `${toothNumber}-extraction`);
        await autoSaveActivePatientOdontogram();
        renderBudgetTable();
        return;
    }

    if (mode === 'extraction') {
        // Look up extraction / exodoncia from baremo or default
        const baremo = await SupabaseDataService.getBaremo();
        const extractionProc = baremo.find(p => p.code === 'EXO-01' || p.name.toLowerCase().includes('exodoncia') || p.name.toLowerCase().includes('extracción')) || {
            code: 'EXO-01',
            name: 'Exodoncia Simple / Extracción Dental',
            priceUSD: 25.00,
            category: 'Cirugía'
        };

        const existingIdx = currentBudgetItems.findIndex(it => it.key === `${toothNumber}-extraction` || (it.tooth == toothNumber && it.name.toLowerCase().includes('exodoncia')));
        if (existingIdx === -1) {
            currentBudgetItems.push({
                key: `${toothNumber}-extraction`,
                tooth: toothNumber,
                face: 'Gnl',
                serviceCode: extractionProc.code,
                name: `${extractionProc.name} (Pieza ${toothNumber})`,
                price: extractionProc.priceUSD || 25,
                discount: 0,
                specialist: (getCurrentUser() && getCurrentUser().fullname) || 'Cirujano Bucal / Odontólogo'
            });
        }
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

    const activeCurrency = localStorage.getItem('dental_exchange_currency') || 'USD';
    const curSymbol = activeCurrency === 'EUR' ? '€' : '$';
    const curLabel = activeCurrency === 'EUR' ? 'EUR' : 'USD';

    // Update labels in index.html to show correct reference currency
    const refTitleLabel = document.getElementById('ref-title-label');
    if (refTitleLabel) {
        refTitleLabel.innerText = activeCurrency === 'EUR' 
            ? 'Total Final en Euros (€):' 
            : 'Total Final en Dólares ($):';
    }
    const customPriceLabel = document.getElementById('custom-price-label');
    if (customPriceLabel) {
        customPriceLabel.innerText = `Precio (${curSymbol} ${curLabel})`;
    }
    const budgetPriceHeader = document.getElementById('budget-price-header');
    if (budgetPriceHeader) {
        budgetPriceHeader.innerText = `Precio (${curSymbol} ${curLabel})`;
    }

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
        document.getElementById('budget-subtotal').innerText = `${curSymbol}0.00`;
        document.getElementById('budget-subtotal-bs').innerText = 'Bs. 0.00';
        document.getElementById('budget-discount-amount').innerText = `${curSymbol}0.00`;
        document.getElementById('budget-discount-ves').innerText = 'Bs. 0.00';
        document.getElementById('budget-total-amount').innerText = `${curSymbol}0.00`;
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
                    ${curSymbol} <input type="number" class="form-control btn-xs srv-price-input" style="width: 70px; padding: 4px 6px; height: auto; text-align: center; border-radius: 4px;" value="${item.price}" step="0.01" data-idx="${index}"> ${curLabel}
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
    document.getElementById('budget-subtotal').innerText = `${curSymbol}${subtotalUSD.toFixed(2)}`;
    document.getElementById('budget-subtotal-bs').innerText = `Bs. ${subtotalVES}`;
    document.getElementById('budget-discount-amount').innerText = `${curSymbol}${discountAmountUSD.toFixed(2)}`;
    document.getElementById('budget-discount-ves').innerText = `Bs. ${discountVES}`;
    
    document.getElementById('budget-total-amount').innerText = `${curSymbol}${totalUSD.toFixed(2)} ${curLabel}`;
    document.getElementById('budget-total-ves').innerText = `${totalVES} Bs`;
    
    const vesTitleLabel = document.getElementById('ves-title-label');
    if (vesTitleLabel) {
        const activeCurrency = localStorage.getItem('dental_exchange_currency') || 'USD';
        vesTitleLabel.innerText = `Total Final en Bolívares (Tasa BCV ${activeCurrency} ${rate.toFixed(2)}):`;
    }
}

window.removeBudgetItem = async function(index) {
    const item = currentBudgetItems[index];
    if (item && item.key) {
        if (window.odontogram) {
            delete window.odontogram.toothData[item.key];
            window.odontogram.render();
        }
    }
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
                    <button class="btn btn-xs btn-outline" style="border-color:#0891b2; color:#0891b2;" onclick="window.editPatient('${p.id}')" title="Editar Ficha / Historia"><i class="fa-solid fa-pen-to-square"></i> <span class="btn-text-full">Editar</span></button>
                    <button class="btn btn-xs btn-success" style="background:#10b981; border:none; color:#fff;" onclick="window.finalizePatientTreatment('${p.id}')" title="Finalizar Tratamiento / Presupuesto"><i class="fa-solid fa-circle-check"></i> <span class="btn-text-full">Finalizar</span></button>
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
                    <div style="grid-column: span 2; margin-top: 12px; display: flex; justify-content: flex-end;">
                        <button class="btn btn-xs btn-outline" style="border-color:#0891b2; color:#0891b2; font-weight:600;" onclick="window.editPatient('${activePatient.id}')" title="Editar todos los datos del paciente (Paso 1, 2, 3 y 4)">
                            <i class="fa-solid fa-user-pen"></i> Editar Ficha Completa del Paciente
                        </button>
                    </div>
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
                        <div style="display: flex; justify-content: flex-end;">
                            <button class="btn btn-xs btn-outline" style="border-color:#0891b2; color:#0891b2; font-weight:600;" onclick="window.editPatient('${activePatient.id}')">
                                <i class="fa-solid fa-pen-to-square"></i> Editar Anamnesis y Hábitos
                            </button>
                        </div>
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

            // 3. Obtener Presupuestos y Tratamientos para Sincronización Total
            const allInvoices = await SupabaseDataService.getInvoices();
            const patientBudgets = allInvoices.filter(i => String(i.patientId) === String(activePatient.id));
            const activeApprovedBudget = patientBudgets.find(b => b.status === 'Aprobado') || patientBudgets[0];

            // Combinar tratamientos registrados en metadata o provenientes del presupuesto activo
            let treatmentsList = (activePatient.metadata && activePatient.metadata.treatments) || [];
            if (treatmentsList.length === 0 && activeApprovedBudget && activeApprovedBudget.items && activeApprovedBudget.items.length > 0) {
                treatmentsList = activeApprovedBudget.items.map((it, idx) => ({
                    id: 'trt-' + (idx + 1),
                    serviceCode: it.code || '',
                    name: it.name || 'Procedimiento',
                    tooth: it.tooth || 'Gnl',
                    face: it.face || '',
                    price: it.price || it.priceUSD || 0,
                    specialist: it.specialist || '',
                    status: (activePatient.sessions && activePatient.sessions.length > idx) ? 'Completado' : 'Planificado',
                    sessionNum: idx + 1
                }));
            }

            // 4. Odontodiagrama Tab (Comparación Diagnóstico Inicial vs Evolución Actual)
            const initialWrapper = document.getElementById('ehr-od-initial-view');
            const currentWrapper = document.getElementById('ehr-od-current-view');
            if (initialWrapper && currentWrapper) {
                initialWrapper.innerHTML = `<div id="od-snap-initial"></div>`;
                currentWrapper.innerHTML = `<div id="od-snap-current"></div>`;
                
                // Odontodiagrama inicial: datos diagnósticos iniciales
                let initOdData = { ...((activePatient.metadata && activePatient.metadata.initialOdontogramData) || activePatient.odontogramData || {}) };
                let currentOdData = { ...(activePatient.odontogramData || {}) };

                // Map any treatments with tooth numbers to ensure visual feedback in Odontodiagrama
                treatmentsList.forEach(t => {
                    if (t.tooth && t.tooth !== 'Gnl' && !isNaN(parseInt(t.tooth))) {
                        const toothNum = parseInt(t.tooth);
                        const faceKey = t.face ? `${toothNum}-${t.face}` : `${toothNum}-center`;
                        if (!initOdData[faceKey]) {
                            initOdData[faceKey] = 'patology'; // Caries / Tratamiento propuesto inicial
                        }
                        if (t.status === 'Completado') {
                            currentOdData[faceKey] = 'treated'; // Verde - Restaurado/Tratado
                        } else {
                            if (!currentOdData[faceKey]) currentOdData[faceKey] = 'proposed'; // Azul - Planificado
                        }
                    }
                });

                const isPedi = (meta.type === 'Infantil') || (activePatient.birthdate && calculateAge(activePatient.birthdate) < 18);

                window.ehrInitialOdontogram = new OdontogramEngine('od-snap-initial', { initialData: initOdData, isPediatric: isPedi, readOnly: true });
                window.ehrCurrentOdontogram = new OdontogramEngine('od-snap-current', { initialData: currentOdData, isPediatric: isPedi, readOnly: true });

                // Mostrar fechas de diagnóstico inicial y de última actualización
                const initDateStr = (activePatient.metadata && activePatient.metadata.initialDiagnosisDate) || (activeApprovedBudget && activeApprovedBudget.date) || activePatient.createdAt || 'Inicial';
                const initDateEl = document.getElementById('ehr-od-initial-date');
                if (initDateEl) initDateEl.innerHTML = `<i class="fa-regular fa-calendar"></i> Registro Inicial: ${initDateStr}`;

                let lastUpdateStr = '';
                if (activePatient.sessions && activePatient.sessions.length > 0) {
                    const latestSession = activePatient.sessions[activePatient.sessions.length - 1];
                    lastUpdateStr = latestSession.datetime ? latestSession.datetime.replace('T', ' ') : latestSession.date;
                }
                if (!lastUpdateStr && activePatient.metadata && activePatient.metadata.odontogramLastUpdated) {
                    lastUpdateStr = activePatient.metadata.odontogramLastUpdated;
                }
                if (!lastUpdateStr) {
                    lastUpdateStr = (activeApprovedBudget && activeApprovedBudget.date) || activePatient.createdAt || new Date().toISOString().split('T')[0];
                }
                const currDateEl = document.getElementById('ehr-od-current-date');
                if (currDateEl) currDateEl.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Actualizado: ${lastUpdateStr}`;
            }

            // Cálculo dinámico del total de sesiones requeridas
            let totalSessions = (meta.initialTreatmentPlan && meta.initialTreatmentPlan.totalSessions) || (treatmentsList.length > 0 ? treatmentsList.length : 4);
            if (totalSessions < 1) totalSessions = 1;

            const completedSessions = activePatient.sessions ? activePatient.sessions.length : 0;
            if (completedSessions > totalSessions) totalSessions = completedSessions;

            const pendingSessions = Math.max(0, totalSessions - completedSessions);
            const pct = Math.min(100, Math.round((completedSessions / totalSessions) * 100));

            // Título del tratamiento general
            let treatmentTitle = (meta.initialTreatmentPlan && meta.initialTreatmentPlan.treatmentName);
            if (!treatmentTitle || treatmentTitle === 'Tratamiento General') {
                if (treatmentsList.length > 0) {
                    treatmentTitle = treatmentsList.map(t => t.name).slice(0, 3).join(' + ') + (treatmentsList.length > 3 ? '...' : '');
                } else if (activeApprovedBudget) {
                    treatmentTitle = `Presupuesto ${activeApprovedBudget.id} (${activeApprovedBudget.paymentTerms || 'Contado'})`;
                } else {
                    treatmentTitle = 'Tratamiento Odontológico General';
                }
            }

            // Actualizar encabezado del progreso
            const treatmentNameEl = document.getElementById('ehr-treatment-name-display');
            if (treatmentNameEl) treatmentNameEl.innerText = treatmentTitle;

            const pctDisplayEl = document.getElementById('ehr-sessions-percent-display');
            if (pctDisplayEl) {
                let statusBadge = '';
                if (pct >= 100) {
                    statusBadge = '<span class="badge-tag green" style="margin-left:8px;"><i class="fa-solid fa-circle-check"></i> 100% Completado</span>';
                } else if (completedSessions > 0) {
                    statusBadge = `<span class="badge-tag amber" style="margin-left:8px;"><i class="fa-solid fa-spinner fa-spin"></i> En Proceso (${completedSessions}/${totalSessions} sesiones)</span>`;
                } else {
                    statusBadge = `<span class="badge-tag blue" style="margin-left:8px;"><i class="fa-solid fa-clipboard-list"></i> Planificado (${totalSessions} sesiones)</span>`;
                }
                pctDisplayEl.innerHTML = `${completedSessions} de ${totalSessions} sesiones (${pct}%) ${statusBadge}`;
            }

            const bar = document.getElementById('ehr-sessions-progress-bar');
            if (bar) {
                bar.style.width = `${pct}%`;
                bar.style.backgroundColor = pct >= 100 ? '#10b981' : (pct >= 50 ? '#06b6d4' : '#f59e0b');
            }

            const timeline = document.getElementById('ehr-sessions-timeline');
            timeline.innerHTML = '';

            // 1. Mostrar tabla de Tratamientos / Presupuesto si existen ítems
            if (treatmentsList.length > 0) {
                const trtSection = document.createElement('div');
                trtSection.style.marginBottom = '20px';
                trtSection.style.padding = '12px 16px';
                trtSection.style.background = 'var(--bg-card)';
                trtSection.style.border = '1px solid var(--border-color)';
                trtSection.style.borderRadius = '8px';

                let trtRowsHtml = treatmentsList.map((t, idx) => {
                    const isDone = (idx < completedSessions) || t.status === 'Completado';
                    return `
                        <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
                            <td style="padding: 6px 8px;"><strong>Pieza ${t.tooth || 'Gnl'}</strong></td>
                            <td style="padding: 6px 8px;">${t.name}</td>
                            <td style="padding: 6px 8px; color: #15803d; font-weight: 600;">$${parseFloat(t.price || 0).toFixed(2)}</td>
                            <td style="padding: 6px 8px;">${t.specialist || 'Dr. Asignado'}</td>
                            <td style="padding: 6px 8px;">
                                <span class="badge-tag ${isDone ? 'green' : 'amber'}">${isDone ? '✓ Atendido' : '⏳ Planificado'}</span>
                            </td>
                        </tr>
                    `;
                }).join('');

                trtSection.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h4 style="margin:0; font-size:0.92rem; color:var(--primary-cyan);"><i class="fa-solid fa-teeth"></i> Tratamientos Planificados en Presupuesto</h4>
                        ${activeApprovedBudget ? `<small class="text-muted"><i class="fa-solid fa-receipt"></i> ${activeApprovedBudget.id} • $${parseFloat(activeApprovedBudget.totalRef || 0).toFixed(2)} USD</small>` : ''}
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; text-align:left;">
                            <thead>
                                <tr style="border-bottom:2px solid var(--border-color); font-size:0.75rem; color:#64748b; text-transform:uppercase;">
                                    <th style="padding:4px 8px;">Diente</th>
                                    <th style="padding:4px 8px;">Procedimiento</th>
                                    <th style="padding:4px 8px;">Monto</th>
                                    <th style="padding:4px 8px;">Especialista</th>
                                    <th style="padding:4px 8px;">Estado</th>
                                </tr>
                            </thead>
                            <tbody>${trtRowsHtml}</tbody>
                        </table>
                    </div>
                `;
                timeline.appendChild(trtSection);
            }

            // 2. Renderizar Línea de Tiempo de Sesiones (1 a Total): Flexibilidad total para atender en cualquier orden
            const patientSessions = activePatient.sessions || [];

            for (let sNum = 1; sNum <= totalSessions; sNum++) {
                const s = patientSessions.find(sess => sess.sessionNum === sNum);
                const trtItem = treatmentsList[sNum - 1];

                if (s) {
                    // SESIÓN REALIZADA
                    let matsHtml = '';
                    if (s.materials && s.materials.length > 0) {
                        matsHtml = '<div style="margin-top:8px; font-size:0.75rem; color:#64748b;"><strong>Insumos descargados:</strong> ';
                        matsHtml += s.materials.map(m => `${m.name} (x${m.qty})`).join(', ');
                        matsHtml += '</div>';
                    }

                    const deleteSessionBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" style="margin-left:4px;" onclick="deleteSessionFromPatient('${activePatient.id}', ${s.sessionNum})" title="Eliminar Sesión"><i class="fa-solid fa-trash"></i></button>`;

                    let payInfoHtml = '';
                    if (s.paymentUSD > 0) {
                        payInfoHtml = `<div style="margin-top: 6px; font-size: 0.8rem; color: #15803d; font-weight: 600;"><i class="fa-solid fa-money-bill-wave"></i> Cobrado en sesión: $${s.paymentUSD.toFixed(2)} USD (${s.paymentMethodLabel || 'Efectivo'})</div>`;
                    }

                    const div = document.createElement('div');
                    div.className = 'timeline-item timeline-item-completed';
                    div.innerHTML = `
                        <div class="timeline-meta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 6px;">
                            <span><strong style="color:#10b981;"><i class="fa-solid fa-circle-check"></i> Sesión N° ${s.sessionNum}</strong> — <i class="fa-solid fa-clock"></i> ${s.datetime}</span>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <button class="btn btn-xs btn-outline" style="color: #15803d; border-color: #22c55e;" onclick="sendSessionReceiptWhatsApp('${activePatient.id}', ${s.sessionNum})" title="Enviar Recibo por WhatsApp"><i class="fa-brands fa-whatsapp"></i> Recibo</button>
                                <button class="btn btn-xs btn-outline" onclick="downloadSessionReceiptPDFById('${activePatient.id}', ${s.sessionNum})" title="Descargar Recibo en PDF"><i class="fa-solid fa-file-pdf text-blue"></i> PDF</button>
                                <span class="badge-tag green">✓ Realizada</span>
                                ${deleteSessionBtn}
                            </div>
                        </div>
                        <p style="margin:8px 0; font-size:0.88rem; color:var(--text-heading); font-weight:500;">${s.procedure}</p>
                        ${s.indications ? `<p style="margin:4px 0; font-size:0.8rem; color:#0284c7;"><strong>Indicaciones Médicas:</strong> ${s.indications}</p>` : ''}
                        ${payInfoHtml}
                        ${matsHtml}
                        ${s.signatureData ? `
                        <div style="margin-top:10px; display:flex; align-items:center; gap:10px;">
                            <span style="font-size:0.75rem; color:#64748b;">Firma de conformidad:</span>
                            <img src="${s.signatureData}" style="max-height: 40px; border:1px solid var(--border-color); border-radius:4px; padding:2px; background:#fff;" alt="Firma de conformidad del paciente">
                        </div>` : ''}
                    `;
                    timeline.appendChild(div);
                } else {
                    // SESIÓN PENDIENTE POR ATENDER
                    const procHint = trtItem ? `Procedimiento asignado: <strong>${trtItem.name}</strong> (Pieza ${trtItem.tooth || 'Gnl'})` : 'Continuación del plan de tratamiento';
                    const defaultProcName = trtItem ? trtItem.name : `Sesión #${sNum}`;

                    const pendingDiv = document.createElement('div');
                    pendingDiv.className = 'timeline-item timeline-item-pending';
                    pendingDiv.innerHTML = `
                        <div class="timeline-meta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 6px;">
                            <span><strong style="color:#f59e0b;"><i class="fa-solid fa-hourglass-half"></i> Sesión N° ${sNum}</strong> — <span class="badge-tag amber">⏳ Pendiente</span></span>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <button class="btn btn-xs btn-outline" style="border-color:var(--primary-cyan); color:var(--primary-cyan);" onclick="window.openAppointmentModalForPatient('${activePatient.id}', ${sNum}, '${defaultProcName}')" title="Agendar esta sesión en la Agenda">
                                    <i class="fa-solid fa-calendar-plus"></i> Agendar
                                </button>
                                <button class="btn btn-xs btn-primary" style="background-color:var(--primary-cyan) !important; color:white !important;" onclick="window.openSessionModalForPatient('${activePatient.id}', ${sNum}, '${defaultProcName}')" title="Atender esta sesión ahora">
                                    <i class="fa-solid fa-stethoscope"></i> Atender Sesión N° ${sNum}
                                </button>
                            </div>
                        </div>
                        <p style="margin:6px 0 0 0; font-size:0.84rem; color:var(--text-muted);">${procHint}</p>
                    `;
                    timeline.appendChild(pendingDiv);
                }
            }

            // 3. Renderizar Sesiones adicionales fuera del plan (si hubiere)
            const extraSessions = patientSessions.filter(sess => sess.sessionNum > totalSessions);
            extraSessions.forEach(s => {
                const div = document.createElement('div');
                div.className = 'timeline-item timeline-item-completed';
                div.innerHTML = `
                    <div class="timeline-meta" style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 6px;">
                        <span><strong style="color:#10b981;"><i class="fa-solid fa-circle-check"></i> Sesión Extra N° ${s.sessionNum}</strong> — <i class="fa-solid fa-clock"></i> ${s.datetime}</span>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span class="badge-tag green">✓ Realizada</span>
                        </div>
                    </div>
                    <p style="margin:8px 0; font-size:0.88rem; color:var(--text-heading);">${s.procedure}</p>
                `;
                timeline.appendChild(div);
            });

            // Bind sessions add button (Permite registrar cualquier sesión libremente)
            const addSessBtn = document.getElementById('btn-add-session');
            if (addSessBtn) {
                addSessBtn.onclick = async () => {
                    // Encontrar la primera sesión que falte por atender
                    let nextSuggestedNum = 1;
                    for (let n = 1; n <= totalSessions + 1; n++) {
                        if (!patientSessions.some(ps => ps.sessionNum === n)) {
                            nextSuggestedNum = n;
                            break;
                        }
                    }

                    await window.openSessionModalForPatient(activePatient.id, nextSuggestedNum, '');
                };
            }

            // 5. Pagos Tab (Balance Financiero 360° del Paciente)
            const payTbody = document.getElementById('ehr-payments-table-body');
            payTbody.innerHTML = '';
            
            // Recopilar todos los abonos, presupuestos y pagos del paciente
            const allPaymentsList = [];

            // Presupuestos
            patientBudgets.forEach(b => {
                allPaymentsList.push({
                    date: b.invoiceDate || '2026-01-01',
                    concept: `Presupuesto ${b.id} (${b.paymentTerms || 'Contado'})`,
                    method: b.paymentMethod || 'transferencia',
                    bank: b.bank || 'Caja Principal',
                    reference: b.reference || b.id,
                    totalUSD: parseFloat(b.totalRef || 0),
                    paidUSD: b.status === 'Aprobado' ? parseFloat(b.totalRef || 0) : 0,
                    balanceUSD: b.status === 'Aprobado' ? 0 : parseFloat(b.totalRef || 0),
                    status: b.status === 'Aprobado' ? 'Pagado' : 'Pendiente'
                });
            });

            // Pagos manuales o de sesiones
            if (activePatient.payments && activePatient.payments.length > 0) {
                activePatient.payments.forEach(p => {
                    allPaymentsList.push({
                        date: p.date || new Date().toISOString().split('T')[0],
                        concept: p.concept || 'Abono Registrado',
                        method: p.method || 'cash',
                        bank: p.bank || (p.method === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                        reference: p.reference || 'N/A',
                        totalUSD: parseFloat(p.totalUSD || 0),
                        paidUSD: parseFloat(p.paidUSD || 0),
                        balanceUSD: parseFloat(p.balanceUSD || 0),
                        status: p.status || 'Pagado'
                    });
                });
            }

            if (allPaymentsList.length > 0) {
                let totalQuoted = 0;
                let totalPaid = 0;
                let totalDebt = 0;

                allPaymentsList.forEach(pay => {
                    totalQuoted += pay.totalUSD;
                    totalPaid += pay.paidUSD;
                    totalDebt += pay.balanceUSD;

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${pay.date}</td>
                        <td><strong>${pay.concept}</strong></td>
                        <td><span style="font-size: 0.82rem; color: #1e40af; font-weight: 600;"><i class="fa-solid fa-building-columns"></i> ${pay.bank}</span> <small style="display:block; color:#64748b;">${getPaymentMethodLabel(pay.method)}</small></td>
                        <td><span class="badge-tag" style="background:#e0f2fe; color:#0369a1; font-family: monospace; font-size:0.75rem; padding: 2px 6px;">${pay.reference}</span></td>
                        <td>$${pay.totalUSD.toFixed(2)}</td>
                        <td class="text-green" style="font-weight:600;">$${pay.paidUSD.toFixed(2)}</td>
                        <td class="${pay.balanceUSD > 0 ? 'text-red' : 'text-muted'}" style="font-weight:600;">$${pay.balanceUSD.toFixed(2)}</td>
                        <td><span class="badge-tag ${pay.status === 'Pagado' || pay.status === 'Aprobado' ? 'green' : 'amber'}">${pay.status}</span></td>
                    `;
                    payTbody.appendChild(tr);
                });
            } else {
                payTbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:20px;">Sin registro de pagos o saldos pendientes. Haga clic en "+ Registrar Pago / Abono" arriba.</td></tr>`;
            }

            // 6. Galería de Fotos Clínicas & Rayos X
            renderEHRGallery(activePatient, window.currentEHRGalleryFilter || 'all');

            const filterChips = document.querySelectorAll('#ehr-gallery-filter-chips .check-chip');
            filterChips.forEach(chip => {
                chip.onclick = () => {
                    filterChips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    renderEHRGallery(activePatient, chip.dataset.galleryFilter);
                };
            });

            const openUploadBtn = document.getElementById('btn-open-upload-photo-modal');
            if (openUploadBtn) {
                openUploadBtn.onclick = () => {
                    document.getElementById('form-ehr-photo-upload').reset();
                    document.getElementById('ehr-photo-preview-container').style.display = 'none';
                    openModal('modal-ehr-photo-upload');
                };
            }

            const photoFileInput = document.getElementById('ehr-modal-photo-file');
            if (photoFileInput) {
                photoFileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const prevImg = document.getElementById('ehr-modal-photo-preview-img');
                            if (prevImg) {
                                prevImg.src = event.target.result;
                                document.getElementById('ehr-photo-preview-container').style.display = 'block';
                            }
                        };
                        reader.readAsDataURL(file);
                    }
                };
            }

            const submitPhotoBtn = document.getElementById('btn-submit-ehr-photo');
            if (submitPhotoBtn) {
                submitPhotoBtn.onclick = async (e) => {
                    e.preventDefault();
                    const fileInput = document.getElementById('ehr-modal-photo-file');
                    const category = document.getElementById('ehr-modal-photo-category').value;
                    const title = document.getElementById('ehr-modal-photo-title').value.trim();
                    const notes = document.getElementById('ehr-modal-photo-notes').value.trim();

                    if (!fileInput.files[0] || !title) {
                        Swal.fire({ icon: 'warning', text: 'Por favor seleccione una imagen y escriba un título para el estudio.' });
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const photoBase64 = event.target.result;
                        const newPhoto = {
                            id: 'photo_' + Date.now(),
                            url: photoBase64,
                            category,
                            title,
                            notes,
                            date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                        };

                        activePatient.metadata = activePatient.metadata || {};
                        activePatient.metadata.photos = activePatient.metadata.photos || [];
                        activePatient.metadata.photos.unshift(newPhoto);

                        await SupabaseDataService.updatePatient(activePatient.id, activePatient);
                        closeModal('modal-ehr-photo-upload');

                        Swal.fire({
                            icon: 'success',
                            title: '¡Foto / Rayos X Guardado!',
                            text: 'El estudio se añadió al álbum clínico del paciente.',
                            timer: 1800,
                            showConfirmButton: false
                        });

                        renderEHRGallery(activePatient, window.currentEHRGalleryFilter || 'all');
                    };
                    reader.readAsDataURL(fileInput.files[0]);
                };
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

            if (this.dataset.subtab === 'odontogram-comp') {
                if (window.ehrInitialOdontogram) window.ehrInitialOdontogram.render();
                if (window.ehrCurrentOdontogram) window.ehrCurrentOdontogram.render();
            }
        };
    });
}

window.currentEHRGalleryFilter = 'all';

function renderEHRGallery(patient, filter = 'all') {
    window.currentEHRGalleryFilter = filter;
    const container = document.getElementById('ehr-gallery-photos-grid');
    if (!container) return;
    container.innerHTML = '';

    const photos = (patient.metadata && patient.metadata.photos) || patient.photos || [];
    let filteredPhotos = [...photos];

    if (filter !== 'all') {
        filteredPhotos = filteredPhotos.filter(p => p.category === filter);
    }

    if (filteredPhotos.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 35px 20px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 10px;">
                <i class="fa-solid fa-camera-retro" style="font-size: 2.2rem; color: #94a3b8; margin-bottom: 10px; display: block;"></i>
                <h4 style="margin: 0 0 5px 0; color: #475569;">No hay imágenes registradas en esta categoría</h4>
                <p class="text-muted" style="margin: 0; font-size: 0.85rem;">Haga clic en "+ Subir Foto / Rayos X" para añadir imágenes clínicas al expediente.</p>
            </div>
        `;
        return;
    }

    filteredPhotos.forEach(p => {
        const card = document.createElement('div');
        card.className = 'ehr-photo-card';
        card.style.cssText = `
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            transition: transform 0.2s, box-shadow 0.2s;
            display: flex;
            flex-direction: column;
        `;

        let catBadgeColor = '#0284c7';
        let catBg = '#e0f2fe';
        if (p.category === 'Antes') { catBadgeColor = '#b45309'; catBg = '#fef3c7'; }
        else if (p.category === 'Después') { catBadgeColor = '#059669'; catBg = '#d1fae5'; }
        else if (p.category === 'Radiografía') { catBadgeColor = '#6d28d9'; catBg = '#ede9fe'; }

        const safeTitle = (p.title || 'Foto Clínica').replace(/'/g, "\\'");
        const safeCat = (p.category || 'Clínica').replace(/'/g, "\\'");
        const safeDate = (p.date || '').replace(/'/g, "\\'");
        const safeNotes = (p.notes || '').replace(/'/g, "\\'");

        card.innerHTML = `
            <div style="height: 150px; background: #0f172a; overflow: hidden; position: relative; cursor: pointer;" onclick="window.openEHRPhotoLightbox('${p.url}', '${safeTitle}', '${safeCat}', '${safeDate}', '${safeNotes}')">
                <img src="${p.url}" style="width: 100%; height: 100%; object-fit: cover;" alt="${safeTitle}">
                <span style="position: absolute; top: 8px; left: 8px; font-size: 0.72rem; font-weight: 700; background: ${catBg}; color: ${catBadgeColor}; padding: 2px 8px; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.2);">${p.category || 'Clínica'}</span>
            </div>
            <div style="padding: 10px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <h5 style="margin: 0 0 4px 0; font-size: 0.88rem; color: #1e293b; line-height: 1.3;" title="${p.title}">${p.title}</h5>
                    <small class="text-muted" style="font-size: 0.75rem; display: block; margin-bottom: 6px;"><i class="fa-regular fa-calendar"></i> ${p.date || 'Sin fecha'}</small>
                    ${p.notes ? `<p style="margin: 0; font-size: 0.78rem; color: #64748b; line-height: 1.3; max-height: 36px; overflow: hidden; text-overflow: ellipsis;">${p.notes}</p>` : ''}
                </div>
                <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 8px;">
                    <button class="btn btn-xs btn-outline" style="font-size: 0.75rem; padding: 2px 8px;" onclick="window.openEHRPhotoLightbox('${p.url}', '${safeTitle}', '${safeCat}', '${safeDate}', '${safeNotes}')">
                        <i class="fa-solid fa-expand"></i> Ver
                    </button>
                    <button class="btn btn-xs btn-outline text-red" style="font-size: 0.75rem; padding: 2px 6px;" onclick="window.deleteEHRPhoto('${p.id}')" title="Eliminar Imagen">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

window.openEHRPhotoLightbox = function(url, title, category, date, notes) {
    const imgEl = document.getElementById('ehr-lightbox-img');
    const titleEl = document.getElementById('ehr-lightbox-title');
    const catEl = document.getElementById('ehr-lightbox-category');
    const dateEl = document.getElementById('ehr-lightbox-date');
    const notesEl = document.getElementById('ehr-lightbox-notes');

    if (imgEl) imgEl.src = url;
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-image text-cyan"></i> ${title}`;
    if (catEl) catEl.innerText = category;
    if (dateEl) dateEl.innerText = date ? `Fecha: ${date}` : '';
    if (notesEl) notesEl.innerText = notes || 'Sin notas adicionales.';

    openModal('modal-ehr-lightbox');
};

window.deleteEHRPhoto = async function(photoId) {
    Swal.fire({
        title: '¿Eliminar imagen clínica?',
        text: 'Esta fotografía o radiografía será eliminada del expediente del paciente.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const activeId = getActivePatientId();
            if (!activeId) return;
            const patients = await SupabaseDataService.getPatients();
            const patient = patients.find(p => p.id === activeId);
            if (patient && patient.metadata && patient.metadata.photos) {
                patient.metadata.photos = patient.metadata.photos.filter(p => p.id !== photoId);
                await SupabaseDataService.updatePatient(patient.id, patient);
                renderEHRGallery(patient, window.currentEHRGalleryFilter || 'all');
                Swal.fire({ icon: 'success', title: 'Imagen eliminada', timer: 1500, showConfirmButton: false });
            }
        }
    });
};

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
    const allPayments = [];
    
    // Budgets / Invoices
    try {
        const allInvoices = await SupabaseDataService.getInvoices();
        const patientBudgets = allInvoices.filter(i => String(i.patientId) === String(patient.id));
        patientBudgets.forEach(b => {
            allPayments.push({
                date: b.invoiceDate || '2026-01-01',
                concept: `Presupuesto ${b.id} (${b.paymentTerms || 'Contado'})`,
                method: b.paymentMethod || 'transferencia',
                bank: b.bank || 'Caja Principal',
                reference: b.reference || b.id,
                totalUSD: parseFloat(b.totalRef || 0),
                paidUSD: b.status === 'Aprobado' ? parseFloat(b.totalRef || 0) : 0,
                balanceUSD: b.status === 'Aprobado' ? 0 : parseFloat(b.totalRef || 0),
                status: b.status === 'Aprobado' ? 'Pagado' : 'Pendiente'
            });
        });
    } catch(e) {}

    // Direct and Session Payments
    if (patient.payments && patient.payments.length > 0) {
        patient.payments.forEach(pay => {
            allPayments.push({
                date: pay.date || new Date().toISOString().split('T')[0],
                concept: pay.concept || 'Abono Registrado',
                method: pay.method || 'cash',
                bank: pay.bank || (pay.method === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                reference: pay.reference || 'N/A',
                totalUSD: parseFloat(pay.totalUSD || 0),
                paidUSD: parseFloat(pay.paidUSD || 0),
                balanceUSD: parseFloat(pay.balanceUSD || 0),
                status: pay.status || 'Pagado'
            });
        });
    }

    if (allPayments.length > 0) {
        allPayments.forEach(pay => {
            paymentsHtml += `
                <tr>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem;">${pay.date}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem;"><strong>${pay.concept}</strong></td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem; color:#1e40af;">${pay.bank} <small style="color:#64748b; display:block;">(${getPaymentMethodLabel(pay.method)})</small></td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem; font-family:monospace;">${pay.reference}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem;">$${pay.totalUSD.toFixed(2)}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem; color:#059669; font-weight:600;">$${pay.paidUSD.toFixed(2)}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:0.78rem; color:${pay.balanceUSD > 0 ? '#dc2626' : '#64748b'}; font-weight:600;">$${pay.balanceUSD.toFixed(2)}</td>
                </tr>
            `;
        });
    } else {
        paymentsHtml = `<tr><td colspan="7" style="text-align:center; padding:12px; color:#64748b; font-size:0.8rem;">Sin pagos o presupuestos registrados</td></tr>`;
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

    const repInfo = (patient.metadata && patient.metadata.repName) ? `
        <div style="grid-column: span 2; background: #eff6ff; padding: 8px 12px; border-radius: 6px; border: 1px solid #bfdbfe; margin-top: 5px;">
            <strong>Representante Legal:</strong> ${patient.metadata.repName} (C.I: ${patient.metadata.repId || 'N/A'} | Tel: ${patient.metadata.repPhone || 'N/A'} | Relación: ${patient.metadata.repRelation || 'Representante'})
        </div>
    ` : '';

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
                👤 Datos de Filiación del Paciente
            </h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
                <div><strong>Nombre y Apellido:</strong> ${patient.fullname}</div>
                <div><strong>Cédula / ID:</strong> ${patient.id}</div>
                <div><strong>Fecha Nacimiento:</strong> ${patient.birthdate} (${calculateAge(patient.birthdate)} años)</div>
                <div><strong>Teléfono:</strong> ${patient.phone}</div>
                <div><strong>Ocupación / Profesión:</strong> ${patient.occupation || (patient.metadata && patient.metadata.profession) || 'N/A'}</div>
                <div><strong>Correo Electrónico:</strong> ${patient.email || 'N/A'}</div>
                <div style="grid-column: span 2;"><strong>Dirección de Habitación:</strong> ${(patient.metadata && patient.metadata.address) || patient.address || 'N/A'}</div>
                ${repInfo}
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
                📝 Registro de Evoluciones Clínicas y Sesiones
            </h3>
            ${evolutionsHtml}
        </div>

        <!-- PAYMENTS & ACCOUNT BALANCE -->
        <div style="margin-bottom: 30px;">
            <h3 style="font-size: 1.05rem; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 12px;">
                💳 Estado de Cuenta, Presupuestos y Pagos / Abonos
            </h3>
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background: #f1f5f9; font-size: 0.75rem; color: #475569;">
                        <th style="padding: 6px 8px;">Fecha</th>
                        <th style="padding: 6px 8px;">Tratamiento / Concepto</th>
                        <th style="padding: 6px 8px;">Banco / Método</th>
                        <th style="padding: 6px 8px;">Nº Ref</th>
                        <th style="padding: 6px 8px;">Total</th>
                        <th style="padding: 6px 8px;">Abonado</th>
                        <th style="padding: 6px 8px;">Saldo Pendiente</th>
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
    await generatePDFFromElement(container, filename);
}

window.exportEHRToPDF = exportEHRToPDF;

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
            
            const isAttended = (app.status === 'Completada' || app.status === 'Atendida');

            let whatsappBtnHtml = '';
            if (!isAttended) {
                whatsappBtnHtml = `
                    <button class="btn btn-xs btn-success btn-appt-reminder" style="background-color: #22c55e !important; color: white !important; border: none !important; padding: 4px 8px; border-radius: 6px;" onclick="sendWhatsAppReminderForAppt('${app.id}')" title="Notificar por WhatsApp">
                        <i class="fa-brands fa-whatsapp" style="font-size: 0.95rem;"></i>
                    </button>
                `;
            }

            const abonoBtn = isAttended ? '' : `
                <button class="btn btn-xs btn-outline" style="border-color: #10b981; color: #059669; font-weight: 600;" onclick="window.openPaymentModalForAppointment('${app.patientId}', '${app.patientName}', '${app.treatment}')" title="Registrar Abono Anticipado">
                    <i class="fa-solid fa-hand-holding-dollar"></i> <span class="btn-text-full">Abonar</span>
                </button>
            `;

            const editApptBtn = `<button class="btn btn-xs btn-outline btn-appt-edit" style="border-color: #0891b2; color: #0891b2;" onclick="window.editAppointment('${app.id}')" title="Editar Cita"><i class="fa-solid fa-pen-to-square"></i> <span class="btn-text-full">Editar</span></button>`;

            const deleteApptBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" onclick="deleteAppointment('${app.id}')" title="Eliminar Cita"><i class="fa-solid fa-trash"></i></button>`;

            let actionAttendOrViewHtml = '';
            let statusBadgeHtml = `<span class="badge-tag blue">${app.status || 'Programada'}</span>`;
            let itemClass = 'timeline-item';

            if (isAttended) {
                itemClass = 'timeline-item timeline-item-attended';
                statusBadgeHtml = `<span class="badge-tag green" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Atendida</span>`;
                actionAttendOrViewHtml = `<button class="btn btn-xs btn-outline" style="border-color: #10b981; color: #059669; font-weight: 600;" onclick="window.viewAttendedSessionForPatient('${app.patientId}')" title="Ver Evolución Clínica"><i class="fa-solid fa-file-medical"></i> <span class="btn-text-full">Ver Evolución</span></button>`;
            } else if (!isAssistant && (app.status === 'Programada' || app.status === 'En Espera' || !app.status)) {
                actionAttendOrViewHtml = `<button class="btn btn-xs btn-primary btn-appt-attend" style="background-color: var(--primary-cyan) !important; color: white !important; border: none !important;" onclick="window.atenderAppointmentFromAgenda('${app.id}')" title="Atender esta cita ahora"><i class="fa-solid fa-user-doctor"></i> Atender</button>`;
            }

            const div = document.createElement('div');
            div.className = itemClass;
            div.style.marginBottom = '12px';
            div.innerHTML = `
                <div class="timeline-meta">
                    <div class="timeline-time-status">
                        <span class="timeline-time"><i class="fa-solid fa-clock text-cyan"></i> ${app.time}</span>
                        ${statusBadgeHtml}
                    </div>
                    <div class="timeline-actions">
                        ${whatsappBtnHtml}
                        ${abonoBtn}
                        ${editApptBtn}
                        ${actionAttendOrViewHtml}
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

    // Dynamic currency symbols for dashboard metrics
    const activeCurrency = localStorage.getItem('dental_exchange_currency') || 'USD';
    const curSymbol = activeCurrency === 'EUR' ? '€' : '$';

    const dayIcon = document.querySelector('.stat-card.border-cyan .stat-icon i');
    if (dayIcon) {
        if (curSymbol === '€') {
            dayIcon.className = 'fa-solid fa-euro-sign';
        } else {
            dayIcon.className = 'fa-solid fa-dollar-sign';
        }
    }

    try {
        const allPatients = await SupabaseDataService.getPatients();
        const allInvoices = await SupabaseDataService.getInvoices();
        const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
        const monthStr = todayStr.substring(0, 7); // YYYY-MM

        let todayIncome = 0;
        let monthIncome = 0;
        let totalReceivables = 0;
        const debtorPatientsSet = new Set();
        let attendedCount = 0;
        const procedureCounts = {};

        allPatients.forEach(p => {
            // 1. Pagos y abonos del paciente
            (p.payments || []).forEach(pay => {
                const payDate = pay.date ? pay.date.split('T')[0] : '';
                const paid = parseFloat(pay.paidUSD || 0);
                const debt = parseFloat(pay.balanceUSD || 0);

                if (payDate === todayStr) {
                    todayIncome += paid;
                }
                if (payDate.startsWith(monthStr)) {
                    monthIncome += paid;
                }
                if (debt > 0) {
                    totalReceivables += debt;
                    debtorPatientsSet.add(p.id);
                }
            });

            // 2. Sesiones clínicas
            (p.sessions || []).forEach(s => {
                if (s.procedure) {
                    const procName = s.procedure.split('(')[0].trim();
                    if (procName) {
                        procedureCounts[procName] = (procedureCounts[procName] || 0) + 1;
                    }
                }
            });

            // 3. Pacientes atendidos hoy
            let hasSessionToday = false;
            if (p.sessions && p.sessions.length > 0) {
                hasSessionToday = p.sessions.some(s => s.datetime && s.datetime.startsWith(todayStr));
            }
            let hasNoteToday = false;
            if (p.clinicalNotes && p.clinicalNotes.length > 0) {
                hasNoteToday = p.clinicalNotes.some(n => n.datetime && n.datetime.replace('T', ' ').startsWith(todayStr));
            }
            if (hasSessionToday || hasNoteToday) {
                attendedCount++;
            }
        });

        // 4. Presupuestos y facturas emitidas vs aprobadas
        let totalBudgets = 0;
        let approvedBudgets = 0;
        (allInvoices || []).forEach(inv => {
            const isBudget = inv.id.startsWith('PRE-') || (inv.items && inv.items.length > 0);
            if (isBudget) {
                totalBudgets++;
                if (inv.status === 'Aprobado' || inv.status === 'Pagada' || inv.status === 'Pagado') {
                    approvedBudgets++;
                }
            }
        });

        const conversionPct = totalBudgets > 0 ? Math.round((approvedBudgets / totalBudgets) * 100) : 0;

        // Render Cards
        const metricToday = document.getElementById('metric-today-income');
        if (metricToday) metricToday.innerText = `${curSymbol}${todayIncome.toFixed(2)}`;

        const trendToday = document.getElementById('metric-today-trend');
        if (trendToday) trendToday.innerHTML = `<i class="fa-solid fa-circle-dollar-to-slot"></i> ${curSymbol}${todayIncome.toFixed(2)} hoy`;

        const metricMonth = document.getElementById('metric-month-income');
        if (metricMonth) metricMonth.innerText = `${curSymbol}${monthIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const subMonth = document.getElementById('metric-month-sub');
        if (subMonth) subMonth.innerText = `Total cobrado en ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`;

        const metricConversion = document.getElementById('metric-conversion');
        if (metricConversion) metricConversion.innerText = `${conversionPct}%`;

        const subConversion = document.getElementById('metric-conversion-sub');
        if (subConversion) subConversion.innerText = `${approvedBudgets} Aprobados de ${totalBudgets} Emitidos`;

        const metricReceivables = document.getElementById('metric-receivables');
        if (metricReceivables) metricReceivables.innerText = `${curSymbol}${totalReceivables.toFixed(2)}`;

        const subReceivables = document.getElementById('metric-receivables-sub');
        if (subReceivables) subReceivables.innerText = `${debtorPatientsSet.size} ${debtorPatientsSet.size === 1 ? 'paciente' : 'pacientes'} con saldo pendiente`;

        const metricAttendedToday = document.getElementById('metric-attended-today');
        if (metricAttendedToday) metricAttendedToday.innerText = attendedCount.toString();

        // Render Popular Treatments
        const popularList = document.getElementById('popular-treatments-list');
        if (popularList) {
            const sortedProcedures = Object.entries(procedureCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
            if (sortedProcedures.length > 0) {
                popularList.innerHTML = sortedProcedures.map(([proc, count]) => `
                    <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border-color);">
                        <span style="font-weight:600; color:var(--text-main); font-size:0.85rem;">${proc}</span>
                        <span class="badge-tag cyan">${count} ${count === 1 ? 'asistencia' : 'asistencias'}</span>
                    </div>
                `).join('');
            } else {
                popularList.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.84rem;">
                        <i class="fa-solid fa-chart-pie" style="font-size: 1.5rem; margin-bottom: 6px; display: block; opacity: 0.5;"></i>
                        Sin procedimientos registrados aún.<br>Al atender sesiones o presupuestos aparecerán aquí las estadísticas en tiempo real.
                    </div>
                `;
            }
        }

    } catch (e) {
        console.warn("Error calculating real metrics for dashboard:", e);
    }

    window.checkGlobalStockAlerts();
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

async function renderAgendaView(filter = 'pending', searchQuery = '') {
    const agendaListMain = document.getElementById('agenda-list-main');
    if (!agendaListMain) return;

    agendaListMain.innerHTML = '';
    const allAppointments = await SupabaseDataService.getAppointments();
    const currentUser = getCurrentUser();
    const isAssistant = currentUser && currentUser.role.toLowerCase().includes('asistente');

    // Update Counts for Filter Badges
    const countPending = allAppointments.filter(a => a.status !== 'Completada' && a.status !== 'Atendida' && a.status !== 'Cancelada').length;
    const countAttended = allAppointments.filter(a => a.status === 'Completada' || a.status === 'Atendida').length;
    const countAll = allAppointments.length;

    const elPending = document.getElementById('count-agenda-pending');
    const elAttended = document.getElementById('count-agenda-attended');
    const elAll = document.getElementById('count-agenda-all');
    if (elPending) elPending.textContent = countPending;
    if (elAttended) elAttended.textContent = countAttended;
    if (elAll) elAll.textContent = countAll;

    // Apply Filter
    let appointments = [...allAppointments];
    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

    if (filter === 'pending') {
        appointments = appointments.filter(app => app.status !== 'Completada' && app.status !== 'Atendida' && app.status !== 'Cancelada');
    } else if (filter === 'attended' || filter === 'Completada') {
        appointments = appointments.filter(app => app.status === 'Completada' || app.status === 'Atendida');
    } else if (filter === 'today') {
        appointments = appointments.filter(app => app.date === todayStr || app.date === 'today' || app.date === 'today-appt' || app.isTomorrow === false);
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
    } else if (filter !== 'all') {
        appointments = appointments.filter(app => app.status === filter);
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
        const emptyMsg = filter === 'pending' 
            ? '¡Excelente! No hay citas pendientes por atender en este momento.'
            : (filter === 'attended' ? 'Aún no se han registrado citas atendidas hoy.' : 'No se encontraron citas con los filtros activos.');
        const emptyIcon = filter === 'pending' ? 'fa-clipboard-check' : 'fa-calendar-xmark';
        agendaListMain.innerHTML = `<div style="text-align:center; padding:35px 20px; color:var(--text-muted);"><i class="fa-solid ${emptyIcon}" style="font-size:2.2rem; color: #10b981; margin-bottom:12px; display:block;"></i><div style="font-size:0.95rem; font-weight:600;">${emptyMsg}</div></div>`;
        return;
    }

    appointments.forEach(app => {
        const isAttended = (app.status === 'Completada' || app.status === 'Atendida');
        const isTomorrowAppt = app.isTomorrow === true || app.date === 'tomorrow';
        
        let whatsappBtnHtml = '';
        if (!isAttended) {
            whatsappBtnHtml = `
                <button class="btn btn-xs btn-success btn-appt-reminder" style="background-color: #22c55e !important; color: white !important; border: none !important; padding: 4px 8px; border-radius: 6px;" onclick="sendWhatsAppReminderForAppt('${app.id}')" title="Notificar por WhatsApp">
                    <i class="fa-brands fa-whatsapp" style="font-size: 0.95rem;"></i>
                </button>
            `;
        }

        const abonoBtn = isAttended ? '' : `
            <button class="btn btn-xs btn-outline" style="border-color: #10b981; color: #059669; font-weight: 600;" onclick="window.openPaymentModalForAppointment('${app.patientId}', '${app.patientName}', '${app.treatment}')" title="Registrar Abono Anticipado">
                <i class="fa-solid fa-hand-holding-dollar"></i> <span class="btn-text-full">Abonar</span>
            </button>
        `;

        const deleteApptBtn = isAssistant ? '' : `<button class="btn btn-xs btn-outline text-red" onclick="deleteAppointment('${app.id}')" title="Eliminar Cita"><i class="fa-solid fa-trash"></i></button>`;

        const gCalBtn = isAttended ? '' : `
            <button class="btn btn-xs btn-outline btn-appt-gcal" style="border-color: #2563eb; color: #2563eb;" onclick="addApptToGoogleCalendarDirect('${app.id}')" title="Añadir a Google Calendar">
                <i class="fa-solid fa-calendar-plus"></i> <span class="btn-text-full">Calendar</span>
            </button>
        `;

        const editApptBtn = `<button class="btn btn-xs btn-outline btn-appt-edit" style="border-color: #0891b2; color: #0891b2;" onclick="window.editAppointment('${app.id}')" title="Editar Cita"><i class="fa-solid fa-pen-to-square"></i> <span class="btn-text-full">Editar</span></button>`;

        if (isAttended) {
            itemClass = 'timeline-item timeline-item-attended';
            statusBadgeHtml = `<span class="badge-tag green" style="background: rgba(16, 185, 129, 0.15); color: #059669; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Atendida</span>`;
            actionAttendOrViewHtml = `<button class="btn btn-xs btn-outline" style="border-color: #10b981; color: #059669; font-weight: 600;" onclick="window.viewAttendedSessionForPatient('${app.patientId}')" title="Ver Evolución Clínica"><i class="fa-solid fa-file-medical"></i> <span class="btn-text-full">Ver Evolución</span></button>`;
        } else if (app.status === 'Confirmada') {
            statusBadgeHtml = `<button class="btn btn-xs btn-outline" style="border-color: #10b981; color: #059669; font-weight: 700; background: rgba(16, 185, 129, 0.12); border-radius: 12px; padding: 2px 8px; cursor: pointer;" onclick="window.toggleApptConfirmation('${app.id}')" title="Cita Confirmada (Clic para alternar)"><i class="fa-solid fa-check-double text-green"></i> Confirmada</button>`;
            if (!isAssistant) {
                actionAttendOrViewHtml = `<button class="btn btn-xs btn-primary btn-appt-attend" style="background-color: var(--primary-cyan) !important; color: white !important; border: none !important;" onclick="window.atenderAppointmentFromAgenda('${app.id}')" title="Atender esta cita ahora"><i class="fa-solid fa-user-doctor"></i> Atender</button>`;
            }
        } else {
            statusBadgeHtml = `<button class="btn btn-xs btn-outline" style="border-color: #cbd5e1; color: #475569; font-weight: 600; border-radius: 12px; padding: 2px 8px; cursor: pointer;" onclick="window.toggleApptConfirmation('${app.id}')" title="Marcar como Confirmada"><i class="fa-regular fa-circle-check text-cyan"></i> ${app.status || 'Programada'} <span style="font-size: 0.7rem; color: #0284c7;">(✓)</span></button>`;
            if (!isAssistant) {
                actionAttendOrViewHtml = `<button class="btn btn-xs btn-primary btn-appt-attend" style="background-color: var(--primary-cyan) !important; color: white !important; border: none !important;" onclick="window.atenderAppointmentFromAgenda('${app.id}')" title="Atender esta cita ahora"><i class="fa-solid fa-user-doctor"></i> Atender</button>`;
            }
        }

        const div = document.createElement('div');
        div.className = itemClass;
        div.style.marginBottom = '12px';
        div.innerHTML = `
            <div class="timeline-meta">
                <div class="timeline-time-status">
                    <span class="timeline-time"><i class="fa-solid fa-clock text-cyan"></i> ${app.time}</span>
                    ${statusBadgeHtml}
                </div>
                <div class="timeline-actions">
                    ${whatsappBtnHtml}
                    ${abonoBtn}
                    ${gCalBtn}
                    ${editApptBtn}
                    ${actionAttendOrViewHtml}
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
            await window.openNewAppointmentModal();
        };
    }
}
window.renderAgendaView = renderAgendaView;

window.toggleApptConfirmation = async function(apptId) {
    try {
        const appts = await SupabaseDataService.getAppointments();
        const appt = appts.find(a => a.id === apptId);
        if (!appt) return;

        const newStatus = appt.status === 'Confirmada' ? 'Programada' : 'Confirmada';
        appt.status = newStatus;
        await SupabaseDataService.updateAppointment(apptId, { status: newStatus });
        
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: newStatus === 'Confirmada' ? `Cita de ${appt.patientName} marcada como Confirmada ✓` : `Cita marcada como Programada`,
            showConfirmButton: false,
            timer: 2000
        });

        await renderAgendaView();
    } catch(err) {
        console.error("Error toggling appointment confirmation:", err);
    }
};

window.viewAttendedSessionForPatient = async function(patientId) {
    try {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la ficha del paciente.' });
            return;
        }
        setActivePatientId(patient.id);
        await window.navigateToTab('ehr');
    } catch(e) {
        console.error("Error viewing attended patient:", e);
    }
};

window.openAppointmentModalForPatient = async function(patientId, sessionNum, treatmentName) {
    try {
        await window.openNewAppointmentModal();
        const sel = document.getElementById('appt-patient-select');
        if (sel) {
            sel.value = patientId;
            sel.dispatchEvent(new Event('change'));
        }
        const trtInput = document.getElementById('appt-treatment');
        if (trtInput && treatmentName) {
            trtInput.value = `Sesión #${sessionNum}: ${treatmentName}`;
        }
    } catch(e) {
        console.error("Error opening appointment modal for patient:", e);
    }
};

window.openSessionModalForPatient = async function(patientId, sessionNum, procedureName) {
    try {
        setActivePatientId(patientId);
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró el paciente.' });
            return;
        }

        const numInput = document.getElementById('s-num');
        if (numInput) numInput.value = sessionNum;
        
        document.getElementById('s-datetime').value = new Date().toISOString().slice(0, 16);
        document.getElementById('s-procedure').value = procedureName || `Sesión N° ${sessionNum}`;
        document.getElementById('s-next-notes').value = '';

        // Populate planned treatments selector
        const trtSelect = document.getElementById('s-planned-treatment-select');
        if (trtSelect) {
            trtSelect.innerHTML = '<option value="">-- Personalizado / Escribir manualmente --</option>';
            const trts = (patient.metadata && patient.metadata.treatments) || [];
            trts.forEach((t, idx) => {
                const opt = document.createElement('option');
                const tNum = t.sessionNum || (idx + 1);
                opt.value = tNum;
                opt.dataset.name = t.name;
                opt.dataset.tooth = t.tooth || 'Gnl';
                opt.innerText = `Sesión ${tNum}: ${t.name} (Pieza ${t.tooth || 'Gnl'}) - ${t.status || 'Planificado'}`;
                if (parseInt(tNum) === parseInt(sessionNum)) {
                    opt.selected = true;
                }
                trtSelect.appendChild(opt);
            });

            trtSelect.onchange = () => {
                const chosenNum = trtSelect.value;
                if (chosenNum) {
                    if (numInput) numInput.value = chosenNum;
                    const selOpt = trtSelect.options[trtSelect.selectedIndex];
                    const procName = selOpt ? selOpt.dataset.name : '';
                    const toothName = selOpt ? selOpt.dataset.tooth : '';
                    document.getElementById('s-procedure').value = `${procName} (Pieza ${toothName})`;
                }
            };
        }

        const inventory = await SupabaseDataService.getInventory();
        const container = document.getElementById('session-materials-container');
        renderSessionMaterialsList(inventory, container);

        window.sessionSigPad = setupSignaturePad('session-signature-canvas', 'btn-clear-session-signature');
        openModal('modal-session');
    } catch(e) {
        console.error("Error opening session modal for patient:", e);
    }
};

window.openPaymentModalForAppointment = async function(patientId, patientName, treatment) {
    try {
        setActivePatientId(patientId);
        const modal = document.getElementById('modal-payment');
        if (modal) {
            const conceptInput = document.getElementById('pay-concept');
            if (conceptInput) {
                conceptInput.value = `Abono cita: ${treatment || 'Tratamiento Odontológico'}`;
            }
            const totalUsdInput = document.getElementById('pay-total-usd');
            if (totalUsdInput) totalUsdInput.value = '50.00';
            const paidUsdInput = document.getElementById('pay-paid-usd');
            if (paidUsdInput) paidUsdInput.value = '50.00';
            const dateInput = document.getElementById('pay-date');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

            openModal('modal-payment');
        }
    } catch(e) {
        console.error("Error opening payment modal for appointment:", e);
    }
};

window.atenderAppointmentFromAgenda = async (apptId) => {
    try {
        const appts = await SupabaseDataService.getAppointments();
        const app = appts.find(a => a.id === apptId);
        if (!app) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la cita seleccionada.' });
            return;
        }

        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === app.patientId);
        if (!patient) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la ficha del paciente asociado a esta cita.' });
            return;
        }

        // Set state
        window.activeAttendingAppointmentId = apptId;
        setActivePatientId(patient.id);

        // Pre-fill session modal
        const completed = patient.sessions ? patient.sessions.length : 0;
        document.getElementById('s-num').value = completed + 1;
        document.getElementById('s-datetime').value = new Date().toISOString().slice(0, 16);
        document.getElementById('s-procedure').value = app.treatment || '';
        document.getElementById('s-next-notes').value = '';

        // Load inventory materials
        const inventory = await SupabaseDataService.getInventory();
        const container = document.getElementById('session-materials-container');
        renderSessionMaterialsList(inventory, container);

        // Init signature
        window.sessionSigPad = setupSignaturePad('session-signature-canvas', 'btn-clear-session-signature');
        openModal('modal-session');

    } catch (err) {
        console.error("Error at opening attendance modal:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo iniciar el proceso de atención.' });
    }
};

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

function parsePortions(unitStr) {
    if (!unitStr) return null;
    const match = unitStr.match(/\((\d+)\s*porciones\)/i);
    if (match) return parseInt(match[1]);
    const matchSimple = unitStr.match(/\((\d+)\)/);
    if (matchSimple) return parseInt(matchSimple[1]);
    return null;
}

function renderSessionMaterialsList(inventory, container) {
    if (!container) return;
    container.innerHTML = '';
    
    inventory.forEach(item => {
        const portionsPerUnit = parsePortions(item.unit);
        let stockDesc = `${item.currentStock} ${item.unit}`;
        let maxQty = item.currentStock;
        let qtyLabel = 'U.';

        if (portionsPerUnit) {
            const units = Math.floor(item.currentStock);
            const portions = Math.round((item.currentStock - units) * portionsPerUnit);
            const baseUnit = item.unit.replace(/\s*\(\d+\s*porciones\)/i, '').trim();
            stockDesc = `${units} ${baseUnit} y ${portions} porc.`;
            maxQty = Math.round(item.currentStock * portionsPerUnit);
            qtyLabel = 'porc.';
        }

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '4px 0';
        row.style.borderBottom = '1px dashed var(--border-color)';
        row.innerHTML = `
            <label style="font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; color: var(--text-main); margin:0;">
                <input type="checkbox" class="session-mat-checkbox" data-code="${item.code}">
                <span>${item.name} <small class="text-muted">(${stockDesc})</small></span>
            </label>
            <div style="display:flex; align-items:center; gap:4px;">
                <input type="number" class="session-mat-qty form-control" data-code="${item.code}" min="1" max="${maxQty}" value="1" style="width:60px; padding:2px; font-size:0.8rem; border:1px solid var(--border-color); background:var(--bg-main); color:var(--text-main);" disabled>
                <span style="font-size:0.75rem; color:var(--text-muted);">${qtyLabel}</span>
            </div>
        `;
        const chk = row.querySelector('.session-mat-checkbox');
        const qtyIn = row.querySelector('.session-mat-qty');
        chk.onchange = () => {
            qtyIn.disabled = !chk.checked;
        };
        container.appendChild(row);
    });
}

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

        // Parse portions if fraccionado
        let stockDisplay = `${item.currentStock} ${item.unit}`;
        let minStockDisplay = `${item.minStock} ${item.unit}`;
        
        const portionsPerUnit = parsePortions(item.unit);
        if (portionsPerUnit) {
            const units = Math.floor(item.currentStock);
            const portions = Math.round((item.currentStock - units) * portionsPerUnit);
            const baseUnit = item.unit.replace(/\s*\(\d+\s*porciones\)/i, '').trim();
            stockDisplay = `<strong>${units}</strong> ${baseUnit} y <strong>${portions}</strong> / ${portionsPerUnit} porc.`;
            minStockDisplay = `${item.minStock} ${baseUnit}`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.code}</strong></td>
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>${stockDisplay}</td>
            <td>${minStockDisplay}</td>
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
    window.checkGlobalStockAlerts();
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

window.checkGlobalStockAlerts = async function() {
    let items = [];
    if (window.kardex && window.kardex.getAllItems().length > 0) {
        items = window.kardex.getAllItems();
    } else {
        items = await SupabaseDataService.getInventory();
    }
    const criticalItems = items.filter(i => (i.currentStock !== undefined && i.currentStock < 5) || i.currentStock <= (i.minStock || 5));
    
    const badge = document.getElementById('nav-stock-alert-badge');
    if (badge) {
        if (criticalItems.length > 0) {
            badge.innerText = criticalItems.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const alertBox = document.getElementById('dashboard-stock-alerts');
    if (alertBox) {
        alertBox.innerHTML = '';
        if (criticalItems.length > 0) {
            let itemsHtml = criticalItems.map(a => `
                <div style="padding: 8px 12px; border-radius: 6px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); margin-bottom: 8px; font-size: 0.82rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                    <div>
                        <strong style="color: #b91c1c;">${a.name}:</strong> ${a.currentStock} ${a.unit || 'U'} restantes (Mín: ${a.minStock || 5})
                    </div>
                    <span class="badge-tag red" style="font-size: 0.7rem; font-weight: 700;">Stock Crítico</span>
                </div>
            `).join('');

            alertBox.innerHTML = `
                <div style="margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <span style="font-size: 0.85rem; font-weight: 700; color: #dc2626;"><i class="fa-solid fa-triangle-exclamation"></i> ${criticalItems.length} insumos con stock crítico (< 5)</span>
                    <button class="btn btn-xs btn-outline" style="border-color: #0891b2; color: #0891b2; font-weight: 600;" onclick="window.copyStockReorderList()"><i class="fa-solid fa-clipboard-list"></i> Copiar Lista de Reposición</button>
                </div>
                ${itemsHtml}
            `;
        } else {
            alertBox.innerHTML = `<span class="text-muted" style="font-size: 0.85rem;"><i class="fa-solid fa-circle-check text-green"></i> Todos los insumos cuentan con stock adecuado.</span>`;
        }
    }
};

window.copyStockReorderList = function() {
    if (!window.kardex) return;
    const items = window.kardex.getAllItems();
    const criticalItems = items.filter(i => (i.currentStock !== undefined && i.currentStock < 5) || i.currentStock <= (i.minStock || 5));
    if (criticalItems.length === 0) {
        Swal.fire({ icon: 'info', title: 'Inventario Completo', text: 'No hay insumos que requieran reposición en este momento.' });
        return;
    }

    let text = `📋 ORDEN DE REPOSICIÓN DE INSUMOS - DENTALCARE PRO\nFecha: ${new Date().toLocaleDateString('es-ES')}\n\n`;
    criticalItems.forEach((it, idx) => {
        const needed = Math.max(10, (it.minStock || 5) * 2 - it.currentStock);
        text += `${idx + 1}. ${it.name} (${it.code || 'N/A'})\n   - Stock Actual: ${it.currentStock} ${it.unit || 'U'}\n   - Cantidad a Solicitar: ${needed} ${it.unit || 'U'}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({
            icon: 'success',
            title: '¡Lista Copiada al Portapapeles!',
            text: 'Puedes pegarla en WhatsApp, correo o enviarla directamente a tu proveedor de insumos.',
            timer: 2500,
            showConfirmButton: false
        });
    }).catch(() => {
        Swal.fire({ title: 'Lista de Reposición', html: `<pre style="text-align:left; font-size:0.8rem;">${text}</pre>` });
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
            if (window.closeMobileSidebar) {
                window.closeMobileSidebar();
            } else {
                const sb = document.querySelector('.sidebar');
                const bd = document.getElementById('mobile-sidebar-backdrop');
                if (sb) sb.classList.remove('mobile-open');
                if (bd) bd.classList.add('hidden');
            }

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

    async function processSaveSession(sendWhatsApp = false) {
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

        // Extract payment info
        const paymentUSD = parseFloat(document.getElementById('s-payment-amount').value) || 0;
        const paymentMethod = document.getElementById('s-payment-method').value || 'cash';
        const paymentBank = document.getElementById('s-payment-bank') ? document.getElementById('s-payment-bank').value.trim() : '';
        const paymentReference = document.getElementById('s-payment-reference') ? document.getElementById('s-payment-reference').value.trim() : '';
        let splitPayments = null;
        let paymentMethodLabel = getPaymentMethodLabel(paymentMethod);

        if (paymentMethod === 'split') {
            splitPayments = {};
            document.querySelectorAll('.s-split-input').forEach(inp => {
                const methodKey = inp.dataset.method;
                const val = parseFloat(inp.value) || 0;
                if (val > 0) splitPayments[methodKey] = val;
            });
            paymentMethodLabel = 'Pago Mixto';
        }

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
                materials: [],
                paymentUSD,
                paymentMethod,
                paymentMethodLabel,
                paymentBank: paymentBank || (paymentMethod === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                paymentReference: paymentReference || 'N/A',
                splitPayments
            };

            // Deduct materials from stock
            const inventory = await SupabaseDataService.getInventory();
            for (const m of materials) {
                const item = inventory.find(inv => inv.code === m.code);
                if (item) {
                    const portionsPerUnit = parsePortions(item.unit);
                    const qtyToDeduct = portionsPerUnit ? (m.qty / portionsPerUnit) : m.qty;
                    const newStock = Math.max(0, item.currentStock - qtyToDeduct);
                    item.currentStock = newStock;
                    
                    // Update stock locally and in cloud
                    await SupabaseDataService.saveInventoryItem(item);
                    
                    sessionObj.materials.push({
                        code: m.code,
                        name: item.name,
                        qty: m.qty,
                        unit: portionsPerUnit ? 'porciones' : item.unit
                    });
                }
            }

            // Check if sessionNum already exists to replace or append
            const existingIdx = (patient.sessions || []).findIndex(s => s.sessionNum === sessionNum);
            if (existingIdx >= 0) {
                patient.sessions[existingIdx] = sessionObj;
            } else {
                patient.sessions.push(sessionObj);
            }

            // Update treatments plan in metadata & Odontogram
            if (patient.metadata && patient.metadata.treatments && patient.metadata.treatments.length > 0) {
                const trt = patient.metadata.treatments.find(t => t.sessionNum === sessionNum) || patient.metadata.treatments[sessionNum - 1];
                if (trt) {
                    trt.status = 'Completado';
                    trt.completedDate = datetime;
                    
                    if (trt.tooth && trt.tooth !== 'Gnl' && !isNaN(parseInt(trt.tooth))) {
                        if (!patient.odontogramData) patient.odontogramData = {};
                        const toothNum = parseInt(trt.tooth);
                        const faceKey = trt.face ? `${toothNum}-${trt.face}` : `${toothNum}-center`;
                        patient.odontogramData[faceKey] = 'restoration';
                    }
                }
            }

            // Registrar fecha de actualización del odontodiagrama
            if (!patient.metadata) patient.metadata = {};
            patient.metadata.odontogramLastUpdated = datetime || new Date().toISOString().replace('T', ' ').substring(0, 16);

            // Record payment in patient payments history if any
            if (paymentUSD > 0) {
                if (!patient.payments) patient.payments = [];
                patient.payments.unshift({
                    id: 'pay-' + Date.now(),
                    date: datetime.split(' ')[0] || new Date().toISOString().split('T')[0],
                    concept: `Abono en Sesión #${sessionNum} (${procedure.substring(0, 35)}...)`,
                    totalUSD: paymentUSD,
                    paidUSD: paymentUSD,
                    balanceUSD: 0.00,
                    status: 'Pagado',
                    method: paymentMethod,
                    bank: paymentBank || (paymentMethod === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                    reference: paymentReference || 'N/A',
                    splitPayments
                });
            }

            await SupabaseDataService.savePatient(patient);

            let apptUpdated = false;
            if (window.activeAttendingAppointmentId) {
                try {
                    const appts = await SupabaseDataService.getAppointments();
                    const appt = appts.find(a => a.id === window.activeAttendingAppointmentId);
                    if (appt) {
                        appt.status = 'Completada';
                        await SupabaseDataService.saveAppointment(appt);
                        apptUpdated = true;
                    }
                } catch(e) {
                    console.error("Error updating appointment status:", e);
                }
            }

            closeModal('modal-session');
            await renderEHRView();
            await renderInventoryTable();
            await renderDashboard();
            await renderCashFlow();
            if (apptUpdated) {
                await renderAgendaView();
            }

            // Launch WhatsApp if requested
            if (sendWhatsApp && patient.phone) {
                const receiptUrl = `${window.location.origin}/?patientId=${patient.id}&view=receipt&sessionNum=${sessionNum}`;
                const msg = WhatsAppService.generateSessionReceiptMessage(patient, sessionObj, receiptUrl);
                WhatsAppService.sendToPatient(patient.phone, msg);
            }

            // Show success alert with Receipt print/download/WhatsApp options
            Swal.fire({
                icon: 'success',
                title: 'Sesión Registrada',
                text: 'La evolución de la sesión y firma de conformidad fueron guardadas exitosamente.',
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: '<i class="fa-brands fa-whatsapp text-green"></i> Enviar WhatsApp',
                denyButtonText: '<i class="fa-solid fa-file-pdf"></i> Descargar PDF',
                cancelButtonText: 'Cerrar',
                confirmButtonColor: '#10b981',
                denyButtonColor: '#0284c7',
                cancelButtonColor: '#64748b'
            }).then((result) => {
                if (result.isConfirmed) {
                    const receiptUrl = `${window.location.origin}/?patientId=${patient.id}&view=receipt&sessionNum=${sessionNum}`;
                    const msg = WhatsAppService.generateSessionReceiptMessage(patient, sessionObj, receiptUrl);
                    WhatsAppService.sendToPatient(patient.phone, msg);
                } else if (result.isDenied) {
                    window.downloadSessionReceiptPDF(patient, sessionObj);
                }

                // Prompt to schedule next session if attended from Agenda
                if (window.activeAttendingAppointmentId) {
                    window.activeAttendingAppointmentId = null;

                        setTimeout(() => {
                            Swal.fire({
                                title: '¿Programar Próxima Sesión?',
                                text: `La sesión ${sessionNum} ha sido completada. ¿Desea programar la siguiente sesión para ${patient.fullname} ahora?`,
                                icon: 'question',
                                showCancelButton: true,
                                confirmButtonText: 'Sí, agendar',
                                cancelButtonText: 'No, después',
                                confirmButtonColor: 'var(--primary-cyan)',
                                cancelButtonColor: '#64748b'
                            }).then((res) => {
                                if (res.isConfirmed) {
                                    if (window.openAppointmentModalForNextSession) {
                                        window.openAppointmentModalForNextSession(patient.id, sessionNum + 1);
                                    }
                                }
                            });
                        }, 600);
                    }
                });
        } catch(err) {
            console.error("Error saving patient session:", err);
            Swal.fire({ icon: 'error', title: 'Error al Guardar', text: err.message || err });
        }
    }

    const saveSessionBtn = document.getElementById('btn-save-session');
    if (saveSessionBtn) {
        saveSessionBtn.onclick = (e) => {
            e.preventDefault();
            processSaveSession(false);
        };
    }

    const saveSendSessionWhatsAppBtn = document.getElementById('btn-save-send-session-whatsapp');
    if (saveSendSessionWhatsAppBtn) {
        saveSendSessionWhatsAppBtn.onclick = (e) => {
            e.preventDefault();
            processSaveSession(true);
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

            const toothNum = parseInt(toothVal);
            let itemKey = 'custom-' + Date.now();
            let faceVal = 'Gnl';

            if (!isNaN(toothNum) && toothNum > 0) {
                itemKey = `${toothNum}-center`;
                faceVal = 'center';
                
                // Color center face (Oclusal) as Lesión (patology) on odontogram
                if (window.odontogram) {
                    window.odontogram.toothData[itemKey] = 'patology';
                    window.odontogram.render();
                }
            }

            currentBudgetItems.push({
                key: itemKey,
                tooth: toothVal,
                face: faceVal,
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
            const method = document.getElementById('pay-method') ? document.getElementById('pay-method').value : 'pagomovil';
            const bank = document.getElementById('pay-bank') ? document.getElementById('pay-bank').value.trim() : '';
            const reference = document.getElementById('pay-reference') ? document.getElementById('pay-reference').value.trim() : '';

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
                    id: 'pay-' + Date.now(),
                    date,
                    concept,
                    totalUSD,
                    paidUSD,
                    balanceUSD,
                    status,
                    method,
                    bank: bank || (method === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                    reference: reference || 'N/A'
                });

                await SupabaseDataService.savePatient(p);
                closeModal('modal-payment');
                await renderEHRView();
                await renderDashboard();
                await renderCashFlow();
                await renderAgendaView();
                Swal.fire({ 
                    icon: 'success', 
                    title: '¡Abono Registrado!', 
                    html: `Abono de <strong>$${paidUSD.toFixed(2)}</strong> registrado exitosamente a <strong>${p.fullname}</strong>.<br><small style="color:#64748b;">Banco: ${bank || 'Efectivo'} | Ref: ${reference || 'N/A'}</small>`, 
                    timer: 2500, 
                    showConfirmButton: false 
                });
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
        currencyBtn.onclick = async () => {
            const current = localStorage.getItem('dental_exchange_currency') || 'USD';
            const next = current === 'USD' ? 'EUR' : 'USD';
            localStorage.setItem('dental_exchange_currency', next);
            await fetchLiveExchangeRate();
            await renderDashboard();
            
            const symbol = next === 'EUR' ? '€ (Euros)' : '$ (Dólares)';
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'info',
                title: `Tasa cambiada a ${symbol}`
            });
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
            let unit = document.getElementById('mat-unit').value.trim() || 'Unidades';
            const stock = parseInt(document.getElementById('mat-stock').value) || 0;
            const minStock = parseInt(document.getElementById('mat-min-stock').value) || 5;
            const expiryDate = document.getElementById('mat-expiry').value;

            // Handle portions unit encoding
            const hasPortionsChk = document.getElementById('mat-has-portions');
            if (hasPortionsChk && hasPortionsChk.checked) {
                const portionsPerUnit = parseInt(document.getElementById('mat-portions-per-unit').value) || 30;
                unit = `${unit} (${portionsPerUnit} porciones)`;
            }

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

    // Day Target selector toggle custom date
    const dayTargetSelect = document.getElementById('app-day-target');
    const customDateGroup = document.getElementById('app-custom-date-group');
    if (dayTargetSelect && customDateGroup) {
        dayTargetSelect.onchange = () => {
            if (dayTargetSelect.value === 'custom') {
                customDateGroup.classList.remove('hidden');
                const customDateInput = document.getElementById('app-custom-date');
                if (customDateInput && !customDateInput.value) {
                    customDateInput.value = new Date().toISOString().split('T')[0];
                }
            } else {
                customDateGroup.classList.add('hidden');
            }
        };
    }

    // Modal Cita Helpers: New & Edit
    window.openNewAppointmentModal = async function() {
        await populateAppointmentPatientSelect();

        const titleEl = document.getElementById('modal-appointment-title');
        if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-calendar-plus text-cyan"></i> Agendar Nueva Cita Médica';

        const saveBtn = document.getElementById('btn-save-appointment');
        if (saveBtn) saveBtn.textContent = 'Guardar Cita';

        const appIdInput = document.getElementById('app-id');
        if (appIdInput) appIdInput.value = '';

        const timeInput = document.getElementById('app-time');
        if (timeInput) timeInput.value = '';

        const treatmentInput = document.getElementById('app-treatment');
        if (treatmentInput) treatmentInput.value = '';

        const statusSelect = document.getElementById('app-status');
        if (statusSelect) statusSelect.value = 'Programada';

        const daySel = document.getElementById('app-day-target');
        const customGrp = document.getElementById('app-custom-date-group');
        if (daySel) daySel.value = 'today';
        if (customGrp) customGrp.classList.add('hidden');

        openModal('modal-appointment');
    };

    window.editAppointment = async function(apptId) {
        try {
            const appts = await SupabaseDataService.getAppointments();
            const app = appts.find(a => a.id === apptId);
            if (!app) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la información de la cita seleccionada.' });
                return;
            }

            await populateAppointmentPatientSelect();

            const titleEl = document.getElementById('modal-appointment-title');
            if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square text-cyan"></i> Editar Cita Médica';

            const saveBtn = document.getElementById('btn-save-appointment');
            if (saveBtn) saveBtn.textContent = 'Actualizar Cita';

            const appIdInput = document.getElementById('app-id');
            if (appIdInput) appIdInput.value = app.id;

            const pSelect = document.getElementById('app-patient-select');
            if (pSelect) pSelect.value = app.patientId;

            const timeInput = document.getElementById('app-time');
            if (timeInput) timeInput.value = app.time || '';

            const treatmentInput = document.getElementById('app-treatment');
            if (treatmentInput) treatmentInput.value = app.treatment || '';

            const statusSelect = document.getElementById('app-status');
            if (statusSelect) statusSelect.value = app.status || 'Programada';

            const daySel = document.getElementById('app-day-target');
            const customGrp = document.getElementById('app-custom-date-group');
            const customDateInput = document.getElementById('app-custom-date');

            if (daySel) {
                if (app.date === 'today' || app.date === 'today-appt' || app.isTomorrow === false) {
                    daySel.value = 'today';
                    if (customGrp) customGrp.classList.add('hidden');
                } else if (app.date === 'tomorrow' || app.isTomorrow === true) {
                    daySel.value = 'tomorrow';
                    if (customGrp) customGrp.classList.add('hidden');
                } else if (app.date && app.date.includes('-')) {
                    daySel.value = 'custom';
                    if (customGrp) customGrp.classList.remove('hidden');
                    if (customDateInput) customDateInput.value = app.date;
                } else {
                    daySel.value = 'today';
                    if (customGrp) customGrp.classList.add('hidden');
                }
            }

            openModal('modal-appointment');
        } catch(e) {
            console.error("Error editing appointment:", e);
            Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo abrir el editor de la cita.' });
        }
    };

    // Modal Cita Trigger Listener
    const btnAddAppt = document.getElementById('btn-add-appointment');
    if (btnAddAppt) {
        btnAddAppt.onclick = async () => {
            await window.openNewAppointmentModal();
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
            const customDate = document.getElementById('app-custom-date') ? document.getElementById('app-custom-date').value : '';
            const treatment = document.getElementById('app-treatment').value.trim();
            const statusVal = document.getElementById('app-status') ? document.getElementById('app-status').value : 'Programada';
            const existingId = document.getElementById('app-id') ? document.getElementById('app-id').value : '';

            if (!patientSelect || !time || !treatment) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const selectedOption = patientSelect.options[patientSelect.selectedIndex];
            const patientName = selectedOption ? selectedOption.dataset.name : '';
            const patientId = selectedOption ? selectedOption.value : '';

            const finalDate = (dayTarget === 'custom' && customDate) ? customDate : (dayTarget === 'tomorrow' ? 'tomorrow' : 'today');
            const isTomorrow = dayTarget === 'tomorrow';

            const appointmentObj = {
                id: existingId || ('appt-' + Date.now()),
                time,
                patientName,
                patientId,
                treatment,
                status: statusVal,
                isTomorrow: isTomorrow,
                date: finalDate
            };

            await SupabaseDataService.saveAppointment(appointmentObj);

            closeModal('modal-appointment');
            await renderDashboard();
            await renderAgendaView();

            if (existingId) {
                Swal.fire({
                    icon: 'success',
                    title: '¡Cita Actualizada!',
                    text: 'Los cambios de la cita han sido guardados.',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
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
            }
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

    window.openBudgetForNewPatient = async function(patientId) {
        setActivePatientId(patientId);
        activeEditingBudgetId = null;
        currentBudgetItems = [];

        const navOdontogram = document.querySelector('.nav-item[data-tab="odontogram"]') || document.getElementById('mob-nav-odontogram');
        if (navOdontogram) navOdontogram.click();

        const listContainer = document.getElementById('odontogram-list-container');
        const editorContainer = document.getElementById('odontogram-editor-container');
        if (listContainer) listContainer.classList.add('hidden');
        if (editorContainer) editorContainer.classList.remove('hidden');

        await renderOdontogramView();

        const notesEl = document.getElementById('budget-notes');
        if (notesEl) notesEl.value = '';
        const discEl = document.getElementById('budget-discount-input');
        if (discEl) discEl.value = '0';

        if (window.doctorSigPad) {
            window.doctorSigPad.clear();
            autoLoadDoctorSignatureInBudget();
        }
        if (window.patientSigPad) window.patientSigPad.clear();

        renderBudgetTable();
    };

    window.savePatientRecord = async function(redirectToBudget = false) {
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
            Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios del Paso 1 (*)' });
            if (typeof window.setPatientStepperStep === 'function') window.setPatientStepperStep(1);
            return false;
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
        const bItems = window.currentPlannerBudgetItems || (currentBudgetItems && currentBudgetItems.length > 0 ? currentBudgetItems : (window.currentBudgetItems || []));
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
                }).filter(Boolean);
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
            const patients = await SupabaseDataService.getPatients();
            const existing = patients.find(p => p.id === id || (window.editingPatientId && p.id === window.editingPatientId));

            if (existing) {
                // MODO EDICIÓN: Actualizar todos los datos clínicos y personales preservando historial
                patientToSave = {
                    ...existing,
                    id: existing.id,
                    fullname,
                    birthdate,
                    phone,
                    email: getVal('p-email'),
                    occupation: profession,
                    address: address,
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
                        sessionsPlan: (sessionsData && sessionsData.length > 0) ? sessionsData : (existing.metadata && existing.metadata.sessionsPlan)
                    }
                };
            } else {
                // MODO NUEVO PACIENTE: Guardar ficha integral con todos los datos de pasos 1, 2, 3 y 4
                patientToSave = {
                    id,
                    fullname,
                    birthdate,
                    phone,
                    email: getVal('p-email'),
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
                        habitIntensity,
                        initTreatmentName: getVal('p-init-treatment-name'),
                        initTreatmentSessions: getVal('p-init-treatment-sessions'),
                        initTreatmentInterval: getVal('p-init-treatment-interval'),
                        sessionsPlan: sessionsData
                    }
                };
            }

            await SupabaseDataService.savePatient(patientToSave);
            window.editingPatientId = null;
            
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
            await renderEHRView();
            await renderDashboard();
            await renderAgendaView();

            if (redirectToBudget) {
                await window.openBudgetForNewPatient(id);
                Swal.fire({
                    icon: 'success',
                    title: '¡Paciente Guardado!',
                    text: `Ficha de ${fullname} creada. Redirigiendo a elaboración de presupuesto...`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                Swal.fire({
                    icon: 'success',
                    title: '¡Paciente Guardado!',
                    text: `${fullname} ha sido guardado exitosamente en la nube de Supabase.`,
                    timer: 2000,
                    showConfirmButton: false
                });
            }
            return true;
        } catch (err) {
            console.error("Error al guardar paciente:", err);
            Swal.fire({
                icon: 'error',
                title: 'Error de Servidor / Supabase',
                text: `No se pudo guardar el paciente. Detalle: ${err.message || err}`
            });
            return false;
        }
    };

    const savePatientBtn = document.getElementById('btn-save-patient');
    if (savePatientBtn) {
        savePatientBtn.onclick = async (e) => {
            e.preventDefault();
            await window.savePatientRecord(false);
        };
    }

    const savePatientBudgetBtn = document.getElementById('btn-patient-save-and-budget');
    if (savePatientBudgetBtn) {
        savePatientBudgetBtn.onclick = async (e) => {
            e.preventDefault();
            await window.savePatientRecord(true);
        };
    }

    const step3BudgetBtn = document.getElementById('btn-patient-step3-budget');
    if (step3BudgetBtn) {
        step3BudgetBtn.onclick = async (e) => {
            e.preventDefault();
            await window.savePatientRecord(true);
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
            let paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'pagomovil';
            let paymentMethodLabel = paymentMethodSelect ? paymentMethodSelect.options[paymentMethodSelect.selectedIndex].text : 'Pago Móvil';
            if (paymentMethod === 'split') {
                const pmAmt = parseFloat(document.getElementById('budget-split-pagomovil').value) || 0;
                const cashAmt = parseFloat(document.getElementById('budget-split-cash').value) || 0;
                const zelleAmt = parseFloat(document.getElementById('budget-split-zelle').value) || 0;
                const binanceAmt = parseFloat(document.getElementById('budget-split-binance').value) || 0;

                const parts = [];
                if (pmAmt > 0) parts.push(`Pago Móvil: $${pmAmt.toFixed(2)}`);
                if (cashAmt > 0) parts.push(`Efectivo: $${cashAmt.toFixed(2)}`);
                if (zelleAmt > 0) parts.push(`Zelle: $${zelleAmt.toFixed(2)}`);
                if (binanceAmt > 0) parts.push(`Binance: $${binanceAmt.toFixed(2)}`);

                paymentMethod = `Mixto (${parts.join(', ') || 'Sin distribución'})`;
                paymentMethodLabel = paymentMethod;
            }
            
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

                // Sync treatments and planned sessions to patient metadata
                if (!patient.metadata) patient.metadata = {};
                patient.metadata.treatments = currentBudgetItems.map((item, idx) => ({
                    id: 'trt-' + (idx + 1),
                    serviceCode: item.serviceCode || '',
                    name: item.name,
                    tooth: item.tooth || 'Gnl',
                    face: item.face || '',
                    price: item.price,
                    specialist: item.specialist || '',
                    status: 'Planificado',
                    sessionNum: item.sessionNum || (idx + 1)
                }));

                // Save odontogram data from current budget
                if (window.odontogram) {
                    patient.odontogramData = { ...(patient.odontogramData || {}), ...window.odontogram.getData() };
                }

                // Set treatment plan overview
                const treatmentTitle = currentBudgetItems.map(i => i.name).slice(0, 3).join(' + ') + (currentBudgetItems.length > 3 ? '...' : '');
                patient.metadata.initialTreatmentPlan = {
                    treatmentName: treatmentTitle || 'Tratamiento Odontológico Integral',
                    totalSessions: Math.max(currentBudgetItems.length, (patient.metadata.initialTreatmentPlan && patient.metadata.initialTreatmentPlan.totalSessions) || 1),
                    interval: 'Quincenal'
                };

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

                // Reset editor state to zero
                currentBudgetItems = [];
                activeEditingBudgetId = null;
                setActivePatientId(null);
                if (window.odontogram) {
                    window.odontogram.setData({});
                }
                document.getElementById('budget-notes').value = '';
                document.getElementById('budget-discount-input').value = '0';
                if (window.doctorSigPad) window.doctorSigPad.clear();
                if (window.patientSigPad) window.patientSigPad.clear();

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

            // Generate budgetId or use active editing one
            const budgetId = activeEditingBudgetId || `PRE-${Date.now().toString().slice(-6)}`;

            if (!activeEditingBudgetId) {
                // Auto save as Borrador so that the database has the record for the patient to view
                try {
                    const budgetObj = {
                        id: budgetId,
                        patientId: activeId,
                        invoiceDate: new Date().toISOString().split('T')[0],
                        paymentMethod: paymentMethodSelect.value,
                        paymentTerms: 'Contado',
                        currency: 'REF',
                        items: currentBudgetItems.map(item => ({
                            tooth: item.tooth,
                            face: item.face,
                            code: item.serviceCode,
                            name: item.name,
                            price: item.price,
                            specialist: item.specialist || ''
                        })),
                        totalRef: totalUSD,
                        totalBcv: totalUSD * getExchangeRate(),
                        status: 'Borrador',
                        footerText: notes,
                        metadata: {
                            consentText: consentText,
                            discountPct: discountPct
                        }
                    };
                    await SupabaseDataService.saveInvoice(budgetObj);
                    activeEditingBudgetId = budgetId;
                    await renderBudgetListView();
                } catch (saveErr) {
                    console.error("Error auto-saving budget before whatsapp:", saveErr);
                }
            }

            const msg = WhatsAppService.generateBudgetMessage(patient, currentBudgetItems, totalUSD, paymentModeText, notes, subtotalUSD, discountPct, paymentMethodLabel, budgetId);
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
            
            if (window.doctorSigPad) {
                window.doctorSigPad.clear();
                autoLoadDoctorSignatureInBudget();
            }
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

    const btnCloseFinancialDirect = document.getElementById('btn-close-financial-direct');
    if (btnCloseFinancialDirect) {
        btnCloseFinancialDirect.onclick = async () => {
            if (activeEditingBudgetId) {
                await window.closeBudgetFinanciallyDirect(activeEditingBudgetId);
                // Go back to the budget list view
                const listContainer = document.getElementById('odontogram-list-container');
                const editorContainer = document.getElementById('odontogram-editor-container');
                if (listContainer) listContainer.classList.remove('hidden');
                if (editorContainer) editorContainer.classList.add('hidden');
            } else {
                Swal.fire({
                    icon: 'info',
                    title: 'Presupuesto no guardado',
                    text: 'Por favor apruebe o guarde el presupuesto primero para asignarle un número de control.'
                });
            }
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
            let paymentMethod = paymentMethodSelect ? paymentMethodSelect.value : 'pagomovil';
            if (paymentMethod === 'split') {
                const pmAmt = parseFloat(document.getElementById('budget-split-pagomovil').value) || 0;
                const cashAmt = parseFloat(document.getElementById('budget-split-cash').value) || 0;
                const zelleAmt = parseFloat(document.getElementById('budget-split-zelle').value) || 0;
                const binanceAmt = parseFloat(document.getElementById('budget-split-binance').value) || 0;

                const parts = [];
                if (pmAmt > 0) parts.push(`Pago Móvil: $${pmAmt.toFixed(2)}`);
                if (cashAmt > 0) parts.push(`Efectivo: $${cashAmt.toFixed(2)}`);
                if (zelleAmt > 0) parts.push(`Zelle: $${zelleAmt.toFixed(2)}`);
                if (binanceAmt > 0) parts.push(`Binance: $${binanceAmt.toFixed(2)}`);

                paymentMethod = `Mixto (${parts.join(', ') || 'Sin distribución'})`;
            }
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
                
                // Reset editor state to zero
                currentBudgetItems = [];
                activeEditingBudgetId = null;
                setActivePatientId(null);
                if (window.odontogram) {
                    window.odontogram.setData({});
                }
                document.getElementById('budget-notes').value = '';
                document.getElementById('budget-discount-input').value = '0';
                if (window.doctorSigPad) window.doctorSigPad.clear();
                if (window.patientSigPad) window.patientSigPad.clear();

                await renderBudgetListView();
                
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

            const paymentBank = document.getElementById('note-payment-bank') ? document.getElementById('note-payment-bank').value.trim() : '';
            const paymentReference = document.getElementById('note-payment-reference') ? document.getElementById('note-payment-reference').value.trim() : '';

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
                    paymentUSD,
                    paymentMethod,
                    paymentBank: paymentBank || (paymentMethod === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                    paymentReference: paymentReference || 'N/A'
                });

                if (paymentUSD > 0) {
                    if (!p.payments) p.payments = [];
                    p.payments.unshift({
                        id: 'pay-' + Date.now(),
                        date: datetime.split('T')[0],
                        concept: 'Abono en Cita Clínica',
                        totalUSD: paymentUSD,
                        paidUSD: paymentUSD,
                        balanceUSD: 0.00,
                        status: 'Pagado',
                        method: paymentMethod,
                        bank: paymentBank || (paymentMethod === 'cash' ? 'Efectivo en Mano' : 'No especificado'),
                        reference: paymentReference || 'N/A'
                    });
                }

                await SupabaseDataService.savePatient(p);
                closeModal('modal-note');
                await renderEHRView();
                Swal.fire({ icon: 'success', title: '¡Evolución Registrada!', text: 'Guardada en la nube de Supabase.', timer: 2000, showConfirmButton: false });
            }
        };
    }
    initSplitPaymentHandlers();

    // Attended patients modal event setup
    const cardAttended = document.getElementById('card-attended-patients');
    if (cardAttended) {
        cardAttended.onclick = () => {
            const todayStr = new Date().toLocaleDateString('en-CA');
            const dateInput = document.getElementById('attended-filter-date');
            if (dateInput) {
                dateInput.value = todayStr;
            }
            renderAttendedPatientsModal(todayStr);
            openModal('modal-attended-details');
        };
    }

    const dateFilter = document.getElementById('attended-filter-date');
    if (dateFilter) {
        dateFilter.onchange = (e) => {
            renderAttendedPatientsModal(e.target.value);
        };
    }

    // Fractional inventory checkbox toggle
    const hasPortionsChk = document.getElementById('mat-has-portions');
    const portionsCont = document.getElementById('mat-portions-container');
    if (hasPortionsChk && portionsCont) {
        hasPortionsChk.onchange = (e) => {
            if (e.target.checked) {
                portionsCont.classList.remove('hidden');
            } else {
                portionsCont.classList.add('hidden');
            }
        };
    }

    // Account Transfers (Traslados entre cuentas)
    const btnOpenTransfer = document.getElementById('btn-open-transfer-modal');
    if (btnOpenTransfer) {
        btnOpenTransfer.onclick = () => {
            const todayStr = new Date().toISOString().split('T')[0];
            const dateInp = document.getElementById('transfer-date');
            if (dateInp) dateInp.value = todayStr;
            openModal('modal-account-transfer');
        };
    }

    const btnSaveTransfer = document.getElementById('btn-save-account-transfer');
    if (btnSaveTransfer) {
        btnSaveTransfer.onclick = async (e) => {
            e.preventDefault();
            const fromAccount = document.getElementById('transfer-from').value;
            const toAccount = document.getElementById('transfer-to').value;
            const amountSent = parseFloat(document.getElementById('transfer-amount-sent').value) || 0;
            const amountReceived = parseFloat(document.getElementById('transfer-amount-received').value) || amountSent;
            const date = document.getElementById('transfer-date').value || new Date().toISOString().split('T')[0];
            const notes = document.getElementById('transfer-notes').value.trim();

            if (fromAccount === toAccount) {
                Swal.fire({ icon: 'warning', title: 'Cuentas Iguales', text: 'La cuenta origen y destino deben ser distintas.' });
                return;
            }
            if (amountSent <= 0 || amountReceived <= 0) {
                Swal.fire({ icon: 'warning', title: 'Monto Inválido', text: 'Ingrese un monto mayor a 0.' });
                return;
            }

            const transferObj = {
                id: 'TRANS-' + Date.now(),
                date,
                fromAccount,
                toAccount,
                amountSent,
                amountReceived,
                notes
            };

            let transfers = JSON.parse(localStorage.getItem('dental_account_transfers')) || [];
            transfers.unshift(transferObj);
            localStorage.setItem('dental_account_transfers', JSON.stringify(transfers));

            closeModal('modal-account-transfer');
            await renderCashFlow();
            Swal.fire({
                icon: 'success',
                title: '¡Traslado Registrado!',
                text: `Se trasladaron $${amountSent.toFixed(2)} de ${getPaymentMethodLabel(fromAccount)} a ${getPaymentMethodLabel(toAccount)}.`,
                timer: 2000,
                showConfirmButton: false
            });
        };
    }

    // Auto-update amount sent to amount received when typing in transfer modal
    const sentInput = document.getElementById('transfer-amount-sent');
    const recvInput = document.getElementById('transfer-amount-received');
    if (sentInput && recvInput) {
        sentInput.oninput = (e) => {
            if (!recvInput.dataset.manual) {
                recvInput.value = e.target.value;
            }
        };
        recvInput.oninput = () => {
            recvInput.dataset.manual = 'true';
        };
    }

    // Session Modal Payment Method Toggle
    const sessionPayMethod = document.getElementById('s-payment-method');
    const sessionSplitContainer = document.getElementById('s-split-payment-container');
    const sessionSplitInputs = document.querySelectorAll('.s-split-input');
    const sessionPayAmount = document.getElementById('s-payment-amount');

    if (sessionPayMethod && sessionSplitContainer) {
        sessionPayMethod.onchange = (e) => {
            if (e.target.value === 'split') {
                sessionSplitContainer.classList.remove('hidden');
            } else {
                sessionSplitContainer.classList.add('hidden');
            }
        };
    }

    if (sessionSplitInputs && sessionPayAmount) {
        sessionSplitInputs.forEach(inp => {
            inp.oninput = () => {
                let total = 0;
                sessionSplitInputs.forEach(i => total += parseFloat(i.value) || 0);
                sessionPayAmount.value = total.toFixed(2);
            };
        });
    }
}

function initSplitPaymentHandlers() {
    const budgetMethodSelect = document.getElementById('budget-payment-method');
    const budgetSplitContainer = document.getElementById('budget-split-payment-container');
    const budgetSplitInputs = document.querySelectorAll('.budget-split-input');
    const budgetSplitStatus = document.getElementById('budget-split-status');

    function updateBudgetSplitStatus() {
        if (!budgetSplitStatus) return;
        let totalPaid = 0;
        budgetSplitInputs.forEach(input => {
            totalPaid += parseFloat(input.value) || 0;
        });

        let subtotalUSD = 0;
        currentBudgetItems.forEach(item => subtotalUSD += item.price);
        const discountPct = parseFloat(document.getElementById('budget-discount-input').value) || 0;
        const totalUSD = subtotalUSD * (1 - discountPct / 100);

        const diff = totalUSD - totalPaid;
        if (Math.abs(diff) < 0.01) {
            budgetSplitStatus.innerHTML = `<span style="color:#059669;"><i class="fa-solid fa-circle-check"></i> Distribución completa: $${totalUSD.toFixed(2)} USD cubiertos.</span>`;
            budgetSplitStatus.style.background = 'rgba(5, 150, 105, 0.05)';
        } else if (diff > 0) {
            budgetSplitStatus.innerHTML = `<span style="color:#d97706;"><i class="fa-solid fa-triangle-exclamation"></i> Faltan $${diff.toFixed(2)} USD por distribuir (Total: $${totalUSD.toFixed(2)} USD).</span>`;
            budgetSplitStatus.style.background = 'rgba(217, 119, 6, 0.05)';
        } else {
            budgetSplitStatus.innerHTML = `<span style="color:#dc2626;"><i class="fa-solid fa-circle-xmark"></i> Exceso de $${Math.abs(diff).toFixed(2)} USD (Total: $${totalUSD.toFixed(2)} USD).</span>`;
            budgetSplitStatus.style.background = 'rgba(220, 38, 38, 0.05)';
        }
    }

    if (budgetMethodSelect) {
        budgetMethodSelect.addEventListener('change', () => {
            const val = budgetMethodSelect.value;
            if (val === 'split') {
                if (budgetSplitContainer) budgetSplitContainer.classList.remove('hidden');
                updateBudgetSplitStatus();
            } else {
                if (budgetSplitContainer) budgetSplitContainer.classList.add('hidden');
            }
        });
    }

    const budgetDiscInput = document.getElementById('budget-discount-input');
    if (budgetDiscInput) {
        budgetDiscInput.addEventListener('input', () => {
            if (budgetMethodSelect && budgetMethodSelect.value === 'split') {
                updateBudgetSplitStatus();
            }
        });
    }

    budgetSplitInputs.forEach(input => {
        input.addEventListener('input', updateBudgetSplitStatus);
    });

    const billMethodSelect = document.getElementById('bill-method');
    const billSplitContainer = document.getElementById('billing-split-payment-container');
    const billSplitInputs = document.querySelectorAll('.billing-split-input');
    const billSplitStatus = document.getElementById('billing-split-status');

    function updateBillingSplitStatus() {
        if (!billSplitStatus) return;
        let totalPaid = 0;
        billSplitInputs.forEach(input => {
            totalPaid += parseFloat(input.value) || 0;
        });

        let totalRef = 0;
        billingItems.forEach(item => {
            totalRef += item.price * item.qty;
        });

        const diff = totalRef - totalPaid;
        if (Math.abs(diff) < 0.01) {
            billSplitStatus.innerHTML = `<span style="color:#059669;"><i class="fa-solid fa-circle-check"></i> Distribución completa: $${totalRef.toFixed(2)} USD cubiertos.</span>`;
            billSplitStatus.style.background = 'rgba(5, 150, 105, 0.05)';
        } else if (diff > 0) {
            billSplitStatus.innerHTML = `<span style="color:#d97706;"><i class="fa-solid fa-triangle-exclamation"></i> Faltan $${diff.toFixed(2)} USD por distribuir (Total: $${totalRef.toFixed(2)} USD).</span>`;
            billSplitStatus.style.background = 'rgba(217, 119, 6, 0.05)';
        } else {
            billSplitStatus.innerHTML = `<span style="color:#dc2626;"><i class="fa-solid fa-circle-xmark"></i> Exceso de $${Math.abs(diff).toFixed(2)} USD (Total: $${totalRef.toFixed(2)} USD).</span>`;
            billSplitStatus.style.background = 'rgba(220, 38, 38, 0.05)';
        }
    }

    if (billMethodSelect) {
        billMethodSelect.addEventListener('change', () => {
            const val = billMethodSelect.value;
            if (val === 'split') {
                if (billSplitContainer) billSplitContainer.classList.remove('hidden');
                updateBillingSplitStatus();
            } else {
                if (billSplitContainer) billSplitContainer.classList.add('hidden');
            }
        });
    }

    billSplitInputs.forEach(input => {
        input.addEventListener('input', updateBillingSplitStatus);
    });

    window.updateBillingSplitStatusExternal = () => {
        if (billMethodSelect && billMethodSelect.value === 'split') {
            updateBillingSplitStatus();
        }
    };
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

window.openAppointmentModalForNextSession = async (patientId, nextSessionNum) => {
    await populateAppointmentPatientSelect();
    
    const select = document.getElementById('app-patient-select');
    if (select) {
        select.value = patientId;
        select.dispatchEvent(new Event('change'));
    }

    const treatInput = document.getElementById('app-treatment');
    if (treatInput) {
        treatInput.value = `Sesión ${nextSessionNum}: `;
    }

    openModal('modal-appointment');
};

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
            const rawHeader = config.header_text || config.headerText || '';
            try {
                if (rawHeader.startsWith('{')) {
                    busData = JSON.parse(rawHeader);
                } else {
                    busData.name = rawHeader;
                }
            } catch(e) {
                busData.name = rawHeader;
            }
            busData.footer = config.footer_text || config.footerText || '';
            busData.logoUrl = config.logo_url || config.logoUrl || '';
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

window.toggleAccordion = (headerEl) => {
    const content = headerEl.nextElementSibling;
    const arrow = headerEl.querySelector('.accordion-arrow');
    const isOpen = content.style.display === 'block';
    
    content.style.display = isOpen ? 'none' : 'block';
    arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
};

window.updateAccordionHeaderSummary = (sessionNum) => {
    const container = document.getElementById('plan-sessions-container');
    if (!container) return;

    const header = container.querySelector(`.accordion-header[data-session="${sessionNum}"]`);
    if (!header) return;

    const summarySpan = header.querySelector('.session-header-summary');
    if (!summarySpan) return;

    const dateInput = container.querySelector(`.session-date-input[data-session="${sessionNum}"]`);
    const timeSelect = container.querySelector(`.session-time-select[data-session="${sessionNum}"]`);
    const checkedServices = container.querySelectorAll(`.session-service-checkbox[data-session="${sessionNum}"]:checked`);

    const dateVal = dateInput ? dateInput.value : '';
    const timeVal = timeSelect ? timeSelect.value : '';
    const servicesCount = checkedServices.length;

    let summaryText = '';
    if (dateVal) {
        summaryText += `📅 ${dateVal} ${timeVal ? `a las ${timeVal}` : ''} | `;
    } else {
        summaryText += `📅 Sin fecha | `;
    }
    summaryText += `⚙️ ${servicesCount} serv.`;

    summarySpan.textContent = `(${summaryText})`;
};

function renderSessionsPlanner() {
    const container = document.getElementById('plan-sessions-container');
    if (!container) return;

    const sessionsInput = document.getElementById('p-init-treatment-sessions');
    const sessionsCount = parseInt(sessionsInput ? sessionsInput.value : 0) || 0;

    if (sessionsCount <= 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 10px;">Indique al menos 1 sesión estimada.</div>';
        return;
    }

    let budgetItems = (currentBudgetItems && currentBudgetItems.length > 0) ? currentBudgetItems : (window.currentBudgetItems || []);
    
    // If still empty, check editing patient object
    const p = window.currentEditingPatientObj;
    if (budgetItems.length === 0 && p) {
        if (p.metadata?.sessionsPlan && Array.isArray(p.metadata.sessionsPlan)) {
            const extracted = [];
            p.metadata.sessionsPlan.forEach(s => {
                if (s.services && Array.isArray(s.services)) {
                    s.services.forEach(srv => {
                        if (srv && srv.name && !extracted.some(e => e.name === srv.name && e.tooth === srv.tooth)) {
                            extracted.push(srv);
                        }
                    });
                }
            });
            if (extracted.length > 0) {
                budgetItems = extracted;
            }
        }
        if (budgetItems.length === 0 && p.metadata?.initTreatmentName) {
            budgetItems = [{
                key: 'init-proc-1',
                tooth: 'General',
                face: 'Gnl',
                name: p.metadata.initTreatmentName,
                price: 0
            }];
        }
    }

    window.currentPlannerBudgetItems = budgetItems;

    if (budgetItems.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 12px; border: 1px dashed var(--border-color); border-radius:6px; background:var(--bg-main);"><i class="fa-solid fa-triangle-exclamation text-amber"></i> No hay tratamientos cargados en el presupuesto activo para distribuir en las sesiones.<br><small style="margin-top:6px; display:block; color:var(--text-muted);">Agregue tratamientos en el Presupuesto / Odontodiagrama o ingrese el Tratamiento Propuesto en este formulario.</small></div>';
        return;
    }

    // Preserve current selections, dates and times before redrawing
    const prevData = {};
    
    // First, populate from saved patient sessionsPlan if editing existing patient
    if (p && p.metadata?.sessionsPlan && Array.isArray(p.metadata.sessionsPlan)) {
        p.metadata.sessionsPlan.forEach(s => {
            const sNum = s.sessionNumber;
            const selIdxs = [];
            if (s.services && Array.isArray(s.services)) {
                s.services.forEach(srv => {
                    const idx = budgetItems.findIndex(b => b.name === srv.name && (b.tooth === srv.tooth || !srv.tooth));
                    if (idx >= 0) selIdxs.push(idx.toString());
                });
            }
            prevData[sNum] = {
                date: s.date || '',
                time: s.time || '09:00 AM',
                selectedIdxs: selIdxs
            };
        });
    }

    // Override with any live form input if previously rendered
    container.querySelectorAll('.session-date-input').forEach(input => {
        const sNum = input.dataset.session;
        const timeSelect = container.querySelector(`.session-time-select[data-session="${sNum}"]`);
        if (!prevData[sNum]) prevData[sNum] = { selectedIdxs: [] };
        if (input.value) prevData[sNum].date = input.value;
        if (timeSelect) prevData[sNum].time = timeSelect.value;
    });
    container.querySelectorAll('.session-service-checkbox:checked').forEach(cb => {
        const sNum = cb.dataset.session;
        const idx = cb.dataset.itemIdx;
        if (!prevData[sNum]) prevData[sNum] = { selectedIdxs: [] };
        if (!prevData[sNum].selectedIdxs.includes(idx)) {
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

        const isExpanded = (i === 1) ? 'block' : 'none';
        const arrowRotation = (i === 1) ? 'rotate(180deg)' : 'rotate(0deg)';

        html += `
            <div class="accordion-item card" style="margin-bottom: 10px; border: 1px solid var(--border-color); background: var(--bg-card); border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); overflow: hidden;">
                <div class="accordion-header" data-session="${i}" onclick="window.toggleAccordion(this)" style="display:flex; justify-content:space-between; align-items:center; padding: 12px; cursor:pointer; background: rgba(13, 148, 136, 0.04); border-bottom: 1px solid var(--border-color);">
                    <strong style="color:var(--primary-cyan); font-size:0.9rem;">
                        <i class="fa-solid fa-calendar-day"></i> Sesión ${i}
                        <span class="session-header-summary" style="font-weight:normal; font-size:0.8rem; margin-left:10px; color: var(--text-muted);"></span>
                    </strong>
                    <i class="fa-solid fa-chevron-down accordion-arrow" style="transition: transform 0.2s; transform: ${arrowRotation}; color: var(--text-muted);"></i>
                </div>
                <div class="accordion-content" style="padding: 12px; display: ${isExpanded};">
                    <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
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
            </div>
        `;
    }

    container.innerHTML = html;

    // Attach listeners and check conflict immediately
    for (let i = 1; i <= sessionsCount; i++) {
        window.updateAccordionHeaderSummary(i);
        
        const dateInput = container.querySelector(`.session-date-input[data-session="${i}"]`);
        const timeSelect = container.querySelector(`.session-time-select[data-session="${i}"]`);
        
        if (dateInput) {
            // Check conflict immediately if a date already exists
            if (dateInput.value) {
                const infoDiv = document.getElementById(`conflict-info-${i}`);
                if (infoDiv) infoDiv.style.display = 'block';
                updateConflictInfoForSession(dateInput.value, i);
            }

            dateInput.onchange = async () => {
                const infoDiv = document.getElementById(`conflict-info-${i}`);
                if (infoDiv) {
                    infoDiv.style.display = dateInput.value ? 'block' : 'none';
                }
                await updateConflictInfoForSession(dateInput.value, i);
                window.updateAccordionHeaderSummary(i);
            };
        }
        
        if (timeSelect) {
            timeSelect.onchange = () => {
                window.updateAccordionHeaderSummary(i);
            };
        }

        container.querySelectorAll(`.session-service-checkbox[data-session="${i}"]`).forEach(cb => {
            cb.onchange = () => {
                window.updateAccordionHeaderSummary(i);
            };
        });
    }
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
        currentStep = step;
        for (let i = 1; i <= totalSteps; i++) {
            const pane = document.getElementById(`step-content-${i}`);
            const indicator = document.getElementById(`step-ind-${i}`);
            const line = document.getElementById(`step-line-${i}`);
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
            if (line) {
                if (i < step) {
                    line.classList.add('completed');
                } else {
                    line.classList.remove('completed');
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
            if (step === totalSteps) {
                btnNext.classList.add('hidden');
            } else {
                btnNext.classList.remove('hidden');
            }
        }
        if (btnSave) {
            if (step === totalSteps || window.editingPatientId) {
                btnSave.classList.remove('hidden');
            } else {
                btnSave.classList.add('hidden');
            }
        }
        const btnSaveAndBudget = document.getElementById('btn-patient-save-and-budget');
        if (btnSaveAndBudget) {
            if (step >= 3 || window.editingPatientId) {
                btnSaveAndBudget.classList.remove('hidden');
            } else {
                btnSaveAndBudget.classList.add('hidden');
            }
        }
        if (step === 4) {
            renderSessionsPlanner();
        }
    }

    window.setPatientStepperStep = showStep;

    // Direct Click navigation on Step Numbers / Indicators
    document.querySelectorAll('.step-indicator').forEach(ind => {
        ind.addEventListener('click', (e) => {
            e.preventDefault();
            const targetStep = parseInt(ind.dataset.step);
            if (!targetStep || isNaN(targetStep) || targetStep === currentStep) return;

            // If navigating forward from Step 1, validate required patient fields
            if (currentStep === 1 && targetStep > 1) {
                const firstname = document.getElementById('p-firstname') ? document.getElementById('p-firstname').value.trim() : '';
                const lastname = document.getElementById('p-lastname') ? document.getElementById('p-lastname').value.trim() : '';
                const id = document.getElementById('p-id') ? document.getElementById('p-id').value.trim() : '';
                const birthdate = document.getElementById('p-birthdate') ? document.getElementById('p-birthdate').value : '';
                const phone = document.getElementById('p-mobile-phone') ? document.getElementById('p-mobile-phone').value.trim() : '';

                if (!firstname || !lastname || !id || !birthdate || !phone) {
                    Swal.fire({ icon: 'warning', title: 'Campos Incompletos', text: 'Por favor complete los campos obligatorios del Paso 1 (Filiación) antes de avanzar.' });
                    return;
                }

                // Check for representative fields if child
                const age = calculateAge(birthdate);
                if (age < 18) {
                    const repName = document.getElementById('p-rep-name') ? document.getElementById('p-rep-name').value.trim() : '';
                    const repId = document.getElementById('p-rep-id') ? document.getElementById('p-rep-id').value.trim() : '';
                    const repPhone = document.getElementById('p-rep-phone') ? document.getElementById('p-rep-phone').value.trim() : '';
                    const repRelation = document.getElementById('p-rep-relation') ? document.getElementById('p-rep-relation').value.trim() : '';

                    if (!repName || !repId || !repPhone || !repRelation) {
                        Swal.fire({ icon: 'warning', title: 'Representante Obligatorio', text: 'El paciente es menor de edad. Por favor complete los datos del representante legal.' });
                        return;
                    }
                }
            }

            showStep(targetStep);
        });
    });

    if (btnPrev) {
        btnPrev.onclick = (e) => {
            e.preventDefault();
            if (currentStep > 1) {
                showStep(currentStep - 1);
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
                showStep(currentStep + 1);
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

    // Toggle Switches and Conditional Fields Interaction
    document.querySelectorAll('.toggle-switch-wrapper').forEach(wrapper => {
        wrapper.onclick = (e) => {
            const input = wrapper.querySelector('input[type="checkbox"]');
            if (!input) return;

            if (e.target !== input) {
                input.checked = !input.checked;
            }
            
            wrapper.classList.toggle('is-checked', input.checked);

            // Handle conditional details animation
            const parentDiv = wrapper.parentElement;
            if (parentDiv) {
                const details = parentDiv.querySelector('.conditional-details');
                if (details) {
                    if (input.checked) {
                        details.classList.add('active');
                        details.style.display = 'block';
                        const field = details.querySelector('textarea, input');
                        if (field) field.focus();
                    } else {
                        details.classList.remove('active');
                        details.style.display = 'none';
                    }
                }
            }
        };
    });

    // Check-Chips Selection Interaction
    document.querySelectorAll('.check-chip').forEach(chip => {
        chip.onclick = (e) => {
            const input = chip.querySelector('input[type="checkbox"]');
            if (!input) return;

            if (e.target !== input) {
                input.checked = !input.checked;
            }
            chip.classList.toggle('active', input.checked);
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

        document.querySelectorAll('.toggle-switch-wrapper').forEach(w => {
            w.classList.remove('is-checked');
        });
        document.querySelectorAll('.conditional-details').forEach(d => {
            d.classList.remove('active');
            d.style.display = 'none';
        });
        document.querySelectorAll('.check-chip').forEach(c => {
            c.classList.remove('active');
        });

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

    window.openPatientModalForNew = () => {
        window.currentPatientId = null;
        window.editingPatientId = null;
        window.wizardMode = 'all_steps';
        resetWizard();
        
        const modalTitle = document.getElementById('modal-patient-title');
        if (modalTitle) {
            modalTitle.innerHTML = `<i class="fa-solid fa-user-plus text-cyan"></i> Registro de Paciente`;
        }
        const saveBtn = document.getElementById('btn-save-patient');
        if (saveBtn) saveBtn.innerText = 'Guardar Paciente';

        const pIdInput = document.getElementById('p-id');
        if (pIdInput) pIdInput.readOnly = false;
        
        // Show all Step indicators 1, 2, 3, 4 and lines
        document.getElementById('step-ind-2').classList.remove('hidden');
        document.getElementById('step-ind-3').classList.remove('hidden');
        document.getElementById('step-ind-4').classList.remove('hidden');
        document.getElementById('step-line-1').classList.remove('hidden');
        document.getElementById('step-line-2').classList.remove('hidden');
        document.getElementById('step-line-3').classList.remove('hidden');
        
        showStep(1);
        openModal('modal-patient');
    };

    window.editPatient = async function(patientId) {
        try {
            const patients = await SupabaseDataService.getPatients();
            const p = patients.find(pat => pat.id === patientId);
            if (!p) {
                Swal.fire({ icon: 'error', title: 'Error', text: 'No se encontró la ficha del paciente.' });
                return;
            }

            window.currentPatientId = p.id;
            window.editingPatientId = p.id;
            window.wizardMode = 'clinical_complete';
            resetWizard();

            const modalTitle = document.getElementById('modal-patient-title');
            if (modalTitle) {
                modalTitle.innerHTML = `<i class="fa-solid fa-user-pen text-cyan"></i> Editar Paciente: ${p.fullname}`;
            }
            const saveBtn = document.getElementById('btn-save-patient');
            if (saveBtn) {
                saveBtn.innerText = 'Guardar Cambios';
                saveBtn.classList.remove('hidden');
            }

            // Show all Step indicators 1, 2, 3, 4 and lines
            document.getElementById('step-ind-2').classList.remove('hidden');
            document.getElementById('step-ind-3').classList.remove('hidden');
            document.getElementById('step-ind-4').classList.remove('hidden');
            document.getElementById('step-line-1').classList.remove('hidden');
            document.getElementById('step-line-2').classList.remove('hidden');
            document.getElementById('step-line-3').classList.remove('hidden');

            loadPatientDataIntoForm(p);

            const pIdInput = document.getElementById('p-id');
            if (pIdInput) pIdInput.readOnly = true;

            showStep(1);
            openModal('modal-patient');
        } catch(e) {
            console.error("Error editing patient:", e);
        }
    };

    window.openClinicalWizardForPatientId = (patient) => {
        window.editPatient(patient.id);
    };

    window.selectRegisterFlow = async () => {
        window.openPatientModalForNew();
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
                Swal.fire({ icon: 'warning', title: 'Paciente No Seleccionado', text: 'Por favor, seleccione un paciente primero para editar su historia clínica.' });
                return;
            }
            window.editPatient(activeId);
        };
    }
}

function toggleStep1InputsReadonly(isReadonly) {
    // Keep inputs enabled so they can always be edited, only p-id is guarded during edit
    const pIdInput = document.getElementById('p-id');
    if (pIdInput) pIdInput.readOnly = isReadonly;
}

function loadPatientDataIntoForm(p) {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };
    const setChecked = (id, isChecked, detailsId) => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = !!isChecked;
            const wrapper = el.closest('.toggle-switch-wrapper');
            if (wrapper) {
                wrapper.classList.toggle('is-checked', el.checked);
            }
            if (detailsId) {
                const det = document.getElementById(detailsId);
                if (det) {
                    if (el.checked) {
                        det.classList.add('active');
                        det.style.display = 'block';
                    } else {
                        det.classList.remove('active');
                        det.style.display = 'none';
                    }
                }
            }
        }
    };

    setVal('p-id', p.id);
    if (p.fullname) {
        const parts = p.fullname.split(' ');
        setVal('p-firstname', parts[0] || '');
        setVal('p-lastname', parts.slice(1).join(' ') || '');
    }
    setVal('p-birthdate', p.birthdate || '');
    const age = calculateAge(p.birthdate);
    setVal('p-age', (p.metadata && p.metadata.age) || age || '');
    setVal('p-mobile-phone', p.phone || (p.metadata && p.metadata.mobilePhone) || '');
    setVal('p-local-phone', p.metadata?.localPhone || '');
    setVal('p-email', p.email || '');
    setVal('p-profession', p.occupation || p.metadata?.profession || '');
    setVal('p-gender', p.metadata?.gender || 'Femenino');
    setVal('p-address', p.address || p.metadata?.address || '');
    setVal('p-consult-reason', p.metadata?.consultReason || '');

    const pType = p.metadata?.type || (age < 18 ? 'Infantil' : 'Adulto');
    setVal('p-type', pType);
    const repFieldsDiv = document.getElementById('representative-fields');
    if (repFieldsDiv) {
        if (pType === 'Infantil') {
            repFieldsDiv.classList.remove('hidden');
        } else {
            repFieldsDiv.classList.add('hidden');
        }
    }

    setVal('p-rep-name', p.metadata?.repName || '');
    setVal('p-rep-id', p.metadata?.repId || '');
    setVal('p-rep-phone', p.metadata?.repPhone || '');
    setVal('p-rep-relation', p.metadata?.repRelation || '');

    // Step 2: Anamnesis
    document.querySelectorAll('input[name="p-allergies"]').forEach(cb => {
        cb.checked = (p.allergies || []).includes(cb.value);
        const chip = cb.closest('.check-chip');
        if (chip) chip.classList.toggle('active', cb.checked);
    });
    document.querySelectorAll('input[name="p-systemic"]').forEach(cb => {
        cb.checked = (p.systemic || []).includes(cb.value);
        const chip = cb.closest('.check-chip');
        if (chip) chip.classList.toggle('active', cb.checked);
    });

    const isMed = p.metadata?.medicalTreatment === 'Sí' || p.metadata?.medicalTreatment === true;
    setChecked('p-medical-treatment', isMed, 'details-medical-treatment');
    setVal('p-medical-treatment-details', p.metadata?.medicalTreatmentDetails || '');

    const isAll = p.metadata?.hasAllergies === 'Sí' || p.metadata?.hasAllergies === true || (p.allergies && p.allergies.length > 0);
    setChecked('p-has-allergies', isAll, 'details-has-allergies');
    setVal('p-allergies-details', p.metadata?.allergiesDetails || '');

    const isResp = p.metadata?.respiratoryIssues === 'Sí' || p.metadata?.respiratoryIssues === true;
    setChecked('p-respiratory-issues', isResp, 'details-respiratory-issues');
    setVal('p-respiratory-issues-details', p.metadata?.respiratoryIssuesDetails || '');

    const isAnest = p.metadata?.anesthesiaReaction === 'Sí' || p.metadata?.anesthesiaReaction === true;
    setChecked('p-anesthesia-reaction', isAnest, 'details-anesthesia-reaction');
    setVal('p-anesthesia-reaction-details', p.metadata?.anesthesiaReactionDetails || '');

    const isPeni = p.metadata?.penicillinAllergy === 'Sí' || p.metadata?.penicillinAllergy === true || (p.allergies && p.allergies.includes('Penicilina'));
    setChecked('p-penicillin-allergy', isPeni, 'details-penicillin-allergy');
    setVal('p-penicillin-allergy-details', p.metadata?.penicillinAllergyDetails || '');

    const isHeart = p.metadata?.heartIssues === 'Sí' || p.metadata?.heartIssues === true;
    setChecked('p-heart-issues', isHeart, 'details-heart-issues');
    setVal('p-heart-issues-details', p.metadata?.heartIssuesDetails || '');

    setChecked('p-bleeding-issue', p.metadata?.bleedingIssue === 'Sí' || p.metadata?.bleedingIssue === true);
    setVal('p-surgeries', p.metadata?.surgeries || '');
    setVal('p-child-diseases', p.metadata?.childDiseases || '');

    // Step 3: Tejidos y Hábitos
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

    setChecked('p-habit-swallowing', p.metadata?.habitSwallowing === 'Sí' || p.metadata?.habitSwallowing === true);
    setChecked('p-habit-nailbiting', p.metadata?.habitNailbiting === 'Sí' || p.metadata?.habitNailbiting === true);
    
    const isThumb = p.metadata?.habitThumbsucking === 'Sí' || p.metadata?.habitThumbsucking === true;
    setChecked('p-habit-thumbsucking', isThumb, 'details-thumbsucking');
    setVal('p-habit-thumbsucking-finger', p.metadata?.habitThumbsuckingFinger || '');

    setChecked('p-habit-mouthbreather', p.metadata?.habitMouthbreather === 'Sí' || p.metadata?.habitMouthbreather === true);
    setVal('p-habit-frequency', p.metadata?.habitFrequency || '');
    setVal('p-habit-intensity', p.metadata?.habitIntensity || '');
    setVal('p-habit-others', p.metadata?.habitOthers || '');

    // Step 4: Plan
    setVal('p-init-treatment-sessions', (p.metadata?.initialTreatmentPlan && p.metadata.initialTreatmentPlan.totalSessions) || p.metadata?.initTreatmentSessions || 4);
    setVal('p-init-treatment-interval', (p.metadata?.initialTreatmentPlan && p.metadata.initialTreatmentPlan.interval) || p.metadata?.initTreatmentInterval || 'Quincenal');
    setVal('p-init-treatment-name', p.metadata?.initTreatmentName || '');

    window.currentEditingPatientObj = p;
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

                // Apply branding across whole UI immediately
                applyClinicBrandingUI({
                    headerText: JSON.stringify(busData),
                    footerText: footer,
                    logoUrl: logoUrl
                });

                Swal.fire({ icon: 'success', title: 'Ajustes de Negocio Guardados', text: 'Se actualizaron el logo, nombre clínico y membretes en todo el sistema.', timer: 2500, showConfirmButton: false });
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

                // Update budget signature pad immediately if signature was saved
                if (signatureData && window.doctorSigPad) {
                    window.doctorSigPad.loadFromDataURL(signatureData);
                }

                Swal.fire({ icon: 'success', title: 'Perfil Personal Actualizado', text: 'Sus datos de acceso y firma médica oficial fueron sincronizados.', timer: 2000, showConfirmButton: false });
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
    window.closeMobileSidebar = closeMobileSidebar;

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

function getClinicBusData(config) {
    let busData = {
        name: 'Consultorio Odontológico',
        doctor: 'Dr. Rodrigo Navas',
        phone: '+58 (412) 555-0192',
        email: 'contacto@dentalcare.com',
        rif: 'J-12345678-9',
        address: 'Av. Principal de Las Mercedes, Torre Consultorios, Piso 4, Caracas',
        logoUrl: '',
        footer: 'Gracias por su confianza. Todo tratamiento dental requiere control periódico cada 6 meses.',
        bankInfo: 'Banco Banesco - Cuenta Corriente | N°: 0134-0000-00-0000000000<br>A nombre de: Consultorio Odontológico<br>Pago Móvil: C.I. 12.345.678 / Tlf: 0412-5550192'
    };

    if (config) {
        const raw = config.header_text || config.headerText;
        if (raw) {
            try {
                if (typeof raw === 'object') {
                    Object.assign(busData, raw);
                } else if (raw.startsWith('{')) {
                    Object.assign(busData, JSON.parse(raw));
                } else {
                    busData.name = raw;
                }
            } catch(e) {
                busData.name = raw;
            }
        }
        if (config.logo_url || config.logoUrl) busData.logoUrl = config.logo_url || config.logoUrl;
        if (config.footer_text || config.footerText) busData.footer = config.footer_text || config.footerText;
    }

    const savedName = localStorage.getItem('dental_clinic_name');
    if (savedName && savedName.trim()) busData.name = savedName.trim();
    const savedAddr = localStorage.getItem('dental_clinic_address');
    if (savedAddr && savedAddr.trim()) busData.address = savedAddr.trim();
    const savedPhone = localStorage.getItem('dental_clinic_phone');
    if (savedPhone && savedPhone.trim()) busData.phone = savedPhone.trim();

    return busData;
}

function buildMedicalDocumentHTML(opts) {
    const {
        docType = 'factura',
        docTitle = 'Factura Digital',
        emissionDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        controlNumber = 'FC-2026-00892',
        paymentMethod = 'Transferencia / PAGO MÓVIL',
        
        clinicName = 'Consultorio Odontológico',
        clinicPhone = '+58 (412) 555-0192',
        clinicAddress = 'Av. Principal, Torre Consultorios, Caracas',
        logoUrl = '',
        
        doctorName = 'Dr. Rodrigo Navas',
        doctorSpecialty = 'Odontología General / Rehabilitación Oral',
        doctorPhone = '+58 (414) 123-4567',
        doctorSig = '',
        
        patientName = 'Carlos Eduardo Mendoza',
        patientId = 'V-18.452.910',
        patientPhone = '+58 (416) 987-6543',
        patientSig = '',
        
        items = [],
        subtotalUSD = 0,
        discountPct = 0,
        discountUSD = 0,
        taxUSD = 0,
        totalUSD = 0,
        totalVES = '',
        approvedAmountUSD = 0,
        
        paymentTerms = 'Contado / Pago inmediato al momento de la consulta.',
        bankingDetails = 'Banco Banesco - Cuenta Corriente | N°: 0134-0000-00-0000000000<br>A nombre de: Consultorio Odontológico<br>Pago Móvil: C.I. 12.345.678 / Tlf: 0412-5550192',
        observations = 'El paciente presenta evolución favorable. Se recomienda mantener tratamiento y esquema preventivo indicado, evitar esfuerzos intensos durante las próximas 48 horas y acudir a control preventivo en 30 días.',
        consentText = 'Por medio de la presente, el paciente declara haber recibido explicación clara y detallada acerca de los procedimientos diagnosticados y realizados en esta consulta, aceptando de manera voluntaria la atención prestada y expresando su conformidad con los cobros administrativos y honorarios detallados en este documento.',
        footerNote = ''
    } = opts;

    let rowsHtml = '';
    if (items && items.length > 0) {
        items.forEach(it => {
            const qty = it.qty || 1;
            const price = it.price || 0;
            const total = it.total || (price * qty);
            rowsHtml += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 11px 14px; text-align: left; vertical-align: top;">
                        <strong style="font-size: 0.9rem; color: #0f172a; display: block;">${it.name}</strong>
                        ${it.description ? `<span style="font-size: 0.78rem; color: #64748b; display: block; margin-top: 3px;">${it.description}</span>` : ''}
                    </td>
                    <td style="padding: 11px 8px; text-align: center; font-size: 0.88rem; color: #334155; vertical-align: top;">${qty}</td>
                    <td style="padding: 11px 14px; text-align: right; font-size: 0.88rem; color: #334155; vertical-align: top;">$ ${price.toFixed(2).replace('.', ',')}</td>
                    <td style="padding: 11px 14px; text-align: right; font-size: 0.88rem; font-weight: 600; color: #0f172a; vertical-align: top;">$ ${total.toFixed(2).replace('.', ',')}</td>
                </tr>
            `;
        });
    } else {
        rowsHtml = `
            <tr>
                <td colspan="4" style="padding: 18px; text-align: center; color: #94a3b8; font-style: italic;">Sin procedimientos listados</td>
            </tr>
        `;
    }

    const effectiveApproved = (approvedAmountUSD > 0) ? approvedAmountUSD : totalUSD;

    return `
        <div class="medical-doc-container" style="background: #ffffff; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 0.88rem; line-height: 1.45; width: 100%; max-width: 820px; margin: 0 auto; padding: 25px 30px; box-sizing: border-box;">
            
            <!-- 1. Header (Logo left, Title & metadata right) -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 15px; border-bottom: 1px solid #f1f5f9;">
                <div style="flex: 1; max-width: 240px;">
                    ${logoUrl ? `
                        <img src="${logoUrl}" style="max-height: 65px; max-width: 150px; object-fit: contain; display: block;" alt="Logo">
                    ` : `
                        <div style="border: 2px dashed #0284c7; border-radius: 6px; padding: 10px 18px; display: inline-block; color: #0284c7; font-weight: 800; font-size: 1rem; letter-spacing: 0.05em;">
                            LOGO
                        </div>
                    `}
                </div>
                <div style="text-align: right;">
                    <h1 style="margin: 0 0 6px 0; font-size: 1.6rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em;">${docTitle}</h1>
                    <div style="font-size: 0.82rem; color: #475569; display: flex; flex-direction: column; gap: 3px;">
                        <div><span style="color: #64748b;">Fecha de Emisión:</span> <strong style="color: #0f172a;">${emissionDate}</strong></div>
                        <div><span style="color: #64748b;">N° de Control:</span> <strong style="color: #0f172a; letter-spacing: 0.03em;">${controlNumber}</strong></div>
                        <div><span style="color: #64748b;">Método de Pago:</span> <strong style="color: #0f172a; text-transform: uppercase;">${paymentMethod}</strong></div>
                    </div>
                </div>
            </div>

            <!-- 2. 3-Column Info Cards -->
            <div style="display: grid; grid-template-columns: 1.15fr 1.15fr 1fr; gap: 18px; margin-bottom: 22px; font-size: 0.83rem;">
                <!-- Col 1: Consultorio -->
                <div>
                    <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">CONSULTORIO ODONTOLÓGICO</div>
                    <strong style="font-size: 0.95rem; color: #0f172a; display: block; margin-bottom: 2px;">${clinicName}</strong>
                    <div style="color: #475569;">Tlf: ${clinicPhone}</div>
                    <div style="color: #64748b; font-size: 0.78rem; margin-top: 2px;">${clinicAddress}</div>
                </div>

                <!-- Col 2: Odontólogo Tratante -->
                <div>
                    <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">MÉDICO / ODONTÓLOGO TRATANTE</div>
                    <strong style="font-size: 0.95rem; color: #0f172a; display: block; margin-bottom: 2px;">${doctorName}</strong>
                    <div style="color: #475569;">Especialidad: ${doctorSpecialty}</div>
                    <div style="color: #475569;">Tlf: ${doctorPhone}</div>
                </div>

                <!-- Col 3: Datos del Paciente -->
                <div>
                    <div style="font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">DATOS DEL PACIENTE</div>
                    <strong style="font-size: 0.95rem; color: #0f172a; display: block; margin-bottom: 2px;">${patientName}</strong>
                    <div style="color: #475569;">C.I.: ${patientId}</div>
                    <div style="color: #475569;">Tlf: ${patientPhone}</div>
                </div>
            </div>

            <!-- 3. Procedures Table with Solid Electric Blue Header Bar -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px;">
                <thead>
                    <tr>
                        <th style="background: #0066f5; color: #ffffff; padding: 10px 14px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.05em; text-align: left; text-transform: uppercase; border-top-left-radius: 4px; border-bottom-left-radius: 4px;">PROCEDIMIENTO / TRATAMIENTO</th>
                        <th style="background: #0066f5; color: #ffffff; padding: 10px 8px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.05em; text-align: center; text-transform: uppercase; width: 80px;">CANTIDAD</th>
                        <th style="background: #0066f5; color: #ffffff; padding: 10px 14px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.05em; text-align: right; text-transform: uppercase; width: 110px;">PRECIO UNIT.</th>
                        <th style="background: #0066f5; color: #ffffff; padding: 10px 14px; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.05em; text-align: right; text-transform: uppercase; width: 110px; border-top-right-radius: 4px; border-bottom-right-radius: 4px;">MONTO</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- 4. Terms and Totals Split Section -->
            <div style="display: grid; grid-template-columns: 1.35fr 1fr; gap: 20px; margin-bottom: 22px; align-items: start;">
                <!-- Left: Terms & Banking Box -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; font-size: 0.81rem; line-height: 1.45;">
                    <strong style="font-size: 0.88rem; color: #0f172a; display: block; margin-bottom: 6px;">Términos y Datos de Pago</strong>
                    <div style="margin-bottom: 8px;">
                        <strong>Términos de Pago:</strong> ${paymentTerms}
                    </div>
                    <div style="font-weight: 600; color: #334155; margin-bottom: 3px;">Datos Bancarios:</div>
                    <div style="color: #475569; font-size: 0.78rem; line-height: 1.4;">
                        ${bankingDetails}
                    </div>
                </div>

                <!-- Right: Totals Breakdown Table -->
                <div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.86rem;">
                        <tr>
                            <td style="padding: 4px 0; color: #64748b; text-align: right;">Subtotal:</td>
                            <td style="padding: 4px 0 4px 14px; text-align: right; font-weight: 600; color: #0f172a; width: 110px;">$ ${subtotalUSD.toFixed(2).replace('.', ',')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b; text-align: right;">Descuento (${discountPct}%):</td>
                            <td style="padding: 4px 0 4px 14px; text-align: right; font-weight: 600; color: #0f172a;">$ ${discountUSD.toFixed(2).replace('.', ',')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #64748b; text-align: right;">I.V.A. (0%):</td>
                            <td style="padding: 4px 0 4px 14px; text-align: right; font-weight: 600; color: #0f172a;">$ 0,00</td>
                        </tr>
                        <tr style="border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 8px 0; font-weight: 800; font-size: 0.95rem; color: #0f172a; text-align: right;">Total:</td>
                            <td style="padding: 8px 0 8px 14px; text-align: right; font-weight: 800; font-size: 1.15rem; color: #0066f5;">$ ${totalUSD.toFixed(2).replace('.', ',')}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 700; color: #334155; text-align: right;">Monto Aprobado:</td>
                            <td style="padding: 6px 0 6px 14px; text-align: right; font-weight: 700; color: #0066f5;">$ ${effectiveApproved.toFixed(2).replace('.', ',')}</td>
                        </tr>
                        ${totalVES ? `
                        <tr>
                            <td colspan="2" style="padding: 2px 0; text-align: right; font-size: 0.78rem; color: #64748b;">
                                Equivalente Ref.: <strong style="color:#0f172a;">${totalVES}</strong>
                            </td>
                        </tr>` : ''}
                    </table>
                </div>
            </div>

            <!-- 5. Clinical Observations (Left Blue Border Card) -->
            <div style="border-left: 4px solid #0066f5; background: #ffffff; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; border-radius: 0 4px 4px 0; padding: 10px 14px; margin-bottom: 14px; font-size: 0.81rem; line-height: 1.45;">
                <strong style="text-transform: uppercase; color: #0f172a; font-size: 0.74rem; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">OBSERVACIONES CLÍNICAS</strong>
                <div style="color: #475569;">${observations}</div>
            </div>

            <!-- 6. Informed Consent (Left Blue Border Card) -->
            <div style="border-left: 4px solid #0066f5; background: #ffffff; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; border-radius: 0 4px 4px 0; padding: 10px 14px; margin-bottom: 26px; font-size: 0.81rem; line-height: 1.45;">
                <strong style="text-transform: uppercase; color: #0f172a; font-size: 0.74rem; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">CONSENTIMIENTO INFORMADO</strong>
                <div style="color: #475569;">${consentText}</div>
            </div>

            <!-- 7. Dual Signature Section -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 20px; padding-top: 10px; text-align: center;">
                <div>
                    ${doctorSig ? `
                        <img src="${doctorSig}" style="max-height: 52px; max-width: 150px; object-fit: contain; margin: 0 auto 4px auto; display: block;" alt="Firma Médico">
                    ` : `<div style="height: 52px;"></div>`}
                    <div style="border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 0.82rem; font-weight: 700; color: #0f172a;">Firma / Sello del Médico Tratante</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${doctorName} — M.P.P.S. / C.O.V.</div>
                </div>

                <div>
                    ${patientSig ? `
                        <img src="${patientSig}" style="max-height: 52px; max-width: 150px; object-fit: contain; margin: 0 auto 4px auto; display: block;" alt="Firma Paciente">
                    ` : `<div style="height: 52px;"></div>`}
                    <div style="border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 0.82rem; font-weight: 700; color: #0f172a;">Firma del Paciente / Representante</div>
                    <div style="font-size: 0.75rem; color: #64748b;">C.I.: ${patientId}</div>
                </div>
            </div>

            ${footerNote ? `
                <div style="text-align: center; margin-top: 25px; padding-top: 10px; border-top: 1px dashed #cbd5e1; font-size: 0.74rem; color: #94a3b8;">
                    ${footerNote}
                </div>
            ` : ''}
        </div>
    `;
}

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
    const budgetPaymentMethodText = budgetPaymentMethod ? budgetPaymentMethod.options[budgetPaymentMethod.selectedIndex].text : 'Transferencia / Pago Móvil';
    const notes = document.getElementById('budget-notes') ? document.getElementById('budget-notes').value : '';
    const consentText = document.getElementById('consent-text') ? document.getElementById('consent-text').value : '';

    const rate = getExchangeRate();
    const totalVES = `Bs. ${(totalUSD * rate).toFixed(2)}`;

    const items = currentBudgetItems.map(item => ({
        name: `${item.name} (${item.tooth !== 'General' ? 'Pieza ' + item.tooth : 'General'} - ${item.face || 'Gnl'})`,
        description: item.specialist ? `Especialista: ${item.specialist}` : 'Tratamiento odontológico especializado',
        qty: 1,
        price: item.price || 0,
        total: item.price || 0
    }));

    const stationery = await SupabaseDataService.getStationeryConfig();
    const busData = getClinicBusData(stationery);
    const logoBase64 = await toDataURL(busData.logoUrl || stationery.logoUrl);

    let docSig = (window.doctorSigPad && !window.doctorSigPad.isEmpty()) ? window.doctorSigPad.toDataURL() : '';
    if (!docSig) {
        const u = getCurrentUser();
        if (u) {
            docSig = (u.doctorProfile && u.doctorProfile.signature) || (u.doctor_profile && u.doctor_profile.signature) || '';
        }
    }
    const patSig = (window.patientSigPad && !window.patientSigPad.isEmpty()) ? window.patientSigPad.toDataURL() : '';

    const docHtml = buildMedicalDocumentHTML({
        docType: 'presupuesto',
        docTitle: 'Presupuesto Odontológico',
        emissionDate: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        controlNumber: `PR-2026-${activeEditingBudgetId ? activeEditingBudgetId.replace(/[^0-9]/g,'') : '00101'}`,
        paymentMethod: `${paymentModeText} / ${budgetPaymentMethodText}`,
        
        clinicName: busData.name,
        clinicPhone: busData.phone,
        clinicAddress: busData.address,
        logoUrl: logoBase64,
        
        doctorName: (getCurrentUser() && getCurrentUser().fullname) || busData.doctor || 'Dr. Rodrigo Navas',
        doctorSpecialty: 'Odontología General / Especializada',
        doctorPhone: (getCurrentUser() && getCurrentUser().phone) || busData.phone,
        doctorSig: docSig,
        
        patientName: patient.fullname,
        patientId: patient.id,
        patientPhone: patient.phone,
        patientSig: patSig,
        
        items: items,
        subtotalUSD: subtotalUSD,
        discountPct: discountPct,
        discountUSD: discountAmountUSD,
        totalUSD: totalUSD,
        totalVES: totalVES,
        approvedAmountUSD: totalUSD,
        
        paymentTerms: `Validez de la cotización: 15 días continuos a partir de su emisión. Modalidad: ${paymentModeText}.`,
        bankingDetails: busData.bankInfo,
        observations: notes || 'El paciente presenta evolución favorable. Se recomienda iniciar el plan de tratamiento odontológico según el esquema pautado.',
        consentText: consentText || 'Por medio de la presente, el paciente declara haber recibido explicación clara y detallada acerca de los procedimientos diagnosticados y propuestos en este presupuesto, aceptando voluntariamente el inicio del tratamiento.',
        footerNote: busData.footer
    });

    const container = document.createElement('div');
    container.innerHTML = docHtml;
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
    patientSelect.onchange = () => refreshBillingLivePreview();
    assistantSelect.onchange = () => refreshBillingLivePreview();
    document.getElementById('bill-currency').onchange = () => updateBillingTotals();
    document.getElementById('bill-terms').onchange = () => updateBillingTotals();
    document.getElementById('bill-method').onchange = () => updateBillingTotals();
    const footerInput = document.getElementById('bill-footer-note');
    if (footerInput) footerInput.oninput = () => refreshBillingLivePreview();

    // Auto-load current budget items if available on entry
    if (billingItems.length === 0 && currentBudgetItems.length > 0) {
        billingItems = currentBudgetItems.map(item => ({
            code: item.serviceCode || 'CUSTOM',
            name: item.name,
            price: item.price * (1 - (item.discount || 0) / 100),
            hygienistBonus: 0,
            qty: 1
        }));
    }
    renderBillingItemsTable();
    await refreshBillingLivePreview();

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
        let method = document.getElementById('bill-method').value;
        if (method === 'split') {
            const pmAmt = parseFloat(document.getElementById('billing-split-pagomovil').value) || 0;
            const cashAmt = parseFloat(document.getElementById('billing-split-cash').value) || 0;
            const zelleAmt = parseFloat(document.getElementById('billing-split-zelle').value) || 0;
            const binanceAmt = parseFloat(document.getElementById('billing-split-binance').value) || 0;

            const parts = [];
            if (pmAmt > 0) parts.push(`Pago Móvil: $${pmAmt.toFixed(2)}`);
            if (cashAmt > 0) parts.push(`Efectivo: $${cashAmt.toFixed(2)}`);
            if (zelleAmt > 0) parts.push(`Zelle: $${zelleAmt.toFixed(2)}`);
            if (binanceAmt > 0) parts.push(`Binance: $${binanceAmt.toFixed(2)}`);

            method = `Mixto (${parts.join(', ') || 'Sin distribución'})`;
        }
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
        if (!previewEl) return;

        const printClone = previewEl.cloneNode(true);
        const wrapper = document.createElement('div');
        wrapper.style.padding = '25px';
        wrapper.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        wrapper.style.lineHeight = '1.4';
        wrapper.appendChild(printClone);

        const filename = `Factura_${(activeBillingInvoice && activeBillingInvoice.id) || 'Digital'}.pdf`;
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
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.code}</strong></td>
            <td>${item.name}</td>
            <td>$${item.price.toFixed(2)}</td>
            <td>$${(item.hygienistBonus || 0).toFixed(2)}</td>
            <td><input type="number" min="1" value="${item.qty}" class="form-control" style="width:60px; padding:2px 6px;"></td>
            <td><strong>$${(item.price * item.qty).toFixed(2)}</strong></td>
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

    const elRef = document.getElementById('bill-total-ref');
    const elFinal = document.getElementById('bill-total-final');
    if (elRef) elRef.innerText = `$${totalRef.toFixed(2)}`;
    if (elFinal) {
        if (currency === 'REF') {
            elFinal.innerText = `$${totalRef.toFixed(2)} REF`;
        } else {
            elFinal.innerText = `Bs. ${totalBcv.toFixed(2)} BS`;
        }
    }

    if (window.updateBillingSplitStatusExternal) {
        window.updateBillingSplitStatusExternal();
    }

    refreshBillingLivePreview();
}

async function refreshBillingLivePreview() {
    const container = document.getElementById('invoice-paper-preview');
    if (!container) return;

    const patientSelect = document.getElementById('bill-patient-select');
    const assistantSelect = document.getElementById('bill-assistant');
    const currency = document.getElementById('bill-currency') ? document.getElementById('bill-currency').value : 'REF';
    const terms = document.getElementById('bill-terms') ? document.getElementById('bill-terms').value : 'Contado';
    const method = document.getElementById('bill-method') ? document.getElementById('bill-method').value : 'cash';
    const footerNote = document.getElementById('bill-footer-note') ? document.getElementById('bill-footer-note').value : '';

    const pId = patientSelect ? patientSelect.value : '';
    const patients = await SupabaseDataService.getPatients();
    let activePatient = patients.find(p => p.id === pId);
    if (!activePatient) {
        activePatient = patients.length > 0 ? patients[0] : { fullname: 'Nombre del Paciente', id: 'V-00000000', phone: '+58 414-0000000' };
    }

    const assistantId = assistantSelect ? assistantSelect.value : '';
    const users = await SupabaseDataService.getUsers();
    const selectedAssistant = users.find(u => u.id === assistantId);

    let totalRef = 0;
    billingItems.forEach(item => {
        totalRef += item.price * item.qty;
    });

    const rate = getExchangeRate();
    const totalBcv = totalRef * rate;

    const draftInvoice = {
        id: (activeBillingInvoice && activeBillingInvoice.id) || `FAC-2026-${Date.now().toString().slice(-4)}`,
        patientId: activePatient.id,
        invoiceDate: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        paymentMethod: method,
        paymentTerms: terms,
        currency: currency,
        items: billingItems.length > 0 ? billingItems : [
            { code: 'CONS-01', name: 'Consulta Diagnóstica / Evaluación Clínica Especializada', price: 30.00, qty: 1 }
        ],
        totalRef: billingItems.length > 0 ? totalRef : 30.00,
        totalBcv: (billingItems.length > 0 ? totalRef : 30.00) * rate,
        status: (activeBillingInvoice && activeBillingInvoice.id) ? 'Emitida' : 'Borrador / Previsualización',
        footerText: footerNote
    };

    await generateInvoicePreviewHTML(draftInvoice, activePatient, selectedAssistant);
}

async function generateInvoicePreviewHTML(invoice, patient, assistant) {
    const container = document.getElementById('invoice-paper-preview');
    if (!container) return;

    const stationery = await SupabaseDataService.getStationeryConfig();
    const busData = getClinicBusData(stationery);
    const logoBase64 = await toDataURL(busData.logoUrl || stationery.logoUrl);
    const rate = getExchangeRate();

    const isBs = invoice.currency === 'BS';

    const items = (invoice.items && invoice.items.length > 0)
        ? invoice.items.map(item => ({
            name: `${item.name} (${item.code})`,
            description: item.specialist ? `Especialista: ${item.specialist}` : 'Procedimiento odontológico facturado',
            qty: item.qty || 1,
            price: isBs ? (item.price || 0) * rate : (item.price || 0),
            total: isBs ? (item.price || 0) * (item.qty || 1) * rate : (item.price || 0) * (item.qty || 1)
        }))
        : [{
            name: 'Consulta Diagnóstica / Evaluación Clínica Especializada (CONS-01)',
            description: 'Procedimiento odontológico facturado',
            qty: 1,
            price: isBs ? 30.00 * rate : 30.00,
            total: isBs ? 30.00 * rate : 30.00
        }];

    const totalUSD = invoice.totalRef || 0;
    const totalVES = `Bs. ${(totalUSD * rate).toFixed(2)}`;

    let docSig = '';
    const u = getCurrentUser();
    if (u) {
        docSig = (u.doctorProfile && u.doctorProfile.signature) || (u.doctor_profile && u.doctor_profile.signature) || '';
    }

    const docHtml = buildMedicalDocumentHTML({
        docType: 'factura',
        docTitle: 'Factura Digital',
        emissionDate: invoice.invoiceDate || new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        controlNumber: invoice.id || `FC-2026-${Date.now().toString().slice(-6)}`,
        paymentMethod: `${invoice.paymentTerms || 'Contado'} / ${getPaymentMethodLabel(invoice.paymentMethod)}`,
        
        clinicName: busData.name,
        clinicPhone: busData.phone,
        clinicAddress: busData.address,
        logoUrl: logoBase64,
        
        doctorName: (getCurrentUser() && getCurrentUser().fullname) || busData.doctor || 'Dr. Rodrigo Navas',
        doctorSpecialty: 'Odontología General / Facturación Clínica',
        doctorPhone: (getCurrentUser() && getCurrentUser().phone) || busData.phone,
        doctorSig: docSig,
        
        patientName: (patient && patient.fullname) || 'Paciente',
        patientId: (patient && patient.id) || 'V-00000000',
        patientPhone: (patient && patient.phone) || '+58 414-0000000',
        patientSig: '',
        
        items: items,
        subtotalUSD: isBs ? totalUSD * rate : totalUSD,
        discountPct: 0,
        discountUSD: 0,
        taxUSD: 0,
        totalUSD: isBs ? totalUSD * rate : totalUSD,
        totalVES: totalVES,
        approvedAmountUSD: totalUSD,
        
        paymentTerms: `Términos: ${invoice.paymentTerms || 'Contado'}. Moneda de emisión: ${invoice.currency || 'REF'}. ${isBs ? `Tasa BCV aplicada: Bs. ${rate.toFixed(2)} / USD.` : ''}`,
        bankingDetails: busData.bankInfo,
        observations: invoice.footerText || 'El paciente presenta evolución favorable. Se recomienda mantener tratamiento y esquema preventivo indicado.',
        consentText: 'Por medio de la presente, el paciente declara haber recibido explicación clara y detallada acerca de los procedimientos facturados, expresando su conformidad con los cobros correspondientes.',
        footerNote: invoice.footerText || busData.footer
    });

    container.innerHTML = docHtml;
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

    const exportExcelBtn = document.getElementById('btn-export-finance-excel');
    if (exportExcelBtn) {
        exportExcelBtn.onclick = () => {
            exportFinanceCashFlowExcel();
        };
    }

    const exportPdfBtn = document.getElementById('btn-export-finance-pdf');
    if (exportPdfBtn) {
        exportPdfBtn.onclick = () => {
            exportFinanceCashFlowPDF();
        };
    }
}

async function exportFinanceCashFlowExcel() {
    try {
        if (!window.XLSX) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Librería XLSX no disponible.' });
            return;
        }

        const patients = await SupabaseDataService.getPatients();
        const bills = await SupabaseDataService.getProviderBills();
        const transfers = JSON.parse(localStorage.getItem('dental_account_transfers')) || [];

        // 1. Sheet Flujo de Caja
        const flowRows = [];
        patients.forEach(p => {
            (p.payments || []).forEach(pay => {
                if (pay.paidUSD > 0) {
                    flowRows.push({
                        "Fecha": pay.date,
                        "Tipo": "Ingreso",
                        "Concepto": `Abono: ${p.fullname} (${pay.concept})`,
                        "Método": pay.method ? getPaymentMethodLabel(pay.method) : 'Efectivo',
                        "Monto (USD)": pay.paidUSD
                    });
                }
            });
        });

        bills.forEach(bill => {
            if (bill.status === 'Pagado') {
                flowRows.push({
                    "Fecha": bill.dueDate,
                    "Tipo": "Egreso",
                    "Concepto": `Gasto / Proveedor: ${bill.providerName} (${bill.serviceName})`,
                    "Método": "Efectivo",
                    "Monto (USD)": -bill.amount
                });
            }
        });

        transfers.forEach(t => {
            flowRows.push({
                "Fecha": t.date,
                "Tipo": "Traslado",
                "Concepto": `Traslado: ${getPaymentMethodLabel(t.fromAccount)} a ${getPaymentMethodLabel(t.toAccount)} ${t.notes ? `(${t.notes})` : ''}`,
                "Método": `${getPaymentMethodLabel(t.fromAccount)} ➔ ${getPaymentMethodLabel(t.toAccount)}`,
                "Monto (USD)": t.amountSent
            });
        });

        flowRows.sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

        // 2. Sheet Cuentas por Cobrar
        const recRows = [];
        patients.forEach(p => {
            const pendings = (p.payments || []).filter(pay => pay.status === 'Pendiente' || pay.balanceUSD > 0);
            pendings.forEach(pay => {
                recRows.push({
                    "Cédula": p.id,
                    "Paciente": p.fullname,
                    "Teléfono": p.phone,
                    "Tratamiento / Concepto": pay.concept,
                    "Total (USD)": pay.totalUSD,
                    "Abonado (USD)": pay.paidUSD,
                    "Saldo Pendiente (USD)": pay.balanceUSD
                });
            });
        });

        // 3. Sheet Cuentas por Pagar
        const payRows = bills.map(b => ({
            "ID": b.id,
            "Proveedor": b.providerName,
            "Servicio / Concepto": b.serviceName,
            "Monto (USD)": b.amount,
            "Vencimiento": b.dueDate,
            "Estado": b.status
        }));

        const wb = XLSX.utils.book_new();
        const wsFlow = XLSX.utils.json_to_sheet(flowRows.length > 0 ? flowRows : [{ "Info": "Sin movimientos" }]);
        const wsRec = XLSX.utils.json_to_sheet(recRows.length > 0 ? recRows : [{ "Info": "Sin cuentas por cobrar" }]);
        const wsPay = XLSX.utils.json_to_sheet(payRows.length > 0 ? payRows : [{ "Info": "Sin cuentas por pagar" }]);

        XLSX.utils.book_append_sheet(wb, wsFlow, "Flujo_de_Caja");
        XLSX.utils.book_append_sheet(wb, wsRec, "Cuentas_por_Cobrar");
        XLSX.utils.book_append_sheet(wb, wsPay, "Cuentas_por_Pagar");

        const filename = `Reporte_Financiero_DentalCare_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, filename);

        Swal.fire({
            icon: 'success',
            title: '¡Reporte Excel Exportado!',
            text: `Se ha generado el archivo ${filename}`,
            timer: 2000,
            showConfirmButton: false
        });
    } catch(err) {
        console.error("Error exporting finance excel:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo exportar el reporte financiero.' });
    }
}

async function exportFinanceCashFlowPDF() {
    try {
        const stationery = await SupabaseDataService.getStationeryConfig();
        const busData = getClinicBusData(stationery);
        const patients = await SupabaseDataService.getPatients();
        const bills = await SupabaseDataService.getProviderBills();
        const transfers = JSON.parse(localStorage.getItem('dental_account_transfers')) || [];

        let inflows = 0;
        let outflows = 0;
        const transactions = [];

        patients.forEach(p => {
            (p.payments || []).forEach(pay => {
                if (pay.paidUSD > 0) {
                    inflows += pay.paidUSD;
                    transactions.push({
                        date: pay.date,
                        concept: `Abono: ${p.fullname} (${pay.concept})`,
                        type: 'Ingreso',
                        method: pay.method ? getPaymentMethodLabel(pay.method) : 'Efectivo',
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
                    concept: `Gasto: ${bill.providerName} (${bill.serviceName})`,
                    type: 'Egreso',
                    method: 'Efectivo',
                    amount: bill.amount
                });
            }
        });

        transfers.forEach(t => {
            transactions.push({
                date: t.date,
                concept: `Traslado: ${getPaymentMethodLabel(t.fromAccount)} a ${getPaymentMethodLabel(t.toAccount)}`,
                type: 'Traslado',
                method: `${getPaymentMethodLabel(t.fromAccount)} ➔ ${getPaymentMethodLabel(t.toAccount)}`,
                amount: t.amountSent
            });
        });

        transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
        const netBalance = inflows - outflows;

        let rowsHtml = '';
        transactions.forEach(t => {
            const color = t.type === 'Ingreso' ? '#059669' : (t.type === 'Egreso' ? '#dc2626' : '#7c3aed');
            const sign = t.type === 'Ingreso' ? '+' : (t.type === 'Egreso' ? '-' : '⇄ ');
            rowsHtml += `
                <tr style="border-bottom: 1px solid #e2e8f0; font-size: 0.85rem;">
                    <td style="padding: 8px 10px;">${t.date}</td>
                    <td style="padding: 8px 10px; font-weight: 600;">${t.concept}</td>
                    <td style="padding: 8px 10px; text-align: center;"><span style="color: ${color}; font-weight: 700;">${t.type}</span></td>
                    <td style="padding: 8px 10px;">${t.method}</td>
                    <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: ${color};">${sign}$${t.amount.toFixed(2)}</td>
                </tr>
            `;
        });

        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 25px; color: #1e293b; background: #ffffff;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0066f5; padding-bottom: 15px; margin-bottom: 20px;">
                    <div>
                        <h2 style="margin: 0; color: #0066f5; font-size: 1.4rem;">${busData.name || 'Consultorio Odontológico'}</h2>
                        <p style="margin: 3px 0; font-size: 0.85rem; color: #64748b;">RIF: ${busData.rif || 'N/A'} | Tel: ${busData.phone || 'N/A'}</p>
                    </div>
                    <div style="text-align: right;">
                        <h3 style="margin: 0; font-size: 1.1rem; color: #0f172a;">REPORTE DE FLUJO DE CAJA</h3>
                        <p style="margin: 3px 0; font-size: 0.8rem; color: #64748b;">Fecha de emisión: ${new Date().toLocaleDateString('es-ES')}</p>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 0.8rem; color: #166534; font-weight: 600;">INGRESOS TOTALES</span>
                        <h3 style="margin: 5px 0 0 0; color: #15803d; font-size: 1.3rem;">$${inflows.toFixed(2)}</h3>
                    </div>
                    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 0.8rem; color: #991b1b; font-weight: 600;">EGRESOS TOTALES</span>
                        <h3 style="margin: 5px 0 0 0; color: #b91c1c; font-size: 1.3rem;">$${outflows.toFixed(2)}</h3>
                    </div>
                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
                        <span style="font-size: 0.8rem; color: #1e40af; font-weight: 600;">BALANCE NETO</span>
                        <h3 style="margin: 5px 0 0 0; color: ${netBalance >= 0 ? '#1d4ed8' : '#b91c1c'}; font-size: 1.3rem;">$${netBalance.toFixed(2)}</h3>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #0066f5; color: #ffffff; font-size: 0.82rem; text-transform: uppercase;">
                            <th style="padding: 8px 10px; text-align: left;">Fecha</th>
                            <th style="padding: 8px 10px; text-align: left;">Concepto</th>
                            <th style="padding: 8px 10px; text-align: center;">Tipo</th>
                            <th style="padding: 8px 10px; text-align: left;">Método</th>
                            <th style="padding: 8px 10px; text-align: right;">Monto</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding: 15px;">Sin transacciones</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;

        const filename = `Reporte_Flujo_Caja_${new Date().toISOString().split('T')[0]}.pdf`;
        generatePDFFromElement(wrapper, filename);
    } catch(err) {
        console.error("Error generating finance PDF:", err);
    }
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
        'binance': 0,
        'punto': 0
    };

    patients.forEach(p => {
        (p.payments || []).forEach(pay => {
            if (pay.paidUSD > 0) {
                inflows += pay.paidUSD;
                
                // Map and track breakdown totals
                const m = pay.method ? pay.method.toLowerCase() : 'cash';
                if (m === 'split' && pay.splitPayments) {
                    for (const sm in pay.splitPayments) {
                        const subAmt = parseFloat(pay.splitPayments[sm]) || 0;
                        const cleanSm = sm.toLowerCase();
                        if (methodTotals[cleanSm] !== undefined) {
                            methodTotals[cleanSm] += subAmt;
                        } else {
                            methodTotals['cash'] += subAmt;
                        }
                    }
                } else if (methodTotals[m] !== undefined) {
                    methodTotals[m] += pay.paidUSD;
                } else {
                    // Backwards compatibility mapping for old records
                    if (m.includes('dólar') || m.includes('usd') || m.includes('efectivo') || m === 'dólares') {
                        methodTotals['cash'] += pay.paidUSD;
                    } else if (m.includes('bs') || m.includes('pago') || m.includes('transferencia')) {
                        methodTotals['pagomovil'] += pay.paidUSD;
                    } else if (m.includes('zelle')) {
                        methodTotals['zelle'] += pay.paidUSD;
                    } else if (m.includes('binance')) {
                        methodTotals['binance'] += pay.paidUSD;
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

    // Account Transfers (Traslados entre cuentas)
    const transfers = JSON.parse(localStorage.getItem('dental_account_transfers')) || [];
    transfers.forEach(t => {
        const fromM = (t.fromAccount || '').toLowerCase();
        const toM = (t.toAccount || '').toLowerCase();
        const amountSent = parseFloat(t.amountSent) || 0;
        const amountReceived = parseFloat(t.amountReceived) || 0;

        if (methodTotals[fromM] !== undefined) {
            methodTotals[fromM] -= amountSent;
        }
        if (methodTotals[toM] !== undefined) {
            methodTotals[toM] += amountReceived;
        }

        transactions.push({
            id: t.id,
            date: t.date,
            concept: `Traslado Interno: De ${getPaymentMethodLabel(fromM)} a ${getPaymentMethodLabel(toM)} ${t.notes ? `(${t.notes})` : ''}`,
            type: 'Traslado',
            method: `${getPaymentMethodLabel(fromM)} ➔ ${getPaymentMethodLabel(toM)}`,
            amount: amountSent,
            isTransfer: true
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
        let typeClass = 'text-green';
        let typeBadge = '<span class="badge-tag green">Ingreso</span>';
        let sign = '+';

        if (t.type === 'Egreso') {
            typeClass = 'text-red';
            typeBadge = '<span class="badge-tag red">Egreso</span>';
            sign = '-';
        } else if (t.type === 'Traslado') {
            typeClass = 'text-blue';
            typeBadge = '<span class="badge-tag blue" style="background: rgba(124, 58, 237, 0.1); color: #7c3aed;">Traslado</span>';
            sign = '⇄ ';
        }

        const deleteTransferBtn = t.isTransfer ? `<button class="btn btn-xs btn-outline text-red" style="margin-left:6px; padding:2px 6px;" onclick="deleteAccountTransfer('${t.id}')" title="Eliminar Traslado"><i class="fa-solid fa-trash"></i></button>` : '';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td><strong>${t.concept}</strong> ${deleteTransferBtn}</td>
            <td>${typeBadge}</td>
            <td>${t.method}</td>
            <td class="${typeClass}"><strong>${sign}$${t.amount.toFixed(2)}</strong></td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteAccountTransfer = async function(transferId) {
    const { value: confirm } = await Swal.fire({
        title: '¿Revertir traslado?',
        text: '¿Desea eliminar este registro de traslado entre cuentas?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444'
    });

    if (confirm) {
        let transfers = JSON.parse(localStorage.getItem('dental_account_transfers')) || [];
        transfers = transfers.filter(t => t.id !== transferId);
        localStorage.setItem('dental_account_transfers', JSON.stringify(transfers));
        await renderCashFlow();
        Swal.fire({ icon: 'success', title: 'Traslado revertido', timer: 1500, showConfirmButton: false });
    }
};

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

        applyClinicBrandingUI({
            headerText,
            footerText,
            logoUrl
        });

        renderBudgetTable();

        Swal.fire({ icon: 'success', title: 'Configuración guardada', text: 'Se actualizaron el logo, nombre clínico y membretes en el sistema.', timer: 2000, showConfirmButton: false });
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

    const btnPrintStationery = document.getElementById('btn-print-preview-stationery');
    if (btnPrintStationery) {
        btnPrintStationery.onclick = () => {
            const previewEl = document.getElementById('stationery-live-paper');
            if (!previewEl) return;
            const printClone = previewEl.cloneNode(true);
            printClone.style.height = 'auto';
            printClone.style.maxHeight = 'none';
            printClone.style.overflow = 'visible';
            printClone.style.border = 'none';
            printClone.style.boxShadow = 'none';
            document.body.appendChild(printClone);
            printClone.classList.add('print-section');
            window.print();
            document.body.removeChild(printClone);
        };
    }

    const btnPdfStationery = document.getElementById('btn-pdf-preview-stationery');
    if (btnPdfStationery) {
        btnPdfStationery.onclick = async () => {
            const previewEl = document.getElementById('stationery-live-paper');
            if (!previewEl) return;

            const printClone = previewEl.cloneNode(true);
            printClone.style.height = 'auto';
            printClone.style.maxHeight = 'none';
            printClone.style.overflow = 'visible';
            printClone.style.border = 'none';
            printClone.style.boxShadow = 'none';
            printClone.style.padding = '0';
            printClone.style.background = '#ffffff';

            const templateName = (currentPreviewTemplate || 'documento').toUpperCase();
            const filename = `Papeleria_${templateName}.pdf`;
            await generatePDFFromElement(printClone, filename);
        };
    }
}

async function refreshStationeryLivePreview() {
    const container = document.getElementById('stationery-live-paper');
    if (!container) return;

    const logoSrc = document.getElementById('stat-logo-preview-img').src || '';
    const headerText = document.getElementById('stat-header-text').value;
    const footerText = document.getElementById('stat-footer-text').value;

    const busData = getClinicBusData({ header_text: headerText, logo_url: logoSrc, footer_text: footerText });
    const logoBase64 = await toDataURL(busData.logoUrl || logoSrc);

    let docHtml = '';

    if (currentPreviewTemplate === 'factura') {
        docHtml = buildMedicalDocumentHTML({
            docType: 'factura',
            docTitle: 'Factura Digital',
            emissionDate: '20 de Octubre de 2026',
            controlNumber: 'FC-2026-00892',
            paymentMethod: 'Transferencia / PAGO MÓVIL',
            
            clinicName: busData.name || 'Consultorio Médico',
            clinicPhone: busData.phone || '+58 (412) 555-0192',
            clinicAddress: busData.address || 'Av. Principal de Las Mercedes, Torre Consultorios, Piso 4, Off. 4B, Caracas',
            logoUrl: logoBase64,
            
            doctorName: busData.doctor || 'Dr. Rodrigo Navas',
            doctorSpecialty: 'Medicina General / Cardiología',
            doctorPhone: '+58 (414) 123-4567',
            
            patientName: 'Carlos Eduardo Mendoza',
            patientId: 'V-18.452.910',
            patientPhone: '+58 (416) 987-6543',
            
            items: [
                { name: 'Consulta Médica Especializada', description: 'Evaluación clínica integral y revisión de antecedentes', qty: 1, price: 60.00, total: 60.00 },
                { name: 'Electrocardiograma de Reposo', description: 'Trazo e informe médico detallado', qty: 1, price: 35.00, total: 35.00 },
                { name: 'Control y Monitoreo de Presión Arterial', description: 'Toma de tensión y esquema preventivo', qty: 1, price: 15.00, total: 15.00 }
            ],
            
            subtotalUSD: 110.00,
            discountPct: 0,
            discountUSD: 0.00,
            taxUSD: 0.00,
            totalUSD: 110.00,
            totalVES: 'Bs. 4.015,00',
            approvedAmountUSD: 110.00,
            
            paymentTerms: 'Contado / Pago inmediato al momento de la consulta.',
            bankingDetails: busData.bankInfo || 'Banco Banesco - Cuenta Corriente | N°: 0134-0000-00-0000000000<br>A nombre de: Rodrigo Navas<br>Pago Móvil: C.I. 12.345.678 / Tlf: 0412-5550192',
            observations: 'El paciente presenta evolución favorable. Se recomienda mantener tratamiento farmacológico indicado según informe médico, evitar esfuerzos físicos intensos durante las próximas 48 horas y acudir a control preventivo en 30 días o antes en caso de manifestar cualquier síntoma atípico.',
            consentText: 'Por medio de la presente, el paciente declara haber recibido explicación clara y detallada acerca de los procedimientos diagnosticados y realizados en esta consulta, aceptando de manera voluntaria la atención prestada y expresando su conformidad con los cobros administrativos y honorarios detallados en este documento.',
            footerNote: footerText || busData.footer
        });
    } else if (currentPreviewTemplate === 'cotizacion') {
        docHtml = buildMedicalDocumentHTML({
            docType: 'presupuesto',
            docTitle: 'Presupuesto Odontológico',
            emissionDate: '20 de Octubre de 2026',
            controlNumber: 'PR-2026-00341',
            paymentMethod: 'Por Sesiones / Efectivo USD',
            
            clinicName: busData.name || 'Consultorio Odontológico Especializado',
            clinicPhone: busData.phone || '+58 (412) 555-0192',
            clinicAddress: busData.address || 'Av. Principal de Las Mercedes, Torre Consultorios, Piso 4, Caracas',
            logoUrl: logoBase64,
            
            doctorName: busData.doctor || 'Dr. Rodrigo Navas',
            doctorSpecialty: 'Odontología Estética y Rehabilitación Oral',
            doctorPhone: '+58 (414) 123-4567',
            
            patientName: 'Carlos Eduardo Mendoza',
            patientId: 'V-18.452.910',
            patientPhone: '+58 (416) 987-6543',
            
            items: [
                { name: 'Limpieza Ultrasonica + Profilaxis (General)', description: 'Eliminación de cálculo dental y pulido coronario', qty: 1, price: 40.00, total: 40.00 },
                { name: 'Restauración Resina Estética (Pieza 16 - Oclusal)', description: 'Obturación fotocurada con estratificación anatómica', qty: 1, price: 45.00, total: 45.00 },
                { name: 'Corona de Zirconio Monolítico (Pieza 24)', description: 'Diseño CAD/CAM de alta resistencia y estética', qty: 1, price: 180.00, total: 180.00 }
            ],
            
            subtotalUSD: 265.00,
            discountPct: 5,
            discountUSD: 13.25,
            taxUSD: 0.00,
            totalUSD: 251.75,
            totalVES: 'Bs. 9.188,88',
            approvedAmountUSD: 251.75,
            
            paymentTerms: 'Validez del presupuesto: 15 días continuos. Financiable en 3 cuotas durante el tratamiento.',
            bankingDetails: busData.bankInfo,
            observations: 'Plan integral de rehabilitación oral. Se sugiere comenzar con la fase higiénica antes de la cementación de la prótesis definitiva.',
            consentText: 'Por medio de la presente, el paciente autoriza el plan de tratamiento propuesto y acepta las condiciones económicas y clínicas estipuladas.',
            footerNote: footerText || busData.footer
        });
    } else if (currentPreviewTemplate === 'recibo') {
        docHtml = buildMedicalDocumentHTML({
            docType: 'recibo',
            docTitle: 'Recibo de Atención Clínica',
            emissionDate: '20 de Octubre de 2026',
            controlNumber: 'REC-2026-00215',
            paymentMethod: 'Transferencia / PAGO MÓVIL',
            
            clinicName: busData.name || 'Consultorio Odontológico',
            clinicPhone: busData.phone || '+58 (412) 555-0192',
            clinicAddress: busData.address || 'Av. Principal de Las Mercedes, Torre Consultorios, Piso 4, Caracas',
            logoUrl: logoBase64,
            
            doctorName: busData.doctor || 'Dr. Rodrigo Navas',
            doctorSpecialty: 'Odontología General / Periodoncia',
            doctorPhone: '+58 (414) 123-4567',
            
            patientName: 'Carlos Eduardo Mendoza',
            patientId: 'V-18.452.910',
            patientPhone: '+58 (416) 987-6543',
            
            items: [
                { name: 'Sesión Clínica #1: Limpieza Ultrasonica + Profilaxis', description: 'Tratamiento completado y conforme en la consulta', qty: 1, price: 40.00, total: 40.00 }
            ],
            
            subtotalUSD: 40.00,
            discountPct: 0,
            discountUSD: 0.00,
            taxUSD: 0.00,
            totalUSD: 40.00,
            totalVES: 'Bs. 1.460,00',
            approvedAmountUSD: 40.00,
            
            paymentTerms: 'Abono / Pago acreditado en sesión clínica. Comprobante legal de cancelación.',
            bankingDetails: busData.bankInfo,
            observations: 'Paciente atendido satisfactoriamente. Se indican enjuagues con clorhexidina 0.12% por 7 días.',
            consentText: 'Por medio de la presente, el paciente declara conformidad total con la sesión atendida y el monto cancelado en la fecha.',
            footerNote: footerText || busData.footer
        });
    }

    container.innerHTML = docHtml;
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
    element.style.position = 'relative';
    element.style.width = '780px';
    element.style.margin = '20px auto';
    element.style.backgroundColor = '#ffffff';
    element.style.color = '#1e293b';
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.padding = '20px';
    element.style.boxSizing = 'border-box';

    document.body.appendChild(element);

    Swal.fire({
        title: 'Generando Documento PDF...',
        html: `
            <div style="margin-bottom: 10px; font-weight: bold; color: #0284c7;">
                <i class="fa-solid fa-circle-notch fa-spin"></i> Compilando firmas, historial clínico y abonos...
            </div>
            <div style="font-size: 0.8rem; color: #64748b;">
                Generando documento en alta resolución. Por favor espere.
            </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();

            setTimeout(async () => {
                try {
                    if (typeof window.html2pdf === 'function') {
                        const opt = {
                            margin: [10, 10, 10, 10],
                            filename: filename,
                            image: { type: 'jpeg', quality: 0.98 },
                            html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff', logging: false },
                            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        };
                        await window.html2pdf().set(opt).from(element).save();
                    } else {
                        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
                        if (!jsPDFClass || !window.html2canvas) {
                            throw new Error("Librerías de PDF no disponibles en el navegador");
                        }
                        const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                        const imgString = canvas.toDataURL('image/jpeg', 0.95);
                        const pdf = new jsPDFClass('p', 'mm', 'a4');
                        const imgWidth = 210;
                        const imgHeight = (canvas.height * imgWidth) / canvas.width;
                        pdf.addImage(imgString, 'JPEG', 0, 0, imgWidth, imgHeight);
                        pdf.save(filename);
                    }

                    try { document.body.removeChild(element); } catch (e) {}
                    Swal.close();
                    Swal.fire({ icon: 'success', title: '¡PDF Descargado!', text: 'El expediente se ha guardado exitosamente en su dispositivo.', timer: 2200, showConfirmButton: false });

                } catch (err) {
                    console.error("PDF generation failure:", err);
                    try {
                        document.body.removeChild(element);
                    } catch (e) {}
                    Swal.close();

                    // Fallback to Native Print/Save Window
                    Swal.fire({
                        icon: 'info',
                        title: 'Ventana de Impresión / Guardar PDF',
                        text: `Abriendo vista de impresión para guardar como PDF...`,
                        confirmButtonText: 'Abrir'
                    }).then(() => {
                        const printWindow = window.open('', '_blank');
                        if (printWindow) {
                            printWindow.document.write(`
                                <html>
                                    <head>
                                        <title>${filename}</title>
                                        <style>
                                            body { margin: 30px; font-family: 'Inter', Arial, sans-serif; background: #fff; color: #000; }
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
                                        <\/script>
                                    </body>
                                </html>
                            `);
                            printWindow.document.close();
                        } else {
                            Swal.fire({
                                icon: 'error',
                                title: 'Bloqueador de Ventanas Activo',
                                text: 'Por favor permita las ventanas emergentes en este sitio.'
                            });
                        }
                    });
                }
            }, 600);
        }
    });
}

window.generateSessionReceiptHTML = (patient, sessionObj, busData) => {
    const rate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
    const totalUSD = sessionObj.paymentUSD || 0;
    const totalVES = totalUSD > 0 ? `Bs. ${(totalUSD * rate).toFixed(2)}` : '';

    let paymentDetail = sessionObj.paymentMethodLabel || 'Efectivo';
    if (sessionObj.paymentMethod === 'split' && sessionObj.splitPayments) {
        const parts = [];
        if (sessionObj.splitPayments.cash > 0) parts.push(`Efectivo: $${sessionObj.splitPayments.cash.toFixed(2)}`);
        if (sessionObj.splitPayments.pagomovil > 0) parts.push(`Pago Móvil: $${sessionObj.splitPayments.pagomovil.toFixed(2)}`);
        if (sessionObj.splitPayments.zelle > 0) parts.push(`Zelle: $${sessionObj.splitPayments.zelle.toFixed(2)}`);
        if (sessionObj.splitPayments.binance > 0) parts.push(`Binance: $${sessionObj.splitPayments.binance.toFixed(2)}`);
        if (sessionObj.splitPayments.punto > 0) parts.push(`Punto: $${sessionObj.splitPayments.punto.toFixed(2)}`);
        if (parts.length > 0) paymentDetail = `Pago Mixto (${parts.join(', ')})`;
    }

    const items = [
        {
            name: `Sesión Clínica #${sessionObj.sessionNum}: ${sessionObj.procedure}`,
            description: sessionObj.indications ? `Indicaciones: ${sessionObj.indications}` : 'Atención y evolución odontológica efectuada',
            qty: 1,
            price: totalUSD,
            total: totalUSD
        }
    ];

    let docSig = '';
    const u = getCurrentUser();
    if (u) {
        docSig = (u.doctorProfile && u.doctorProfile.signature) || (u.doctor_profile && u.doctor_profile.signature) || '';
    }

    return buildMedicalDocumentHTML({
        docType: 'recibo',
        docTitle: 'Recibo de Atención Clínica',
        emissionDate: sessionObj.datetime ? sessionObj.datetime.split('T')[0] : new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }),
        controlNumber: `SESS-${sessionObj.sessionNum}-${Date.now().toString().slice(-6)}`,
        paymentMethod: paymentDetail,
        
        clinicName: busData.name || 'Consultorio Odontológico',
        clinicPhone: busData.phone || '+58 (412) 555-0192',
        clinicAddress: busData.address || 'Av. Principal, Torre Consultorios, Caracas',
        logoUrl: busData.logoUrl || '',
        
        doctorName: (getCurrentUser() && getCurrentUser().fullname) || busData.doctor || 'Dr. Rodrigo Navas',
        doctorSpecialty: 'Odontología General / Rehabilitación Oral',
        doctorPhone: (getCurrentUser() && getCurrentUser().phone) || busData.phone,
        doctorSig: docSig,
        
        patientName: patient.fullname,
        patientId: patient.id,
        patientPhone: patient.phone,
        patientSig: sessionObj.signatureData || '',
        
        items: items,
        subtotalUSD: totalUSD,
        discountPct: 0,
        discountUSD: 0,
        taxUSD: 0,
        totalUSD: totalUSD,
        totalVES: totalVES,
        approvedAmountUSD: totalUSD,
        
        paymentTerms: `Abono registrado en Sesión #${sessionObj.sessionNum}. Comprobante de atención y constancia de pago.`,
        bankingDetails: busData.bankInfo,
        observations: sessionObj.indications ? `Indicaciones del Especialista:\n${sessionObj.indications}` : 'El paciente fue atendido conforme al protocolo clínico correspondiente.',
        consentText: 'Por medio de la presente, el paciente declara haber recibido a entera conformidad la atención odontológica y autoriza el registro de la sesión.',
        footerNote: busData.footer
    });
};

window.printSessionReceipt = async (patient, sessionObj) => {
    let config = null;
    try {
        config = await SupabaseDataService.getStationeryConfig();
    } catch(e) {
        console.error(e);
    }
    let busData = { name: '', rif: '', phone: '', email: '', address: '', logoUrl: '' };
    if (config) {
        try {
            busData = JSON.parse(config.header_text);
        } catch(e) {
            busData.name = config.header_text;
        }
        busData.logoUrl = config.logo_url || '';
    }

    const htmlContent = window.generateSessionReceiptHTML(patient, sessionObj, busData);

    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.write(`
            <html>
            <head>
                <title>Comprobante de Sesión - ${patient.fullname}</title>
                <style>
                    body { margin: 0; padding: 0; background: #fff; }
                </style>
            </head>
            <body onload="window.print(); window.close();">
                ${htmlContent}
            </body>
            </html>
        `);
        printWin.document.close();
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Bloqueador de Ventanas Activo',
            text: 'Por favor permite las ventanas emergentes en este sitio para imprimir.'
        });
    }
};

window.downloadSessionReceiptPDF = async (patient, sessionObj) => {
    let config = null;
    try {
        config = await SupabaseDataService.getStationeryConfig();
    } catch(e) {
        console.error(e);
    }
    let busData = { name: '', rif: '', phone: '', email: '', address: '', logoUrl: '' };
    if (config) {
        try {
            busData = JSON.parse(config.header_text);
        } catch(e) {
            busData.name = config.header_text;
        }
        busData.logoUrl = config.logo_url || '';
    }

    const htmlContent = window.generateSessionReceiptHTML(patient, sessionObj, busData);

    const element = document.createElement('div');
    element.innerHTML = htmlContent;
    document.body.appendChild(element);

    const opt = {
        margin: 10,
        filename: `Comprobante_Sesion_${sessionObj.sessionNum}_${patient.fullname.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        if (typeof html2pdf !== 'undefined') {
            await html2pdf().from(element).set(opt).save();
        } else {
            Swal.fire({ icon: 'warning', title: 'Librería PDF no cargada', text: 'No se pudo descargar el PDF automáticamente, pero se abrirá el cuadro de impresión.' });
            window.printSessionReceipt(patient, sessionObj);
        }
    } catch (err) {
        console.error("Error generating session PDF:", err);
    } finally {
        document.body.removeChild(element);
    }
};

async function renderAttendedPatientsModal(dateStr) {
    const tbody = document.getElementById('attended-details-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';
    
    try {
        const allPatients = await SupabaseDataService.getPatients();
        const records = [];

        allPatients.forEach(p => {
            // Check sessions
            if (p.sessions && p.sessions.length > 0) {
                p.sessions.forEach(s => {
                    if (s.datetime && s.datetime.startsWith(dateStr)) {
                        const timePart = s.datetime.slice(11).trim() || 'N/A';
                        records.push({
                            id: p.id,
                            name: p.fullname,
                            time: timePart,
                            type: 'Evolución de Sesión',
                            details: `Sesión N° ${s.sessionNum}: ${s.procedure}`
                        });
                    }
                });
            }
            // Check clinicalNotes
            if (p.clinicalNotes && p.clinicalNotes.length > 0) {
                p.clinicalNotes.forEach(n => {
                    const cleanDt = n.datetime.replace('T', ' ');
                    if (cleanDt.startsWith(dateStr)) {
                        const timePart = cleanDt.slice(11).trim() || 'N/A';
                        records.push({
                            id: p.id,
                            name: p.fullname,
                            time: timePart,
                            type: 'Nota Clínica / Evolución',
                            details: n.content
                        });
                    }
                });
            }
        });

        // Sort by time ascending
        records.sort((a, b) => a.time.localeCompare(b.time));

        tbody.innerHTML = '';
        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No se registraron pacientes atendidos en esta fecha.</td></tr>';
            return;
        }

        records.forEach(rec => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${rec.id}</strong></td>
                <td><strong>${rec.name}</strong></td>
                <td><i class="fa-solid fa-clock text-blue"></i> ${rec.time}</td>
                <td><span class="badge-tag ${rec.type.includes('Sesión') ? 'green' : 'blue'}">${rec.type}</span></td>
                <td><small style="font-size:0.8rem; color:var(--text-muted);">${rec.details}</small></td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Error loading attended patients modal table:", err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red">Error al cargar datos de pacientes.</td></tr>';
    }
}

async function renderPublicBudgetView() {
    const urlParams = new URLSearchParams(window.location.search);
    const patientId = urlParams.get('patientId');
    const budgetId = urlParams.get('budgetId');

    const publicScreen = document.getElementById('public-budget-screen');
    const publicContent = document.getElementById('public-budget-content');

    if (!publicScreen || !publicContent) return;

    publicScreen.classList.remove('hidden');
    publicContent.innerHTML = '<div style="padding:40px; text-align:center;"><i class="fa-solid fa-arrows-rotate fa-spin" style="font-size:2rem; color:var(--primary-cyan);"></i><br><br>Cargando presupuesto...</div>';

    try {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient) {
            publicContent.innerHTML = '<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>No se encontró el paciente en el sistema.</div>';
            return;
        }

        const invoices = await SupabaseDataService.getInvoices();
        const budget = invoices.find(inv => inv.id === budgetId || (inv.patientId === patientId && inv.id.startsWith('PRE-')));
        
        if (!budget) {
            publicContent.innerHTML = '<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>No se encontró ningún presupuesto activo para este paciente.</div>';
            return;
        }

        // Convert logo URL to Base64 for local PDF rendering
        let logoBase64 = '';
        const stationery = await SupabaseDataService.getStationeryConfig();
        if (stationery && stationery.logo_url) {
            try {
                logoBase64 = stationery.logo_url; // Use logo URL directly
            } catch (logoErr) {
                console.warn("Logo load warning:", logoErr);
            }
        }

        const rate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;

        let subtotalUSD = 0;
        budget.items.forEach(item => subtotalUSD += item.price || 0);

        const discountPct = budget.metadata && budget.metadata.discountPct ? parseFloat(budget.metadata.discountPct) : 0;
        const discountAmountUSD = subtotalUSD * (discountPct / 100);
        const totalUSD = subtotalUSD - discountAmountUSD;

        const subtotalVES = (subtotalUSD * rate).toFixed(2);
        const discountVES = (discountAmountUSD * rate).toFixed(2);
        const totalVES = (totalUSD * rate).toFixed(2);

        let itemsHtml = '';
        budget.items.forEach(item => {
            itemsHtml += `
                <tr style="border-bottom: 1px dashed #cbd5e1; font-size: 0.85rem;">
                    <td style="padding: 10px 0;">Pieza ${item.tooth || 'Gnl'} (${item.face || 'Gnl'})</td>
                    <td style="padding: 10px 0;"><strong>${item.name}</strong></td>
                    <td style="padding: 10px 0;">${item.specialist || '-'}</td>
                    <td style="padding: 10px 0; font-weight: 600;">$${item.price.toFixed(2)} USD</td>
                    <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #1e3a8a;">Bs. ${(item.price * rate).toFixed(2)}</td>
                </tr>
            `;
        });

        let busData = { name: 'Consultorio Odontológico', rif: '', phone: '', email: '', address: '' };
        if (stationery && stationery.header_text) {
            try {
                busData = JSON.parse(stationery.header_text);
            } catch(e) {
                busData.name = stationery.header_text;
            }
        }

        let patientFiliation = `Cédula / ID: ${patient.id}`;
        if (patient.phone) patientFiliation += ` | Tel: ${patient.phone}`;

        let docSignatureHtml = '';
        if (budget.metadata && budget.metadata.doctorSig) {
            docSignatureHtml = `<img src="${budget.metadata.doctorSig}" style="max-height: 70px; border-bottom: 1px solid #94a3b8; display:block; margin:0 auto 4px auto;" alt="Firma Odontólogo"><span style="font-size:0.75rem; color:#64748b;">Firma Odontólogo</span>`;
        } else {
            docSignatureHtml = `<div style="height: 70px; border-bottom: 1px solid #94a3b8; margin-bottom: 4px;"></div><span style="font-size:0.75rem; color:#64748b;">Firma Odontólogo</span>`;
        }

        let patSignatureHtml = '';
        if (budget.metadata && budget.metadata.patientSig) {
            patSignatureHtml = `<img src="${budget.metadata.patientSig}" style="max-height: 70px; border-bottom: 1px solid #94a3b8; display:block; margin:0 auto 4px auto;" alt="Firma Paciente"><span style="font-size:0.75rem; color:#64748b;">Firma Paciente</span>`;
        } else {
            patSignatureHtml = `<div style="height: 70px; border-bottom: 1px solid #94a3b8; margin-bottom: 4px;"></div><span style="font-size:0.75rem; color:#64748b;">Firma Paciente</span>`;
        }

        let notesHtml = '';
        if (budget.footerText) {
            notesHtml = `
                <div style="margin-top: 25px; border-top: 1px solid #cbd5e1; padding-top: 15px; text-align: left;">
                    <h5 style="margin: 0 0 6px 0; color: #0f172a; font-size: 0.85rem; text-transform: uppercase; font-weight:700;">Observaciones Clínicas / Condiciones:</h5>
                    <p style="margin: 0; font-size: 0.85rem; color: #475569; line-height: 1.45; white-space: pre-wrap;">${budget.footerText}</p>
                </div>
            `;
        }

        let consentHtml = '';
        if (budget.metadata && budget.metadata.consentText) {
            consentHtml = `
                <div style="margin-top: 20px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; font-size: 0.78rem; color: #475569; line-height: 1.45; text-align: left;">
                    <strong>Consentimiento Informado:</strong> ${budget.metadata.consentText}
                </div>
            `;
        }

        const html = `
            <div style="font-family: 'Inter', system-ui, sans-serif; color: #1e293b; padding: 10px;">
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #06b6d4; padding-bottom: 15px; margin-bottom: 25px; align-items: flex-start; text-align: left;">
                    <div>
                        ${logoBase64 ? `<img src="${logoBase64}" style="max-height: 60px; margin-bottom: 10px; display: block;" alt="Logo Clinic">` : ''}
                        <h2 style="margin: 0; font-size: 1.3rem; color: #0f172a; font-weight: 800;">${busData.name || 'Consultorio Odontológico'}</h2>
                        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #64748b;">
                            ${busData.rif ? `RIF: ${busData.rif} | ` : ''} 
                            ${busData.phone ? `Tlf: ${busData.phone} | ` : ''} 
                            ${busData.email ? `Email: ${busData.email}` : ''}
                        </p>
                        ${busData.address ? `<p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #64748b;">${busData.address}</p>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <span style="background: rgba(6, 182, 212, 0.1); color: #0891b2; font-weight: 800; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; text-transform: uppercase; display: inline-block; margin-bottom: 8px;">PRESUPUESTO</span>
                        <p style="margin: 0; font-size: 0.95rem; font-weight: 800; color: #0f172a;">N° Control: ${budget.id}</p>
                        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #64748b;">Fecha Emisión: ${budget.invoiceDate}</p>
                    </div>
                </div>

                <!-- INFO PATIENT -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 0.85rem; text-align: left;">
                    <div>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 4px;">Paciente:</span>
                        <strong style="font-size: 1rem; color: #0f172a;">${patient.fullname}</strong>
                        <span style="display: block; color: #475569; margin-top: 4px;">${patientFiliation}</span>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 800; text-transform: uppercase; display: block; margin-bottom: 4px;">Términos de Pago:</span>
                        <strong>Contado</strong>
                        <span style="display: block; color: #475569; margin-top: 4px;">Método: ${budget.paymentMethod || 'Pago Móvil'}</span>
                    </div>
                </div>

                <!-- TABLE ITEMS -->
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; margin-bottom: 25px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: 700; text-transform: uppercase; font-size: 0.75rem;">
                            <th style="padding: 10px 0; width: 15%;">Pieza</th>
                            <th style="padding: 10px 0; width: 45%;">Procedimiento</th>
                            <th style="padding: 10px 0; width: 20%;">Especialista</th>
                            <th style="padding: 10px 0; width: 10%;">Precio Ref.</th>
                            <th style="padding: 10px 0; width: 10%; text-align: right;">Monto (Bs)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <!-- TOTALS -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
                    <div style="width: 290px; font-size: 0.85rem; text-align: right;">
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #475569;">
                            <span>Subtotal:</span>
                            <span>$${subtotalUSD.toFixed(2)} USD</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; color: #dc2626; font-weight: 600;">
                            <span>Descuento (${discountPct}%):</span>
                            <span>-$${discountAmountUSD.toFixed(2)} USD</span>
                        </div>
                        <div style="border-top: 1px solid #cbd5e1; margin: 6px 0;"></div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: 800; font-size: 0.95rem; color: #0f172a;">
                            <span>Total Final USD:</span>
                            <span>$${totalUSD.toFixed(2)} USD</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: 800; font-size: 1rem; color: #0891b2;">
                            <span>Total Bolívares (BCV):</span>
                            <span>Bs. ${totalVES} Bs</span>
                        </div>
                    </div>
                </div>

                <!-- SIGNATURES -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center;">
                    <div>${docSignatureHtml}</div>
                    <div>${patSignatureHtml}</div>
                </div>

                <!-- CONSENT AND FOOTER NOTES -->
                ${consentHtml}
                ${notesHtml}

                <!-- PIE DE PÁGINA OFICIAL DE PAPELERÍA -->
                ${(stationery && (stationery.footer_text || stationery.footerText)) ? `
                    <div style="margin-top: 25px; border-top: 1px dashed #cbd5e1; padding-top: 12px; text-align: center; font-size: 0.76rem; color: #64748b; font-style: italic; line-height: 1.4;">
                        ${stationery.footer_text || stationery.footerText}
                    </div>
                ` : ''}
            </div>
        `;

        publicContent.innerHTML = html;

        // Hook up print & download
        document.getElementById('btn-public-print').onclick = () => window.print();
        document.getElementById('btn-public-download-pdf').onclick = async () => {
            const clone = publicContent.cloneNode(true);
            const filename = `Presupuesto_${budget.id}_${patient.fullname.replace(/\s+/g, '_')}.pdf`;
            await generatePDFFromElement(clone, filename);
        };

    } catch (err) {
        console.error("Error displaying public budget view:", err);
        publicContent.innerHTML = `<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>Error al recuperar el presupuesto del servidor.</div>`;
    }
}

window.sendSessionReceiptWhatsApp = async function(patientId, sessionNum) {
    try {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient || !patient.sessions) {
            Swal.fire({ icon: 'error', text: 'No se encontró la sesión del paciente.' });
            return;
        }

        const sessionObj = patient.sessions.find(s => s.sessionNum === sessionNum);
        if (!sessionObj) {
            Swal.fire({ icon: 'error', text: 'Sesión no encontrada.' });
            return;
        }

        if (!patient.phone) {
            Swal.fire({ icon: 'warning', text: 'El paciente no tiene un número de teléfono registrado.' });
            return;
        }

        const receiptUrl = `${window.location.origin}/?patientId=${patient.id}&view=receipt&sessionNum=${sessionNum}`;
        const msg = WhatsAppService.generateSessionReceiptMessage(patient, sessionObj, receiptUrl);
        WhatsAppService.sendToPatient(patient.phone, msg);
    } catch(err) {
        console.error("Error sending session receipt via WhatsApp:", err);
    }
};

window.downloadSessionReceiptPDFById = async function(patientId, sessionNum) {
    try {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient || !patient.sessions) return;
        const sessionObj = patient.sessions.find(s => s.sessionNum === sessionNum);
        if (!sessionObj) return;

        window.downloadSessionReceiptPDF(patient, sessionObj);
    } catch(err) {
        console.error("Error preparing session receipt PDF:", err);
    }
};

async function renderPublicSessionReceiptView() {
    const urlParams = new URLSearchParams(window.location.search);
    const patientId = urlParams.get('patientId');
    const sessionNum = parseInt(urlParams.get('sessionNum'));

    const publicScreen = document.getElementById('public-session-screen');
    const publicContent = document.getElementById('public-session-content');

    if (!publicScreen || !publicContent) return;

    publicScreen.classList.remove('hidden');
    publicContent.innerHTML = '<div style="padding:40px; text-align:center;"><i class="fa-solid fa-arrows-rotate fa-spin" style="font-size:2rem; color:var(--primary-cyan);"></i><br><br>Cargando recibo de atención...</div>';

    try {
        const patients = await SupabaseDataService.getPatients();
        const patient = patients.find(p => p.id === patientId);
        if (!patient || !patient.sessions) {
            publicContent.innerHTML = '<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>No se encontró el paciente o su registro clínico.</div>';
            return;
        }

        const session = patient.sessions.find(s => s.sessionNum === sessionNum);
        if (!session) {
            publicContent.innerHTML = '<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>No se encontró la sesión médica solicitada.</div>';
            return;
        }

        const stationery = await SupabaseDataService.getStationeryConfig();
        const rate = parseFloat(localStorage.getItem('dental_exchange_rate')) || 36.5;
        const totalUSD = session.paymentUSD || 0;
        const totalVES = (totalUSD * rate).toFixed(2);

        let logoImgHtml = '';
        if (stationery && stationery.logo_url) {
            logoImgHtml = `<img src="${stationery.logo_url}" style="max-height: 70px; max-width: 150px; object-fit: contain; margin-bottom: 10px;" alt="Logo Clínica">`;
        }

        let matsHtml = '';
        if (session.materials && session.materials.length > 0) {
            matsHtml = `
                <div style="margin-top: 15px; padding-top: 12px; border-top: 1px dashed #cbd5e1; font-size: 0.82rem; color: #475569;">
                    <strong>Insumos Clínicos Utilizados:</strong>
                    <ul style="margin: 6px 0 0 18px; padding: 0;">
                        ${session.materials.map(m => `<li>${m.name} (${m.qty} ${m.unit || 'U.'})</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        let paymentBreakdownHtml = '';
        if (totalUSD > 0) {
            let methodText = session.paymentMethodLabel || 'Efectivo';
            if (session.paymentMethod === 'split' && session.splitPayments) {
                const parts = [];
                if (session.splitPayments.cash > 0) parts.push(`Efectivo: $${session.splitPayments.cash.toFixed(2)}`);
                if (session.splitPayments.pagomovil > 0) parts.push(`Pago Móvil: $${session.splitPayments.pagomovil.toFixed(2)}`);
                if (session.splitPayments.zelle > 0) parts.push(`Zelle: $${session.splitPayments.zelle.toFixed(2)}`);
                if (session.splitPayments.binance > 0) parts.push(`Binance: $${session.splitPayments.binance.toFixed(2)}`);
                if (session.splitPayments.punto > 0) parts.push(`Punto: $${session.splitPayments.punto.toFixed(2)}`);
                methodText = `Pago Mixto (${parts.join(' + ')})`;
            }

            paymentBreakdownHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-weight: 700; color: #1e293b;">Monto Cancelado por la Sesión:</span>
                        <strong style="font-size: 1.1rem; color: #15803d;">$${totalUSD.toFixed(2)} USD <span style="font-size: 0.9rem; color: #0891b2;">(Bs. ${totalVES})</span></strong>
                    </div>
                    <div style="font-size: 0.85rem; color: #475569;">
                        <strong>Método / Forma de Pago:</strong> ${methodText}
                    </div>
                </div>
            `;
        } else {
            paymentBreakdownHtml = `
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin: 20px 0; font-size: 0.85rem; color: #64748b;">
                    <i class="fa-solid fa-circle-info"></i> Esta sesión forma parte del plan de tratamiento general en curso.
                </div>
            `;
        }

        let signatureHtml = '';
        if (session.signatureData) {
            signatureHtml = `
                <div style="margin-top: 30px; text-align: center; display: inline-block;">
                    <div style="border-bottom: 1px solid #334155; padding-bottom: 5px; width: 260px; margin: 0 auto;">
                        <img src="${session.signatureData}" style="max-height: 60px; max-width: 240px; display: block; margin: 0 auto;" alt="Firma de Conformidad">
                    </div>
                    <div style="font-size: 0.8rem; font-weight: 700; color: #0f172a; margin-top: 6px;">${patient.fullname}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">C.I. / ID: ${patient.id} - Firma de Conformidad</div>
                </div>
            `;
        }

        const html = `
            <div id="public-receipt-printable-doc" style="font-family: inherit; color: #0f172a; line-height: 1.5;">
                <!-- HEADER -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0891b2; padding-bottom: 20px; margin-bottom: 20px;">
                    <div>
                        ${logoImgHtml}
                        <h2 style="margin: 0; font-size: 1.3rem; color: #0891b2;">DENTALCARE PRO</h2>
                        <p style="margin: 4px 0 0 0; font-size: 0.82rem; color: #475569; white-space: pre-line;">${stationery.headerText || 'Clínica Odontológica Especializada'}</p>
                    </div>
                    <div style="text-align: right;">
                        <span class="badge-tag green" style="font-size: 0.85rem; padding: 4px 10px; border-radius: 6px;">COMPROBANTE DE ATENCIÓN</span>
                        <div style="font-size: 0.82rem; color: #64748b; margin-top: 6px;">
                            <strong>Sesión N°:</strong> ${session.sessionNum}<br>
                            <strong>Fecha y Hora:</strong> ${session.datetime}
                        </div>
                    </div>
                </div>

                <!-- PATIENT INFO -->
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.85rem;">
                    <div>
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 800; text-transform: uppercase;">Paciente:</span>
                        <strong style="display: block; font-size: 1rem; color: #0f172a;">${patient.fullname}</strong>
                        <span style="color: #475569;">Cédula / Documento: <strong>${patient.id}</strong></span>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.72rem; color: #64748b; font-weight: 800; text-transform: uppercase;">Contacto:</span>
                        <span style="display: block; color: #475569;">Teléfono: <strong>${patient.phone}</strong></span>
                        <span style="color: #475569;">Email: ${patient.email || 'N/A'}</span>
                    </div>
                </div>

                <!-- PROCEDURE DETAILS -->
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 8px 0; color: #0891b2; font-size: 0.95rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
                        <i class="fa-solid fa-stethoscope"></i> Procedimiento Realizado
                    </h4>
                    <p style="margin: 0; font-size: 0.9rem; color: #1e293b; background: #ffffff; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px;">
                        ${session.procedure}
                    </p>
                    ${session.indications ? `
                        <div style="margin-top: 10px; font-size: 0.85rem; color: #0284c7; background: #f0f9ff; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #0284c7;">
                            <strong>Indicaciones Médicas:</strong> ${session.indications}
                        </div>
                    ` : ''}
                    ${matsHtml}
                </div>

                <!-- PAYMENT -->
                ${paymentBreakdownHtml}

                <!-- SIGNATURE & CONFORMITY -->
                <div style="text-align: center; margin-top: 35px;">
                    ${signatureHtml}
                    <p style="font-size: 0.75rem; color: #64748b; margin-top: 15px; font-style: italic;">
                        El paciente constata su conformidad y satisfacción con el tratamiento odontológico recibido en esta fecha.
                    </p>
                </div>

                <!-- FOOTER -->
                <div style="border-top: 1px dashed #cbd5e1; margin-top: 25px; padding-top: 12px; text-align: center; font-size: 0.75rem; color: #64748b; font-style: italic; line-height: 1.4;">
                    ${(stationery && (stationery.footer_text || stationery.footerText)) || 'Gracias por su confianza. Todo tratamiento dental requiere control periódico.'}
                </div>
            </div>
        `;

        publicContent.innerHTML = html;

        document.getElementById('btn-public-session-print').onclick = () => window.print();
        document.getElementById('btn-public-session-download-pdf').onclick = async () => {
            const clone = publicContent.cloneNode(true);
            const filename = `Recibo_Sesion_${session.sessionNum}_${patient.fullname.replace(/\s+/g, '_')}.pdf`;
            await generatePDFFromElement(clone, filename);
        };

    } catch(err) {
        console.error("Error loading public session receipt view:", err);
        publicContent.innerHTML = `<div class="text-center text-red" style="padding:40px;"><i class="fa-solid fa-circle-xmark" style="font-size:2rem;"></i><br><br>Error al recuperar el recibo del servidor.</div>`;
    }
}
