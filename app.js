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
    const session = localStorage.getItem('dental_current_user');
    return session ? JSON.parse(session) : null;
}

function checkAuthSession() {
    const currentSession = localStorage.getItem('dental_current_user');
    const loginOverlay = document.getElementById('login-screen');

    if (currentSession) {
        try {
            const user = JSON.parse(currentSession);
            loginOverlay.classList.add('hidden');
            
            document.getElementById('dr-name-display').innerText = user.fullname;
            document.getElementById('dr-role-display').innerText = user.role;

            applyRolePermissionsUI(user.role);
            return;
        } catch(e) {
            localStorage.removeItem('dental_current_user');
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
        localStorage.setItem('dental_current_user', JSON.stringify(match));
        checkAuthSession();
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
    localStorage.removeItem('dental_current_user');
    checkAuthSession();
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

    const opt = {
        margin:       10,
        filename:     `Historia_Clinica_${patient.id}_${patient.fullname.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(container).save().then(() => {
        Swal.fire({
            icon: 'success',
            title: '¡PDF Generado!',
            text: `Se ha descargado la Historia Clínica de ${patient.fullname}.`,
            timer: 2500,
            showConfirmButton: false
        });
    }).catch(err => {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error al exportar', text: 'No se pudo generar el documento PDF.' });
    });
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
            const chairTimeMin = parseInt(document.getElementById('srv-time').value) || 30;

            if (!code || !name || priceUSD <= 0) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            await SupabaseDataService.saveBaremoService({ code, name, category, priceUSD, chairTimeMin, materials: [] });

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

            const newUser = {
                id: 'usr-' + Date.now(),
                fullname,
                email,
                password,
                role,
                license,
                status: 'Activo',
                createdAt: new Date().toISOString().split('T')[0]
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
            const phone = document.getElementById('p-phone').value.trim();

            if (!id || !fullname || !birthdate || !phone) {
                Swal.fire({ icon: 'warning', title: 'Campos requeridos', text: 'Por favor complete los campos obligatorios (*)' });
                return;
            }

            const allergies = Array.from(document.querySelectorAll('input[name="p-allergies"]:checked')).map(cb => cb.value);
            const systemic = Array.from(document.querySelectorAll('input[name="p-systemic"]:checked')).map(cb => cb.value);
            const medication = document.getElementById('p-medication').value.trim();
            const emergencyContact = document.getElementById('p-emergency').value.trim();

            const newPatient = {
                id,
                fullname,
                birthdate,
                phone,
                email: document.getElementById('p-email').value.trim(),
                occupation: document.getElementById('p-occupation').value.trim(),
                allergies,
                systemic,
                medication,
                emergencyContact,
                status: 'Activo',
                createdAt: new Date().toISOString().split('T')[0],
                odontogramData: {},
                clinicalNotes: [],
                photos: [],
                payments: []
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

            currentBudgetItems.forEach(item => {
                if (item.serviceCode) {
                    window.kardex.deductForTreatment(item.serviceCode);
                }
            });

            if (!patient.clinicalNotes) patient.clinicalNotes = [];
            patient.clinicalNotes.unshift({
                id: 'note-' + Date.now(),
                datetime: new Date().toISOString().slice(0, 16).replace('T', ' '),
                content: `Presupuesto emitido y enviado por WhatsApp ($${totalUSD.toFixed(2)}). Forma de pago: ${paymentModeText}. ${notes}`,
                paymentUSD: 0
            });
            await SupabaseDataService.savePatient(patient);

            const msg = WhatsAppService.generateBudgetMessage(patient, currentBudgetItems, totalUSD, paymentModeText, notes);
            WhatsAppService.sendToPatient(patient.phone, msg);
        };
    }

    const printBtn = document.getElementById('btn-print-budget');
    if (printBtn) {
        printBtn.onclick = async () => {
            await autoSaveActivePatientOdontogram();
            Swal.fire({
                icon: 'success',
                title: '¡Odontograma Guardado!',
                text: 'Presupuesto registrado en la ficha. Preparando impresión...',
                timer: 1800,
                showConfirmButton: false
            }).then(() => {
                window.print();
            });
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
