// Configuración y Estado Global
const API_URL = 'api.php?ruta=';
let authToken = localStorage.getItem('token') || null;
let currentProject = null;
let currentWorkers = [];


// ========================
// CUSTOM DIALOG SYSTEM
// ========================
function showCustomDialog({ title, message, type = 'alert', inputValue = '' }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('custom-dialog');
    const titleEl = document.getElementById('dialog-title');
    const messageEl = document.getElementById('dialog-message');
    const inputContainer = document.getElementById('dialog-input-container');
    const inputEl = document.getElementById('dialog-input');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = title;
    messageEl.innerText = message; 

    // Reset visibility
    inputContainer.classList.add('hidden');
    cancelBtn.classList.add('hidden');

    if (type === 'prompt') {
      inputContainer.classList.remove('hidden');
      inputEl.value = inputValue;
      cancelBtn.classList.remove('hidden');
    } else if (type === 'confirm') {
      cancelBtn.classList.remove('hidden');
    }

    const closeAndResolve = (val) => {
      dialog.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      inputEl.onkeyup = null;
      resolve(val);
    };

    confirmBtn.onclick = () => {
      if (type === 'prompt') closeAndResolve(inputEl.value);
      else closeAndResolve(true);
    };

    cancelBtn.onclick = () => {
      if (type === 'prompt') closeAndResolve(null);
      else closeAndResolve(false);
    };

    if (type === 'prompt') {
      inputEl.onkeyup = (e) => {
        if (e.key === 'Enter') confirmBtn.click();
      };
    }

    dialog.classList.remove('hidden');
    if (type === 'prompt') { inputEl.focus(); inputEl.select(); }
    else confirmBtn.focus();
  });
}

const customAlert = (message, title = 'Aviso del Sistema') => showCustomDialog({ title, message, type: 'alert' });
const customConfirm = (message, title = 'Confirmar Acción') => showCustomDialog({ title, message, type: 'confirm' });
const customPrompt = (message, defaultValue = '', title = 'Ingresar Dato') => showCustomDialog({ title, message, type: 'prompt', inputValue: defaultValue });

// ========================
// RECURSOS DE UTILIDAD
// ========================
function getLocalISODate() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().split('T')[0];
}

document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    showView('dashboard-view');
    loadProjects().then(() => {
      const savedProjId = localStorage.getItem('currentProjectId');
      const savedProjName = localStorage.getItem('currentProjectName');
      if (savedProjId && savedProjName) {
        goToProject(savedProjId, savedProjName);
      }
    });
    loadDashboardStats();
  } else {
    showView('login-view');
  }

  // PWA Register
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
  }

  // Bindings genéricos
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('back-to-dashboard').addEventListener('click', goHome);
  
  // Enter en el buscador global
  document.getElementById('global-search-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') {
      searchWorkers(e.target.value);
    }
  });

  // Pestañas
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden', 'active'));
      
      e.target.classList.add('active');
      const targetId = e.target.getAttribute('data-target');
      
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(targetId).classList.remove('hidden');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Listeners
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('project-form').addEventListener('submit', handleCreateProject);
  document.getElementById('new-project-btn').addEventListener('click', () => openModal('project-modal'));
  
  document.getElementById('new-worker-btn').addEventListener('click', () => {
    document.getElementById('worker-form').reset();
    document.getElementById('worker-id').value = '';
    openModal('worker-modal');
  });
  document.getElementById('worker-form').addEventListener('submit', handleWorkerSubmit);
  
  document.getElementById('action-form').addEventListener('submit', handleActionSubmit);
  document.getElementById('payroll-form').addEventListener('submit', handleGeneratePayroll);
  
  document.getElementById('close-payroll-btn').addEventListener('click', handleClosePayroll);
  document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
  document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);

  // Restricción: No permitir seleccionar días que no han llegado (fechas futuras)
  const todayMax = getLocalISODate();
  ['start-date', 'end-date', 'attendance-date', 'expense-date', 'action-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.setAttribute('max', todayMax); // Atributo max restringe el calendario nativo
      el.addEventListener('change', (e) => {
        if (e.target.value > todayMax) {
          customAlert('No puedes liquidar nómina ni registrar datos en una fecha que aún no ha llegado.', 'Fecha Inválida');
          e.target.value = todayMax;
        }
      });
    }
  });
});

function goHome() {
  currentProject = null;
  localStorage.removeItem('currentProjectId');
  localStorage.removeItem('currentProjectName');
  document.getElementById('global-search-input').value = '';
  showView('dashboard-view');
  loadProjects();
  loadDashboardStats();
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    if (v.id !== viewId) {
      v.classList.remove('active-view');
      setTimeout(() => {
        if (!v.classList.contains('active-view')) v.classList.add('hidden');
      }, 400); 
    }
  });
  
  setTimeout(() => {
    const view = document.getElementById(viewId);
    if (!view) return;
    view.classList.remove('hidden');
    void view.offsetWidth;
    view.classList.add('active-view');
  }, 50);

  const nav = document.getElementById('main-nav');
  if (viewId === 'login-view') {
    nav.classList.add('hidden');
  } else {
    nav.classList.remove('hidden');
  }
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

async function apiFetch(endpoint, method = 'GET', body = null) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['X-Auth-Token'] = authToken;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_URL}${endpoint}`, options);
  const text = await response.text(); // Read text first
  
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch(err) {
      throw new Error(`El servidor devolvió un formato no válido text: "${text.substring(0,50)}..."`);
    }
  }

  if (!response.ok) {
    if (response.status === 401) logout();
    throw new Error(data.error || `Error ${response.status} en la petición`);
  }
  return data;
}

function formatMoney(amount) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
}

// ========================
// AUTENTICACIÓN
// ========================
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const data = await apiFetch('/login', 'POST', { username, password });
    authToken = data.token;
    localStorage.setItem('token', authToken);
    document.getElementById('login-form').reset();
    showView('dashboard-view');
    loadProjects();
  } catch (error) {
    customAlert(error.message);
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem('token');
  localStorage.removeItem('currentProjectId');
  localStorage.removeItem('currentProjectName');
  showView('login-view');
}

// ========================
// PROYECTOS
// ========================
async function loadProjects() {
  try {
    const projects = await apiFetch('/projects');
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'glass-container project-card';
      card.innerHTML = `
        <div>
          <h3>${p.name}</h3>
          <p>Obra Activa</p>
        </div>
        <div class="project-card-actions">
          <button class="btn-secondary btn-small btn-edit-project" title="Editar nombre">Editar</button>
          <button class="btn-outline btn-small btn-delete-project" style="color:var(--red-600); border-color:var(--red-50);" title="Eliminar">Borrar</button>
          <button class="btn-primary btn-small btn-go-project">Administrar</button>
        </div>
      `;
      
      card.querySelector('.btn-go-project').onclick = () => goToProject(p.id, p.name);
      
      card.querySelector('.btn-edit-project').onclick = (e) => {
        e.stopPropagation();
        editProject(p.id, p.name);
      };
      
      card.querySelector('.btn-delete-project').onclick = (e) => {
        e.stopPropagation();
        deleteProject(p.id, p.name);
      };
      
      grid.appendChild(card);
    });
  } catch (error) {
    console.error(error);
  }
}

async function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById('project-name').value;
  try {
    await apiFetch('/projects', 'POST', { name });
    closeModal('project-modal');
    document.getElementById('project-form').reset();
    loadProjects();
  } catch (error) { customAlert(error.message); }
}

function goToProject(id, name) {
  currentProject = { id, name };
  localStorage.setItem('currentProjectId', id);
  localStorage.setItem('currentProjectName', name);
  document.getElementById('current-project-title').textContent = name;
  showView('project-detail-view');
  
  document.querySelector('[data-target="tab-workers"]').click();
  document.getElementById('payroll-results').classList.add('hidden');
  
  // Set default dates to today
  const todayStr = getLocalISODate();
  document.getElementById('attendance-date').value = todayStr;
  document.getElementById('start-date').value = todayStr;
  document.getElementById('end-date').value = todayStr;
  
  loadWorkers();
  loadExpenses();
}

// Editar nombre de una obra
async function editProject(id, currentName) {
  const newName = await customPrompt('Editar nombre de la obra:', currentName, 'Editar Proyecto');
  if (!newName || newName.trim() === '' || newName.trim() === currentName) return;
  
  try {
    await apiFetch(`/projects/${id}`, 'PUT', { name: newName.trim() });
    loadProjects();
  } catch(e) { customAlert(e.message); }
}

// Eliminar obra completa
async function deleteProject(id, name) {
  if (!confirm(`⚠️ ¿Estás seguro de ELIMINAR la obra "${name}"?\n\nEsto borrará TODOS los trabajadores, días y adelantos asociados a esta obra. Esta acción NO se puede deshacer.`)) return;
  
  try {
    await apiFetch(`/projects/${id}`, 'DELETE');
    loadProjects();
  } catch(e) { customAlert(e.message); }
}

// ========================
// TRABAJADORES E HISTORIAL
// ========================
async function loadWorkers() {
  if (!currentProject) return;
  try {
    currentWorkers = await apiFetch(`/workers?project_id=${currentProject.id}`);
    
    // 1. Llenar tabla de administracion
    const tbody = document.querySelector('#workers-table tbody');
    tbody.innerHTML = '';
    currentWorkers.forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${w.name}</strong></td>
        <td><span class="tag">${w.role || 'Ayudante'}</span></td>
        <td>${w.document || 'N/A'}</td>
        <td>${formatMoney(w.rate_per_day)}/día</td>
        <td class="actions-cell">
          <button class="btn-s-success btn-small" onclick="openActionModal(${w.id}, '${w.name.replace(/'/g, "\\'")}', 'days')">+Días</button>
          <button class="btn-s-warning btn-small" onclick="openActionModal(${w.id}, '${w.name.replace(/'/g, "\\'")}', 'advance')">+Adelanto</button>
          <button class="btn-outline btn-small" onclick="openHistoryModal(${w.id}, '${w.name.replace(/'/g, "\\'")}')">Ver Historial</button>
          <button class="btn-s-warning btn-small" onclick="editWorker(${w.id}, '${w.name.replace(/'/g, "\\'")}', '${w.document||''}', ${w.rate_per_day}, '${w.role||'Ayudante'}')">✏️ Editar</button>
          <button class="btn-s-danger btn-small" onclick="deleteWorker(${w.id})">🗑️ Borrar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // 2. Llenar tabla de asistencia rapida
    const attBody = document.querySelector('#attendance-table tbody');
    attBody.innerHTML = '';
    currentWorkers.forEach(w => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${w.name}</strong> <span class="tag">${w.role||'Ayudante'}</span></td>
        <td>
          <input type="number" step="0.5" id="att-worker-${w.id}" placeholder="Ej: 1" style="max-width:150px;">
        </td>
      `;
      attBody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
  }
}

async function handleWorkerSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('worker-id').value;
  const name = document.getElementById('worker-name').value;
  const role = document.getElementById('worker-role').value;
  const documentNum = document.getElementById('worker-doc').value;
  const rate_per_day = document.getElementById('worker-rate').value;

  const payload = { project_id: currentProject.id, name, role, document: documentNum, rate_per_day };

  try {
    if (id) await apiFetch(`/workers/${id}`, 'PUT', payload);
    else await apiFetch('/workers', 'POST', payload);
    
    closeModal('worker-modal');
    loadWorkers();
  } catch (error) { customAlert(error.message); }
}

// Editar trabajador: pre-rellena el modal
function editWorker(id, name, doc, rate, role) {
  document.getElementById('worker-id').value = id;
  document.getElementById('worker-name').value = name;
  document.getElementById('worker-doc').value = doc;
  document.getElementById('worker-rate').value = rate;
  document.getElementById('worker-role').value = role;
  openModal('worker-modal');
}

async function deleteWorker(id) {
  if (!(await customConfirm('¿Seguro que deseas eliminar el trabajador? Esto borrará permanentemente sus registros de esta obra.', 'Eliminar Trabajador'))) return;
  try {
    await apiFetch(`/workers/${id}`, 'DELETE');
    loadWorkers();
  } catch(e) { customAlert(e.message); }
}

let currentHistoryData = { groupedDays: {}, groupedAdvances: {} };

function formatDateShort(date) {
  const m = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${date.getDate()} ${m[date.getMonth()]} ${date.getFullYear()}`;
}

// Helper para agrupar fechas por quincenas de 14 días (Lunes a Sábado de la otra semana)
function getQuincenaStr(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const target = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  const anchor = new Date(2026, 2, 30); // Lunes 30 de Marzo 2026 (Referencia de inicio)

  const diffTime = target.getTime() - anchor.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const periods = Math.floor(diffDays / 14);
  
  const qStart = new Date(anchor.getTime() + periods * 14 * 1000 * 60 * 60 * 24);
  const qEnd = new Date(qStart.getTime() + 12 * 1000 * 60 * 60 * 24); // Finaliza 12 días despues (Sábado)

  return `${formatDateShort(qStart)} al ${formatDateShort(qEnd)}`;
}

// Historial Inmortal
async function openHistoryModal(workerId, workerName) {
  document.getElementById('history-worker-name').textContent = workerName;
  document.getElementById('history-days-list').innerHTML = '<li>Cargando...</li>';
  document.getElementById('history-advances-list').innerHTML = '<li>Cargando...</li>';
  
  const select = document.getElementById('history-period-filter');
  select.innerHTML = '<option value="all">Todas las quincenas</option>';
  select.onchange = () => renderHistoryLists(select.value);

  openModal('history-modal');

  try {
    const days = await apiFetch(`/workers/${workerId}/work_entries`);
    const advances = await apiFetch(`/workers/${workerId}/advances`);

    currentHistoryData.groupedDays = {};
    const periodsSet = new Set();
    
    // Agrupar días
    days.forEach(d => {
      const g = getQuincenaStr(d.date);
      periodsSet.add(g);
      if (!currentHistoryData.groupedDays[g]) currentHistoryData.groupedDays[g] = [];
      currentHistoryData.groupedDays[g].push(d);
    });

    // Agrupar adelantos
    currentHistoryData.groupedAdvances = {};
    advances.forEach(a => {
      const g = getQuincenaStr(a.date);
      periodsSet.add(g);
      if (!currentHistoryData.groupedAdvances[g]) currentHistoryData.groupedAdvances[g] = [];
      currentHistoryData.groupedAdvances[g].push(a);
    });

    // Llenar selector
    Array.from(periodsSet).forEach(p => {
       const opt = document.createElement('option');
       opt.value = p;
       opt.textContent = `Quincena: ${p}`;
       select.appendChild(opt);
    });

    renderHistoryLists('all');

  } catch(e) {
    customAlert("Error cargando historial");
  }
}

function renderHistoryLists(filterPeriod) {
  const ulDays = document.getElementById('history-days-list');
  ulDays.innerHTML = '';
  
  let daysCount = 0;
  for (const [group, items] of Object.entries(currentHistoryData.groupedDays)) {
    if(filterPeriod !== 'all' && group !== filterPeriod) continue;
    daysCount += items.length;
    ulDays.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 5px 10px; margin-top: 10px; border-radius: 5px; font-weight: bold; color: var(--primary-color);">${group}</div>`;
    items.forEach(d => {
      ulDays.innerHTML += `<li class="history-item" style="padding-left: 10px;"><span>📅 ${d.date}</span> <span>+ ${d.days_worked} días <button onclick="deleteSingleRecord('work', ${d.id})" class="btn-s-danger btn-small" style="padding:2px 5px; margin-left:10px;">🗑️</button></span></li>`;
    });
  }
  if(daysCount === 0) ulDays.innerHTML = '<li><small>No hay dias registrados.</small></li>';

  const ulAdv = document.getElementById('history-advances-list');
  ulAdv.innerHTML = '';
  
  let advCount = 0;
  for (const [group, items] of Object.entries(currentHistoryData.groupedAdvances)) {
    if(filterPeriod !== 'all' && group !== filterPeriod) continue;
    advCount += items.length;
    ulAdv.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 5px 10px; margin-top: 10px; border-radius: 5px; font-weight: bold; color: var(--primary-color);">${group}</div>`;
    items.forEach(a => {
      ulAdv.innerHTML += `<li class="history-item" style="padding-left: 10px;"><span>📅 ${a.date}</span> <span class="negative">- ${formatMoney(a.amount)} <button onclick="deleteSingleRecord('adv', ${a.id})" class="btn-s-danger btn-small" style="padding:2px 5px; margin-left:10px;">🗑️</button></span></li>`;
    });
  }
  if(advCount === 0) ulAdv.innerHTML = '<li><small>No hay adelantos registrados.</small></li>';
}

async function deleteSingleRecord(type, id) {
  if(!(await customConfirm("¿Borrar este registro permanentemente?", "Eliminar Registro"))) return;
  try {
    if(type==='work') await apiFetch(`/work_entries/${id}`, 'DELETE');
    else await apiFetch(`/advances/${id}`, 'DELETE');
    
    // Refresh history modal
    const workerId = document.getElementById('action-worker-id').value || currentWorkers[0].id; // hack for reload
    // Cierra modal temporal para evitar bugs, fuerza recarga de trabajadores
    closeModal('history-modal');
    customAlert("Registro borrado. Los saldos se han actualizado.");
    loadWorkers();
  } catch(e){ customAlert(e.message); }
}

// ========================
// ASISTENCIA MASIVA & ACCIONES INDIVIDUALES
// ========================
async function saveMassiveAttendance() {
  const date = document.getElementById('attendance-date').value;
  if(!date) return customAlert("Selecciona una fecha de asistencia.");
  
  let savedCount = 0;
  for(let w of currentWorkers) {
    const input = document.getElementById(`att-worker-${w.id}`);
    const val = Number(input.value);
    if(val > 0) {
      try {
        await apiFetch('/work_entries', 'POST', { worker_id: w.id, project_id: currentProject.id, date, days: val });
        input.value = ''; // Limpiar input para la proxima vez
        savedCount++;
      } catch(e) { console.error("Error guardando para", w.name, e); }
    }
  }
  
  if(savedCount > 0) {
    customAlert(`Se guardó asistencia para ${savedCount} trabajadores.`);
  } else {
    customAlert("No escribiste días para ningún trabajador.");
  }
}

function openActionModal(workerId, workerName, type) {
  document.getElementById('action-worker-id').value = workerId;
  document.getElementById('action-type').value = type;
  document.getElementById('action-worker-name').textContent = workerName;
  
  document.getElementById('action-date').value = getLocalISODate();
  document.getElementById('action-value').value = '';

  if (type === 'days') {
    document.getElementById('action-modal-title').textContent = 'Asistencia Individual';
    document.getElementById('action-value-label').textContent = 'Días (ej: 1 o 0.5)';
    document.getElementById('action-value').step = "0.5";
  } else {
    document.getElementById('action-modal-title').textContent = 'Registrar Adelanto';
    document.getElementById('action-value-label').textContent = 'Monto Total ($)';
    document.getElementById('action-value').step = "1000";
  }

  openModal('action-modal');
}

async function handleActionSubmit(e) {
  e.preventDefault();
  const worker_id = document.getElementById('action-worker-id').value;
  const type = document.getElementById('action-type').value;
  const date = document.getElementById('action-date').value;
  const value = document.getElementById('action-value').value;

  if(!date) return customAlert("La fecha es obligatoria");

  try {
    if (type === 'days') {
      await apiFetch('/work_entries', 'POST', { worker_id, project_id: currentProject.id, date, days: value });
    } else {
      await apiFetch('/advances', 'POST', { worker_id, project_id: currentProject.id, date, amount: value });
    }
    closeModal('action-modal');
    customAlert('Registro guardado correctamente');
  } catch (error) { customAlert(error.message); }
}

// ========================
// BUSCADOR GLOBAL
// ========================
async function searchWorkers(query) {
  if(!query) return;
  try {
    const results = await apiFetch(`/search_workers?q=${encodeURIComponent(query)}`);
    showView('search-view');
    currentProject = null;

    const tbody = document.querySelector('#search-table tbody');
    tbody.innerHTML = '';

    if(results.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center">No se encontraron trabajadores con ese nombre o documento en ninguna obra</td></tr>';
      return;
    }

    // Agrupar por nombre (o documento) para unificar obras
    const grouped = {};
    results.forEach(w => {
       const key = w.document ? w.document : w.name.toLowerCase().trim();
       if(!grouped[key]) {
         grouped[key] = {
           name: w.name,
           document: w.document,
           role: w.role,
           projects: new Set(),
           recent_dates: [],
           net_pay: 0
         };
       }
       grouped[key].projects.add(w.project_name);
       
       if (w.recent_dates && w.recent_dates !== 'Sin días') {
         w.recent_dates.split(',').forEach(d => {
            const cleanDate = d.trim();
            if(cleanDate) {
              grouped[key].recent_dates.push(
                `<div style="margin-bottom:6px;"><span class="tag" style="background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid var(--surface-border); display:inline-block; padding:5px 10px;">🏗️ ${w.project_name} &nbsp; 📅 ${cleanDate}</span></div>`
              );
            }
         });
       }
       grouped[key].net_pay += w.net_pay;
    });

    const finalResults = Object.values(grouped);

    finalResults.forEach(w => {
      const tr = document.createElement('tr');
      const datesHtml = w.recent_dates.length > 0 ? w.recent_dates.join('') : 'Sin días pendientes';
      const projsStr = Array.from(w.projects).join(', ');

      tr.innerHTML = `
        <td style="vertical-align: top;"><strong>${w.name}</strong><br><small class="tag" style="margin-top:8px; display:inline-block;">${w.role || 'Ayudante'}</small></td>
        <td style="vertical-align: top; max-height:200px; display:block; overflow-y:auto; overflow-x:hidden; padding-right:10px;">${datesHtml}</td>
        <td style="vertical-align: top;"><strong class="${w.net_pay > 0 ? 'positive' : ''}" style="font-size:1.1rem;">${formatMoney(w.net_pay)}</strong></td>
        <td style="vertical-align: top;">📍 ${projsStr}</td>
      `;
      
      tbody.appendChild(tr);
    });

  } catch(e) { customAlert(e.message); }
}

// ========================
// NÓMINA (LIQUIDACIÓN)
// ========================
async function handleGeneratePayroll(e) {
  e.preventDefault();
  const start_date = document.getElementById('start-date').value;
  const end_date = document.getElementById('end-date').value;

  if(!start_date || !end_date) return customAlert("Seleccione ambas fechas");

  try {
    const data = await apiFetch('/payroll/generate', 'POST', {
      project_id: currentProject.id,
      start_date,
      end_date
    });
    renderPayroll(data);
  } catch (error) { customAlert(error.message); }
}

function renderPayroll(data) {
  document.getElementById('payroll-results').classList.remove('hidden');
  
  document.getElementById('sum-gross').textContent = formatMoney(data.totals.total_gross);
  document.getElementById('sum-advances').textContent = formatMoney(data.totals.total_advances);
  document.getElementById('sum-net').textContent = formatMoney(data.totals.total_net);

  const tbody = document.querySelector('#payroll-table tbody');
  tbody.innerHTML = '';

  data.workers.forEach(w => {
    if(w.total_days > 0 || w.advances > 0){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${w.name}</strong><br><small>${formatMoney(w.rate_per_day)}/día</small></td>
        <td>${w.total_days}</td>
        <td>${formatMoney(w.gross)}</td>
        <td class="negative">- ${formatMoney(w.advances)}</td>
        <td class="positive"><strong>${formatMoney(w.net)}</strong></td>
      `;
      tbody.appendChild(tr);
    }
  });

  if(tbody.innerHTML === '') {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">No hay saldo pendiente en estas fechas. Tal vez ya se pagó.</td></tr>';
  }
}

async function handleClosePayroll() {
  const start_date = document.getElementById('start-date').value;
  const end_date = document.getElementById('end-date').value;
  if(!start_date || !end_date) return;
  
  if(!(await customConfirm(`¿Confirma que le ha pagado la nómina a todos entre el ${start_date} y el ${end_date}? \nEsto guardará los registros en el historial y no volverán a aparecer en futuras liquidaciones.`, 'Cerrar Nómina de Este Periodo'))) return;

  try {
    await apiFetch('/payroll/clear_debt', 'POST', {
      project_id: currentProject.id,
      start_date,
      end_date
    });
    customAlert("¡Nómina erradicada del saldo pendiente exitosamente! (Los datos siguen en cada Historial)");
    document.getElementById('payroll-results').classList.add('hidden');
  } catch(e) {
    customAlert(e.message);
  }
}

// ========================
// GASTOS (EXPENSES)
// ========================
async function loadExpenses() {
  if (!currentProject) return;
  try {
    const expenses = await apiFetch(`/projects/${currentProject.id}/expenses`);
    const tbody = document.querySelector('#expenses-table tbody');
    tbody.innerHTML = '';
    
    let total = 0;
    expenses.forEach(ex => {
      total += ex.amount;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ex.date}</td>
        <td>${ex.description}</td>
        <td>${formatMoney(ex.amount)}</td>
        <td><button class="btn-s-danger btn-small" onclick="deleteExpense(${ex.id})">🗑️</button></td>
      `;
      tbody.appendChild(tr);
    });
    
    document.getElementById('total-expenses-label').textContent = formatMoney(total);
  } catch (e) { console.error(e); }
}

function openExpenseModal() {
  document.getElementById('expense-form').reset();
  document.getElementById('expense-date').value = getLocalISODate();
  openModal('expense-modal');
}

async function handleExpenseSubmit(e) {
  e.preventDefault();
  const date = document.getElementById('expense-date').value;
  const description = document.getElementById('expense-desc').value;
  const amount = document.getElementById('expense-amount').value;
  
  try {
    await apiFetch('/expenses', 'POST', { project_id: currentProject.id, date, description, amount });
    closeModal('expense-modal');
    loadExpenses();
  } catch(err) { customAlert(err.message); }
}

async function deleteExpense(id) {
  if(!(await customConfirm("¿Borrar gasto?", "Eliminar Gasto"))) return;
  try {
    await apiFetch(`/expenses/${id}`, 'DELETE');
    loadExpenses();
  } catch(e) { customAlert(e.message); }
}

// ========================
// DASHBOARD STATS (Charts)
// ========================
let statsChartInstance = null;
async function loadDashboardStats() {
  try {
    const statsContainer = document.getElementById('dashboard-stats');
    const textContainer = document.getElementById('stats-text-container');
    
    const stats = await apiFetch('/stats');
    
    // Calcular el total global
    const totalGlobalCheck = stats ? stats.reduce((acc, s) => acc + s.total_payroll + s.total_expenses, 0) : 0;
    
    // Mostrar siempre el contenedor de estadisticas aunque este en cero
    statsContainer.style.display = 'block';
    
    const labels = stats ? stats.map(s => s.name) : [];
    const dataPayroll = stats ? stats.map(s => s.total_payroll) : [];
    const dataExpenses = stats ? stats.map(s => s.total_expenses) : [];
    
    textContainer.innerHTML = `
      <h4 style="color:var(--text-secondary); text-transform:uppercase; font-size:0.8rem; font-weight:700; font-family:var(--font-mono);">Saldo Pendiente Actual</h4>
      <h2 style="font-size:3rem; margin:10px 0; color:var(--primary-color); font-weight:700; font-family:var(--font-mono); text-shadow:0 0 15px var(--primary-glow);">${formatMoney(totalGlobalCheck)}</h2>
      <p style="color:var(--text-secondary); font-size:0.9rem;">Suma de todas las nóminas pendientes y gastos de inventario en todas las obras activas.</p>
    `;
    
    const ctx = document.getElementById('statsChart').getContext('2d');
    if(statsChartInstance) statsChartInstance.destroy();

    // Si todo es cero, no renderizar barras vacias o raras, solo dejar canvas vacio o ocultarlo
    if(!stats || stats.length === 0 || totalGlobalCheck === 0) {
      document.getElementById('statsChart').style.display = 'none';
      return;
    }

    document.getElementById('statsChart').style.display = 'block';
    
    statsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Nómina', data: dataPayroll, backgroundColor: 'rgba(255, 90, 0, 0.7)', borderColor: '#FF5A00', borderWidth:1 },
          { label: 'Gastos', data: dataExpenses, backgroundColor: 'rgba(226, 232, 240, 0.7)', borderColor: '#E2E8F0', borderWidth:1 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#ffffff', font: {family: 'JetBrains Mono'} } } },
        scales: {
          x: { ticks: { color: '#888888', font: {family: 'JetBrains Mono'} } },
          y: { ticks: { color: '#888888', font: {family: 'JetBrains Mono'} } }
        }
      }
    });
  } catch(e) { console.error(e); }
}

// ========================
// EXPORT PDF
// ========================
function exportToPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const start = document.getElementById('start-date').value || 'No Definido';
  const end = document.getElementById('end-date').value || 'No Definido';
  const projName = currentProject ? currentProject.name : 'Reporte General';
  const today = new Date().toLocaleDateString('es-CO');
  
  const sumGross = document.getElementById('sum-gross').textContent;
  const sumAdvances = document.getElementById('sum-advances').textContent;
  const sumNet = document.getElementById('sum-net').textContent;
  
  // Header: Fondo Oscuro ("Industrial Tech")
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 210, 32, 'F');
  
  // Título / Brand
  doc.setTextColor(255, 90, 0); // Naranja primario
  doc.setFont(undefined, 'bold');
  doc.setFontSize(24);
  doc.text('COSTRUKER', 14, 22);
  
  doc.setTextColor(255, 255, 255); // Texto blanco secundario
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text('REPORTE OFICIAL DE NÓMINA', 140, 21);

  // Información General
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(`Obra / Proyecto: ${projName}`, 14, 45);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(`Periodo liquidado: ${start} a ${end}`, 14, 52);
  doc.text(`Fecha de emisión: ${today}`, 14, 58);
  
  // Cuadros de Resumen (Summary Boxes) - COLORES EXPLÍCITOS PARA EVITAR BUGS DE RENDER
  
  // Box 1 (Total Bruto)
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 65, 55, 20, 'FD');
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8); 
  doc.setFont(undefined, 'normal'); 
  doc.text('TOTAL BRUTO', 41.5, 72, {align:'center'});
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11); 
  doc.setFont(undefined,'bold'); 
  doc.text(sumGross, 41.5, 79, {align:'center'});
  
  // Box 2 (Adelantos)
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 250, 252);
  doc.rect(75, 65, 55, 20, 'FD');
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(8); 
  doc.setFont(undefined, 'normal'); 
  doc.text('TOTAL ADELANTOS', 102.5, 72, {align:'center'});
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(11); 
  doc.setFont(undefined,'bold'); 
  doc.text(sumAdvances, 102.5, 79, {align:'center'});
  
  // Box 3 (Neto a pagar destaco)
  doc.setDrawColor(255, 90, 0);
  doc.setFillColor(255, 245, 240);
  doc.rect(136, 65, 60, 20, 'FD');
  doc.setTextColor(255, 90, 0);
  doc.setFontSize(8); 
  doc.setFont(undefined, 'bold'); 
  doc.text('NETO A PAGAR', 166, 72, {align:'center'});
  doc.setFontSize(12); 
  doc.text(sumNet, 166, 79, {align:'center'});
  
  // Restaurar color para la tabla
  doc.setTextColor(30, 30, 30);
  
  // Tabla autoTable con estilos pulidos a la temática tech/industrial
  doc.autoTable({
    startY: 95,
    html: '#payroll-table',
    theme: 'grid',
    headStyles: { fillColor: [17, 17, 17], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    bodyStyles: { textColor: [50, 50, 50] },
    styles: { fontSize: 9, cellPadding: 4, lineColor: [220, 220, 220], lineWidth: 0.1 }
  });
  
  // Footer
  const finalY = doc.lastAutoTable.finalY || 95;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text(`Generado por el Software COSTRUKER - ${today}`, 105, finalY + 15, { align: 'center' });

  doc.save(`Nomina_${projName.replace(/\s+/g, '_')}_${start}.pdf`);
}
