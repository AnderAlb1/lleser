/* ============================================
   LleSer Ltda. - Sistema de Gestión de Mantenimientos
   Arquitectura MVC - Script Principal
   ============================================ */

// ============================================
// INICIALIZACIÓN DE FIREBASE
// ============================================
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Habilitar caché local (IndexedDB) para que las lecturas repetidas
// no dependan de la red y la app cargue instantáneamente en visitas siguientes.
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Múltiples pestañas abiertas: la persistencia solo puede activarse en una.
        console.warn('Persistencia offline no disponible: hay otra pestaña abierta.');
    } else if (err.code === 'unimplemented') {
        console.warn('Este navegador no soporta persistencia offline.');
    }
});


// ============================================
// UTILIDADES
// ============================================
const Utils = {
    // Normalizar texto para PDF (eliminar acentos)
    norm(text) {
        if (!text) return '';
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    // Generar ID único
    uid() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // Formatear fecha: "11 abril 2026"
    formatDate(dateStr) {
        if (!dateStr) return '';
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const d = new Date(dateStr + 'T12:00:00');
        return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
    },

    // Formatear fecha corta
    formatDateShort(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
    },

    // Calcular tiempo total en minutos entre dos horas
    calcMinutes(horaInicio, horaFin) {
        const [h1, m1] = horaInicio.split(':').map(Number);
        const [h2, m2] = horaFin.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 24 * 60;
        return diff;
    },

    // Comprimir imagen a Base64
    compressImage(file, maxW, quality) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxW) { h = (maxW / w) * h; w = maxW; }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    // Fecha de hoy en formato YYYY-MM-DD
    today() {
        return new Date().toISOString().split('T')[0];
    },

    // Escapar HTML
    esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // Tareas disponibles
    tareas: ['Ajuste','Configuración','Reparación','Lubricación','Test de temperatura','Limpieza interna','Limpieza externa','Verificación de fugas'],
    tiposOrden: ['Mantenimiento Preventivo','Mantenimiento Correctivo','Locativo','Instalación'],
    estadosEquipo: ['Funcionando','Con falla','Fuera de servicio']
};

// ============================================
// MODELO - Capa de acceso a datos (Firebase)
// ============================================

const Model = {
    // --- EQUIPOS ---
    async equipoCreate(data) {
        return await db.collection('equipment').add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    },
    async equipoUpdate(id, data) {
        return await db.collection('equipment').doc(id).update(data);
    },
    async equipoDelete(id) {
        return await db.collection('equipment').doc(id).delete();
    },
    async equipoGetAll() {
        const snap = await db.collection('equipment').orderBy('createdAt','desc').get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },
    async equipoGetById(id) {
        const doc = await db.collection('equipment').doc(id).get();
        return doc.exists ? {id: doc.id, ...doc.data()} : null;
    },

    // --- ÓRDENES DE TRABAJO ---
    async getNextOrdenNumber() {
        const ref = db.collection('config').doc('counter');
        return db.runTransaction(async (tx) => {
            const doc = await tx.get(ref);
            let num = 1;
            if (doc.exists && doc.data().ordenNumero) {
                num = doc.data().ordenNumero + 1;
            }
            tx.set(ref, { ordenNumero: num }, { merge: true });
            return num;
        });
    },
    async ordenCreate(data) {
        const num = await this.getNextOrdenNumber();
        const doc = await db.collection('workOrders').add({
            ...data,
            numero: num,
            estado: 'pendiente',
            reportId: null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { id: doc.id, numero: num };
    },
    async ordenUpdate(id, data) {
        return await db.collection('workOrders').doc(id).update(data);
    },
    async ordenDelete(id) {
        return await db.collection('workOrders').doc(id).delete();
    },
    async ordenGetAll(limit = 15, startAfter = null) {
        let q = db.collection('workOrders').orderBy('numero','desc').limit(limit);
        if (startAfter) q = q.startAfter(startAfter);
        const snap = await q.get();
        return {
            data: snap.docs.map(d => ({id: d.id, ...d.data()})),
            lastDoc: snap.docs[snap.docs.length - 1] || null
        };
    },
    async ordenGetAllNoPag() {
        const snap = await db.collection('workOrders').orderBy('numero','desc').get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },
    async ordenCount() {
        const snap = await db.collection('workOrders').get();
        return snap.size;
    },

    // --- REPORTES ---
    async reporteCreate(data) {
        return await db.collection('reports').add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    async reporteUpdate(id, data) {
        return await db.collection('reports').doc(id).update(data);
    },
    async reporteGetByEquipo(equipoId) {
        const snap = await db.collection('reports')
            .where('equipoId','==',equipoId)
            .get();
        return snap.docs.map(d => ({id: d.id, ...d.data()})).sort((a, b) => {
            if (a.createdAt && b.createdAt) return b.createdAt.toMillis() - a.createdAt.toMillis();
            return 0;
        });
    },
    async reporteGetById(id) {
        const doc = await db.collection('reports').doc(id).get();
        return doc.exists ? {id: doc.id, ...doc.data()} : null;
    },
    async reporteGetByOrden(ordenId) {
        const snap = await db.collection('reports').where('ordenId','==',ordenId).get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },
    async reporteGetAllCorrectivos(limit = 15, startAfter = null) {
        let q = db.collection('reports').where('tipo','==','correctivo').orderBy('createdAt','desc').limit(limit);
        if (startAfter) q = q.startAfter(startAfter);
        const snap = await q.get();
        return {
            data: snap.docs.map(d => ({id: d.id, ...d.data()})),
            lastDoc: snap.docs[snap.docs.length - 1] || null
        };
    },
    async reporteGetAll() {
        const snap = await db.collection('reports').get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },

    // --- TÉCNICOS ---
    async tecnicoCreate(data) {
        return await db.collection('technicians').add({...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
    },
    async tecnicoUpdate(id, data) {
        return await db.collection('technicians').doc(id).update(data);
    },
    async tecnicoDelete(id) {
        return await db.collection('technicians').doc(id).delete();
    },
    async tecnicoGetAll() {
        const snap = await db.collection('technicians').orderBy('nombre','asc').get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },
    async tecnicoGetById(id) {
        const doc = await db.collection('technicians').doc(id).get();
        return doc.exists ? {id: doc.id, ...doc.data()} : null;
    },

    // --- USUARIOS ---
    async userCreateInAuth(email, password) {
        return await auth.createUserWithEmailAndPassword(email, password);
    },
    async userDocCreate(uid, data) {
        return await db.collection('users').doc(uid).set({
            ...data,
            activo: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },
    async userDocUpdate(uid, data) {
        return await db.collection('users').doc(uid).update(data);
    },
    async userDocGet(uid) {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? {id: doc.id, ...doc.data()} : null;
    },
    async userDocGetAll() {
        const snap = await db.collection('users').orderBy('nombre','asc').get();
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },

    // --- CONFIGURACIÓN ---
    async getLogo() {
        const doc = await db.collection('config').doc('logo').get();
        return doc.exists ? doc.data().imagen : null;
    },
    async saveLogo(base64) {
        return await db.collection('config').doc('logo').set({ imagen: base64 });
    },
    async removeLogo() {
        return await db.collection('config').doc('logo').delete();
    },

    // --- BÚSQUEDA ---
    async buscarEquipoPorOrden(num) {
        const snap = await db.collection('workOrders').where('numero','==',num).limit(1).get();
        if (!snap.empty) {
            return snap.docs[0].data().equipoId;
        }
        return null;
    }
};

// ============================================
// VISTA - Capa de presentación
// ============================================
const View = {
    // Mostrar/ocultar elementos
    show(id) { const el = document.getElementById(id); if(el) el.classList.remove('hidden'); },
    hide(id) { const el = document.getElementById(id); if(el) el.classList.add('hidden'); },
    toggle(id) { const el = document.getElementById(id); if(el) el.classList.toggle('hidden'); },

    // Toast de notificaciones
    toast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle', info: 'fa-info-circle' };
        const div = document.createElement('div');
        div.className = `toast ${type}`;
        div.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${Utils.esc(msg)}</span>`;
        container.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; div.style.transform = 'translateX(60px)'; div.style.transition = '0.3s'; setTimeout(() => div.remove(), 300); }, 3500);
    },

    // Modal de confirmación
        confirm(message, btnText = 'Eliminar') {
        return new Promise((resolve) => {
            const btnOk = document.getElementById('confirmOk');
            const btnCancel = document.getElementById('confirmCancel');
            
            // 1. Actualizar texto y color del botón principal
            document.getElementById('confirmMessage').textContent = message;
            btnOk.textContent = btnText;
            
            if (btnText === 'Activar') {
                btnOk.className = 'btn btn-success'; // Verde para activar
            } else {
                btnOk.className = 'btn btn-danger';  // Rojo para eliminar/desactivar
            }

            // 2. Mostrar modal
            App.openModal('modalConfirm');

            // 3. Manejar clics sin clonar nodos
            const handleOk = () => { cleanup(); resolve(true); };
            const handleCancel = () => { cleanup(); resolve(false); };
            
            const cleanup = () => {
                btnOk.removeEventListener('click', handleOk);
                btnCancel.removeEventListener('click', handleCancel);
                App.closeModal('modalConfirm');
                
                // 4. Restaurar el botón a su estado original por defecto
                btnOk.textContent = 'Eliminar';
                btnOk.className = 'btn btn-danger';
            };

            btnOk.addEventListener('click', handleOk);
            btnCancel.addEventListener('click', handleCancel);
        });
    },

    // Cambiar vista activa
    setView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById('view' + viewId.charAt(0).toUpperCase() + viewId.slice(1));
        if (view) view.classList.add('active');

        // Actualizar nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-view="${viewId}"]`)?.classList.add('active');

        // Título
        const titles = { dashboard: 'Dashboard', equipos: 'Equipos', ordenes: 'Generar Órdenes de Trabajo', reportesOT: 'Ejecutar Órdenes de Trabajo', configuracion: 'Configuración' };
        document.getElementById('pageTitle').textContent = titles[viewId] || '';

        // Guardar estado
        localStorage.setItem('lleser_view', viewId);

        // Cerrar sidebar en móvil
        App.closeSidebar();
    },

    // Cambiar tab
    setTab(tabId) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (tabBtn) {
            tabBtn.closest('.view, .card')?.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
        }
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        const content = document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
        if (content) content.classList.add('active');
    },

    // Renderizar tabla de equipos
    renderEquipos(equipos) {
        const tbody = document.getElementById('tbodyEquipos');
        const empty = document.getElementById('equiposEmpty');
        if (equipos.length === 0) {
            tbody.innerHTML = '';
            this.show('equiposEmpty');
            return;
        }
        this.hide('equiposEmpty');
        tbody.innerHTML = equipos.map(eq => `
            <tr>
                <td data-label="Código"><strong>${Utils.esc(eq.codigo)}</strong></td>
                <td data-label="Nombre">${Utils.esc(eq.nombre)}</td>
                <td data-label="Marca">${Utils.esc(eq.marca || '-')}</td>
                <td data-label="Modelo">${Utils.esc(eq.modelo || '-')}</td>
                <td data-label="Serie">${Utils.esc(eq.serie || '-')}</td>
                <td data-label="Ubicación">${Utils.esc(eq.ubicacion || '-')}</td>
                <td class="text-right" data-label="Acciones">
                    <button class="btn-icon btn-outline" title="Editar" onclick="Controller.editEquipo('${eq.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-outline" title="Eliminar" style="color:var(--danger);margin-left:4px;" onclick="Controller.deleteEquipo('${eq.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Paginación
    renderPagination(containerId, currentPage, totalPages, onPageChange) {
        const container = document.getElementById(containerId);
        if (totalPages <= 1) { container.innerHTML = ''; return; }
        let html = '<div class="pagination">';
        html += `<button ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage-1}"><i class="fas fa-chevron-left"></i></button>`;
        const start = Math.max(1, currentPage - 2);
        const end = Math.min(totalPages, currentPage + 2);
        if (start > 1) { html += `<button data-page="1">1</button>`; if (start > 2) html += `<button disabled>...</button>`; }
        for (let i = start; i <= end; i++) {
            html += `<button data-page="${i}" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
        }
        if (end < totalPages) { if (end < totalPages - 1) html += `<button disabled>...</button>`; html += `<button data-page="${totalPages}">${totalPages}</button>`; }
        html += `<button ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage+1}"><i class="fas fa-chevron-right"></i></button>`;
        html += '</div>';
        container.innerHTML = html;
        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (!isNaN(p) && p >= 1 && p <= totalPages) onPageChange(p);
            });
        });
    },

        renderOrdenes(ordenes) {
        const tbody = document.getElementById('tbodyOrdenes');
        const empty = document.getElementById('ordenesEmpty');
        if (ordenes.length === 0) { tbody.innerHTML = ''; View.show('ordenesEmpty'); return; }
        View.hide('ordenesEmpty');
        tbody.innerHTML = ordenes.map(o => {
            const tipoClass = o.tipo === 'Preventivo' ? 'info' : o.tipo === 'Correctivo' ? 'danger' : 'warning';
            const estadoClass = o.estado === 'completada' ? 'success' : 'warning';
            const hasReport = o.reportId;
            const btnAcciones = hasReport 
                ? `<button class="btn btn-outline btn-sm" onclick="Controller.generarPDFDesdeOrden('${o.reportId}')"><i class="fas fa-file-pdf"></i> PDF</button>` 
                : `<button class="btn-icon btn-outline" title="Editar" onclick="Controller.editOrden('${o.id}')"><i class="fas fa-pen"></i></button>
                   <button class="btn-icon btn-outline" title="Eliminar" style="color:var(--danger);margin-left:4px;" onclick="Controller.deleteOrden('${o.id}')"><i class="fas fa-trash"></i></button>`;
            return `<tr>
                <td data-label="No."><strong>#${o.numero}</strong></td>
                <td data-label="Equipo">${Utils.esc(o.equipoNombre || '')}</td>
                <td data-label="Tipo"><span class="badge badge-${tipoClass}">${Utils.esc(o.tipo || '')}</span></td>
                <td data-label="Actividades" class="td-truncate">${Utils.esc(o.actividades || '')}</td>
                <td data-label="Estado"><span class="badge badge-${estadoClass}">${o.estado === 'completada' ? 'Completada' : 'Pendiente'}</span></td>
                <td data-label="Reporte">${hasReport ? `<button class="btn btn-outline btn-sm" onclick="Controller.verReporte('${o.reportId}')"><i class="fas fa-eye"></i> Ver</button>` : '<span class="badge badge-warning">Pendiente</span>'}</td>
                <td class="text-right" data-label="Acciones">${btnAcciones}</td>
            </tr>`;
        }).join('');
    },

    // Renderizar reportes de OT
        renderReportesOT(ordenes) {
        const container = document.getElementById('reportesOTContainer');
        const empty = document.getElementById('reportesOTEmpty');
        
        // Filtrar solo pendientes
        const pendientes = ordenes.filter(o => o.estado !== 'completada');
        
        if (pendientes.length === 0) {
            container.innerHTML = '';
            View.show('reportesOTEmpty');
            return;
        }
        
        View.hide('reportesOTEmpty');
        container.innerHTML = `<div class="ot-cards-grid">${pendientes.map(o => {
            const tipoClass = o.tipo === 'Preventivo' ? 'info' : o.tipo === 'Correctivo' ? 'danger' : 'warning';
            return `
            <div class="ot-card">
                <div class="ot-card-header">
                    <span class="ot-card-num">OT #${o.numero}</span>
                    <span class="badge badge-${tipoClass}">${Utils.esc(o.tipo || '')}</span>
                </div>
                <div class="ot-card-body">
                    <div class="ot-card-info">
                        <i class="fas fa-cog"></i>
                        <strong>${Utils.esc(o.equipoCodigo || '')}</strong> - ${Utils.esc(o.equipoNombre || '')}
                    </div>
                    <div class="ot-card-actividades">
                        <strong style="display:block;margin-bottom:4px;font-size:0.78rem;color:var(--muted);text-transform:uppercase;">Actividades a realizar:</strong>
                        ${Utils.esc(o.actividades || 'Sin descripción')}
                    </div>
                </div>
                <div class="ot-card-footer">
                    <button class="btn btn-primary" onclick="Controller.abrirReporteOT('${o.id}')">
                        <i class="fas fa-file-alt"></i> Diligenciar Reporte
                    </button>
                </div>
            </div>`;
        }).join('')}</div>`;
    },

    // Renderizar correctivos
    renderCorrectivos(reportes) {
        const tbody = document.getElementById('tbodyCorrectivos');
        const empty = document.getElementById('correctivosEmpty');
        if (reportes.length === 0) { tbody.innerHTML = ''; this.show('correctivosEmpty'); return; }
        this.hide('correctivosEmpty');
        tbody.innerHTML = reportes.map(r => {
            const estadoClass = r.estadoEquipo === 'Funcionando' ? 'success' : r.estadoEquipo === 'Con falla' ? 'warning' : 'danger';
            return `<tr>
                <td data-label="Fecha">${Utils.formatDateShort(r.fecha)}</td>
                <td data-label="Equipo">${Utils.esc(r.equipoNombre || '')}</td>
                <td data-label="Realizado por">${Utils.esc(r.realizadoPorNombre || '')}</td>
                <td data-label="Estado"><span class="badge badge-${estadoClass}">${Utils.esc(r.estadoEquipo || '')}</span></td>
                <td class="text-right" data-label="Acciones">
                    <button class="btn btn-outline btn-sm" onclick="Controller.verReporte('${r.id}')"><i class="fas fa-eye"></i> Ver</button>
                    <button class="btn-icon btn-outline" style="color:var(--danger);margin-left:4px;" onclick="Controller.deleteReporte('${r.id}','${r.ordenId || ''}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    },

    // Renderizar técnicos
    renderTecnicos(tecnicos) {
        const tbody = document.getElementById('tbodyTecnicos');
        const empty = document.getElementById('tecnicosEmpty');
        if (tecnicos.length === 0) { tbody.innerHTML = ''; this.show('tecnicosEmpty'); return; }
        this.hide('tecnicosEmpty');
        tbody.innerHTML = tecnicos.map(t => `
            <tr>
                <td data-label="Nombre">${Utils.esc(t.nombre)}</td>
                <td data-label="Cargo">${Utils.esc(t.cargo)}</td>
                <td data-label="Firma">${t.firma ? '<img src="'+t.firma+'" style="height:30px;" alt="Firma">' : '<span style="color:var(--muted)">Sin firma</span>'}</td>
                <td class="text-right" data-label="Acciones">
                    <button class="btn-icon btn-outline" title="Editar" onclick="Controller.editTecnico('${t.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-outline" title="Eliminar" style="color:var(--danger);margin-left:4px;" onclick="Controller.deleteTecnico('${t.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Renderizar usuarios
    renderUsuarios(usuarios) {
        const tbody = document.getElementById('tbodyUsuarios');
        const empty = document.getElementById('usuariosEmpty');
        if (usuarios.length === 0) { tbody.innerHTML = ''; this.show('usuariosEmpty'); return; }
        this.hide('usuariosEmpty');
        tbody.innerHTML = usuarios.map(u => `
            <tr>
                <td data-label="Nombre">${Utils.esc(u.nombre)}</td>
                <td data-label="Correo">${Utils.esc(u.email)}</td>
                <td data-label="Rol"><span class="badge badge-${u.role === 'admin' ? 'info' : 'secondary'}">${u.role === 'admin' ? 'Administrador' : 'Técnico'}</span></td>
                <td data-label="Estado"><span class="badge badge-${u.activo !== false ? 'success' : 'danger'}">${u.activo !== false ? 'Activo' : 'Inactivo'}</span></td>
                <td class="text-right" data-label="Acciones">
                    <button class="btn-icon btn-outline" title="Editar" onclick="Controller.editUsuario('${u.id}','${Utils.esc(u.email)}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-outline" title="${u.activo !== false ? 'Desactivar' : 'Activar'}" style="color:${u.activo !== false ? 'var(--warning)' : 'var(--success)'};margin-left:4px;" onclick="Controller.toggleUsuario('${u.id}',${u.activo !== false})"><i class="fas fa-${u.activo !== false ? 'ban' : 'check'}"></i></button>
                </td>
            </tr>
        `).join('');
    },

    // Renderizar historial de equipo
    renderHistorial(reportes) {
        const container = document.getElementById('equipoHistorialList');
        if (reportes.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No hay reportes para este equipo</p></div>';
            return;
        }
        container.innerHTML = reportes.map(r => {
        const tipoLabel = r.ordenNumero ? `OT #${r.ordenNumero} - ${r.tipoOrden || 'Mantenimiento Correctivo'}` : 'Mantenimiento Correctivo';
          return `<div class="history-item" onclick="Controller.verReporte('${r.id}')">
                <div class="history-header">
                    <span class="history-title">${Utils.esc(tipoLabel)}</span>
                    <span class="badge badge-info">${Utils.formatDateShort(r.fecha)}</span>
                </div>
                <div class="history-meta">
                    Realizado por: ${Utils.esc(r.realizadoPorNombre || '-')} | Estado: ${Utils.esc(r.estadoEquipo || '-')} | Tiempo: ${r.tiempoTotal || 0} min
                </div>
            </div>`;
        }).join('');
    },

    // Llenar select de equipos
    fillEquiposSelect(selectId, equipos, placeholder = 'Seleccionar equipo...') {
        const sel = document.getElementById(selectId);
        const val = sel.value;
        sel.innerHTML = `<option value="">${placeholder}</option>` + equipos.map(e => `<option value="${e.id}">${Utils.esc(e.codigo)} - ${Utils.esc(e.nombre)}</option>`).join('');
        sel.value = val;
    },

    // Llenar select de técnicos
    fillTecnicosSelect(selectId, tecnicos, placeholder = 'Seleccionar...') {
        const sel = document.getElementById(selectId);
        const val = sel.value;
        sel.innerHTML = `<option value="">${placeholder}</option>` + tecnicos.map(t => `<option value="${t.id}">${Utils.esc(t.nombre)} - ${Utils.esc(t.cargo)}</option>`).join('');
        sel.value = val;
    },

    // Previsualización de imágenes
    renderImagePreviews(containerId, images) {
        const container = document.getElementById(containerId);
        container.innerHTML = images.map((img, i) => `
            <div class="image-preview">
                <img src="${img}" alt="Evidencia ${i+1}">
                <button type="button" class="remove-img" onclick="Controller.removeImage('${containerId}',${i})"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    },

    // Estadísticas de órdenes
    renderOrdenesStats(ordenes) {
        const total = ordenes.length;
        const pendientes = ordenes.filter(o => o.estado === 'pendiente').length;
        const completadas = ordenes.filter(o => o.estado === 'completada').length;
        document.getElementById('ordenesStats').innerHTML = `
            <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-clipboard-list"></i></div><div class="stat-info"><h4>${total}</h4><p>Total órdenes</p></div></div>
            <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-clock"></i></div><div class="stat-info"><h4>${pendientes}</h4><p>Pendientes</p></div></div>
            <div class="stat-card"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h4>${completadas}</h4><p>Completadas</p></div></div>
        `;
    },
    // Ver detalle de reporte
    renderVerReporte(reporte) {
        const c = document.getElementById('verReporteContent');
        let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">`;
        html += `<div><strong>Equipo:</strong> ${Utils.esc(reporte.equipoCodigo||'')} - ${Utils.esc(reporte.equipoNombre||'')}</div>`;
        html += `<div><strong>Fecha:</strong> ${Utils.formatDateShort(reporte.fecha)}</div>`;
        html += `<div><strong>Hora Inicio:</strong> ${reporte.horaInicio||'-'}</div>`;
        html += `<div><strong>Hora Final:</strong> ${reporte.horaFin||'-'}</div>`;
        html += `<div><strong>Tiempo Total:</strong> ${reporte.tiempoTotal||0} min</div>`;
        html += `<div><strong>Realizado por:</strong> ${Utils.esc(reporte.realizadoPorNombre||'')}</div>`;
        html += `<div><strong>Estado Equipo:</strong> <span class="badge badge-${reporte.estadoEquipo==='Funcionando'?'success':reporte.estadoEquipo==='Con falla'?'warning':'danger'}">${Utils.esc(reporte.estadoEquipo||'')}</span></div>`;
        const tipo = reporte.tipoOrden || 'Mantenimiento Correctivo';
        html += `<div><strong>Tipo Orden:</strong> ${Utils.esc(tipo)}</div>`;
        html += `</div>`;
        if (reporte.tareas && reporte.tareas.length) {
            html += `<div style="margin-top:14px;"><strong>Tareas:</strong> ${reporte.tareas.map(t => `<span class="badge badge-info" style="margin:2px;">${Utils.esc(t)}</span>`).join('')}</div>`;
        }
        if (reporte.fallaReportada) html += `<div style="margin-top:10px;"><strong>Falla Reportada:</strong> ${Utils.esc(reporte.fallaReportada)}</div>`;
        html += `<div style="margin-top:10px;"><strong>Actividades Realizadas:</strong><br>${Utils.esc(reporte.actividadesRealizadas||'')}</div>`;
        if (reporte.repuestos) html += `<div style="margin-top:10px;"><strong>Repuestos:</strong><br>${Utils.esc(reporte.repuestos)}</div>`;
        if (reporte.observaciones) html += `<div style="margin-top:10px;"><strong>Observaciones:</strong><br>${Utils.esc(reporte.observaciones)}</div>`;
        html += `<div style="margin-top:10px;"><strong>Recibido por:</strong> ${Utils.esc(reporte.recibidoPorNombre||'')}</div>`;
        if (reporte.evidencias && reporte.evidencias.length) {
            html += `<div style="margin-top:16px;"><strong>Evidencia Fotográfica:</strong><div class="image-preview-container" style="margin-top:8px;">`;
            reporte.evidencias.forEach(img => { html += `<div class="image-preview" style="width:120px;height:120px;cursor:pointer;"><img src="${img}" alt="Evidencia"></div>`; });
            html += `</div></div>`;
        }
        c.innerHTML = html;
    },

    renderDashboard(data) {
        const container = document.getElementById('dashboardContent');
        const { ordenes, reportes } = data;
        
        const total = ordenes.length;
        const preventivos = ordenes.filter(o => o.tipo === 'Preventivo').length;
        const correctivos = ordenes.filter(o => o.tipo === 'Correctivo').length;
        const locativos = ordenes.filter(o => o.tipo === 'Locativo').length;
        const instalaciones = ordenes.filter(o => o.tipo === 'Instalación').length;
        const pendientes = ordenes.filter(o => o.estado === 'pendiente').length;
        const completadas = ordenes.filter(o => o.estado === 'completada').length;

        // Eficiencia correctivos
        const repsCorr = reportes.filter(r => r.tipo === 'correctivo' && r.tiempoTotal);
        let tiempoProm = 0;
        if (repsCorr.length > 0) {
            tiempoProm = Math.round(repsCorr.reduce((acc, curr) => acc + (curr.tiempoTotal || 0), 0) / repsCorr.length);
        }

                // Equipo que más falla (por código) y su tiempo acumulado
        const conteoEq = {};
        repsCorr.forEach(r => {
            const code = r.equipoCodigo || 'Sin código';
            if (!conteoEq[code]) conteoEq[code] = { count: 0, time: 0 };
            conteoEq[code].count++;
            conteoEq[code].time += (r.tiempoTotal || 0);
        });
        let eqMasFalla = null, maxFallas = 0, tiempoAcumulado = 0;
        for (const [codigo, data] of Object.entries(conteoEq)) {
            if (data.count > maxFallas) {
                maxFallas = data.count;
                eqMasFalla = codigo;
                tiempoAcumulado = data.time;
            }
        }
        
        // Formatear tiempo acumulado (a horas y minutos si pasa de 60 min)
        const horas = Math.floor(tiempoAcumulado / 60);
        const mins = tiempoAcumulado % 60;
        const tiempoFormateado = horas > 0 ? `${horas}h ${mins}m` : `${mins} min`;

        // Preventivos realizados
        const prevRealizados = reportes.filter(r => r.tipoOrden && r.tipoOrden.includes('Preventivo')).length;

        container.innerHTML = `
            <div class="dash-grid">
                <div class="dash-card"><div class="dash-icon blue"><i class="fas fa-clipboard-list"></i></div><div class="dash-info"><h4>${total}</h4><p>Total Órdenes</p></div></div>
                <div class="dash-card"><div class="dash-icon green"><i class="fas fa-check-circle"></i></div><div class="dash-info"><h4>${completadas}</h4><p>Completadas</p></div></div>
                <div class="dash-card"><div class="dash-icon orange"><i class="fas fa-clock"></i></div><div class="dash-info"><h4>${pendientes}</h4><p>Pendientes</p></div></div>
                <div class="dash-card"><div class="dash-icon purple"><i class="fas fa-tools"></i></div><div class="dash-info"><h4>${prevRealizados}</h4><p>Preventivos Ejecutados</p></div></div>
            </div>

            <div class="card" style="margin-bottom: 24px;">
                <div class="card-body" style="padding: 16px;">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; text-align: center;">
                        <div style="background:var(--accent-light);padding:14px;border-radius:var(--radius-sm);"><div style="font-size:1.4rem;font-weight:800;color:var(--accent);">${preventivos}</div><div style="font-size:0.78rem;color:var(--text-sec);margin-top:4px;">Preventivos</div></div>
                        <div style="background:var(--danger-bg);padding:14px;border-radius:var(--radius-sm);"><div style="font-size:1.4rem;font-weight:800;color:var(--danger);">${correctivos}</div><div style="font-size:0.78rem;color:var(--text-sec);margin-top:4px;">Correctivos</div></div>
                        <div style="background:var(--warning-bg);padding:14px;border-radius:var(--radius-sm);"><div style="font-size:1.4rem;font-weight:800;color:#B45309;">${locativos}</div><div style="font-size:0.78rem;color:var(--text-sec);margin-top:4px;">Locativos</div></div>
                        <div style="background:rgba(139,92,246,0.1);padding:14px;border-radius:var(--radius-sm);"><div style="font-size:1.4rem;font-weight:800;color:#8B5CF6;">${instalaciones}</div><div style="font-size:0.78rem;color:var(--text-sec);margin-top:4px;">Instalación</div></div>
                    </div>
                </div>
            </div>

            <div class="dash-row">
                <div class="dash-detail-card">
                    <h3><i class="fas fa-tachometer-alt"></i> Eficiencia Correctivos</h3>
                    <div style="text-align:center;padding:20px 0;">
                        <div style="font-size:3rem;font-weight:800;color:var(--primary);line-height:1;">${tiempoProm}</div>
                        <div style="font-size:0.9rem;color:var(--muted);margin-top:8px;">Minutos promedio</div>
                        <div style="font-size:0.8rem;color:var(--text-sec);margin-top:4px;">Basado en ${repsCorr.length} reporte(s)</div>
                    </div>
                </div>
                <div class="dash-detail-card">
                    <h3><i class="fas fa-exclamation-triangle"></i> Equipo que más falla</h3>
                    ${eqMasFalla 
                        ? `<div class="dash-eq-falla" style="flex-direction:column;align-items:flex-start;gap:8px;">
                                <div style="display:flex;justify-content:space-between;width:100%;align-items:center;">
                                    <span class="eq-name">${Utils.esc(eqMasFalla)}</span>
                                    <span class="eq-count">${maxFallas}</span>
                                </div>
                                <div style="font-size:0.85rem;color:var(--text-sec);">
                                    <i class="fas fa-clock" style="margin-right:4px;color:var(--warning);"></i> Tiempo acumulado: <strong>${tiempoFormateado}</strong>
                                </div>
                           </div>
                           <p style="font-size:0.82rem;color:var(--muted);margin-top:12px;">Equipo con mayor cantidad de mantenimientos correctivos registrados.</p>`
                        : `<div class="empty-state" style="padding:30px 0;"><i class="fas fa-smile-beam"></i><p>Sin registros de fallas aún</p></div>`
                    }
                </div>
            </div>
        `;
    }
    
};

// ============================================
// CONTROLADOR - Lógica de negocio
// ============================================
const Controller = {
    // Estado de la aplicación
    state: {
        currentUser: null,
        currentUserDoc: null,
        equipos: [],
        tecnicos: [],
        ordenes: [],
        equiposPage: 1,
        equiposPerPage: 15,
        ordenesLastDoc: null,
        ordenesPage: 1,
        correctivosLastDoc: null,
        correctivosPage: 1,
        reportesOTLastDoc: null,
        reportesOTPage: 1,
        currentReporteData: null,
        reporteOTFotos: [],
        correctivoFotos: [],
        selectedEquipoHistorial: null,
        logo: null
    },
    async loadDashboard() {
        const [ordenes, reportes] = await Promise.all([
            Model.ordenGetAllNoPag(),
            Model.reporteGetAll()
        ]);
        View.renderDashboard({ ordenes, reportes });
    },
    // --- INICIALIZACIÓN ---
    async init() {
        // Escuchar estado de autenticación
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                // Verificar documento de usuario
                let userDoc = await Model.userDocGet(user.uid);
                // Si no existe, crearlo (primera vez)
                if (!userDoc) {
                    const role = user.email === 'admin@lleser.com' ? 'admin' : 'tecnico';
                    await Model.userDocCreate(user.uid, { nombre: user.email.split('@')[0], email: user.email, role });
                    userDoc = await Model.userDocGet(user.uid);
                }
                // Verificar si está activo
                if (userDoc.activo === false) {
                    View.toast('Tu cuenta ha sido desactivada. Contacta al administrador.', 'error');
                    auth.signOut();
                    return;
                }
                this.state.currentUser = user;
                this.state.currentUserDoc = userDoc;
                this.showApp();
            } else {
                this.showLogin();
            }
        });

        // Eventos generales
        this.bindEvents();
    },

    showLogin() {
        View.hide('appBootScreen');
        View.hide('appContainer');
        View.show('loginScreen');
    },

    async showApp() {
        View.hide('appBootScreen');
        View.hide('loginScreen');
        View.show('appContainer');

        const userDoc = this.state.currentUserDoc;
        const isAdmin = userDoc.role === 'admin';

        // Info del sidebar
        document.getElementById('sidebarUserName').textContent = userDoc.nombre;
        document.getElementById('sidebarUserRole').textContent = isAdmin ? 'Administrador' : 'Técnico';
        document.getElementById('sidebarAvatar').textContent = userDoc.nombre.charAt(0).toUpperCase();

        // Mostrar/ocultar elementos de admin
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });

        // Cargar logo, técnicos y equipos en paralelo (antes se hacía uno por uno)
        const [logo] = await Promise.all([
            Model.getLogo(),
            this.loadTecnicos(),
            this.loadEquipos()
        ]);
        this.state.logo = logo;
        if (this.state.logo) this.updateLogoPreview(this.state.logo);
           // Actualizar select de historial
        const histSelect = document.getElementById('selectEquipoHistorial');
        if(histSelect) histSelect.innerHTML = '<option value="">-- Seleccionar equipo --</option>' + this.state.equipos.map(e => `<option value="${e.id}">${Utils.esc(e.codigo)} - ${Utils.esc(e.nombre)}</option>`).join('');
        // Restaurar vista
        const savedView = localStorage.getItem('lleser_view');
        const defaultView = isAdmin ? 'dashboard' : 'reportesOT';
        // Forzar vista de reportes si no es admin y trata de acceder a otra vista
        const validTechViews = ['reportesOT'];
        const finalView = (isAdmin || validTechViews.includes(savedView)) ? savedView : defaultView;
        View.setView(isAdmin ? savedView || defaultView : finalView);
        // Cargar datos de la vista actual
        await this.loadCurrentViewData();
    },

    async loadCurrentViewData() {
        const view = localStorage.getItem('lleser_view') || 'equipos';
        switch(view) {
            case 'dashboard': await this.loadDashboard(); break;
            case 'equipos': this.filterEquipos(); break;
            case 'ordenes': await this.loadOrdenes(); break;
            case 'reportesOT': await this.loadReportesOT(); break;
            case 'reportesCorrectivo': await this.loadCorrectivos(); break;
            case 'configuracion': await this.loadConfiguracion(); break;
        }
    },

    // --- LOGIN ---
    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPassword').value;
        const btn = document.getElementById('loginBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner spinner-sm"></span> Ingresando...';
        try {
            await auth.signInWithEmailAndPassword(email, pass);
        } catch (err) {
            View.toast(this.translateError(err.code), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Ingresar';
        }
    },

    handleLogout() {
        auth.signOut();
        localStorage.removeItem('lleser_view');
        this.state = { currentUser:null, currentUserDoc:null, equipos:[], tecnicos:[], ordenes:[], equiposPage:1, equiposPerPage:15, ordenesLastDoc:null, ordenesPage:1, correctivosLastDoc:null, correctivosPage:1, reportesOTLastDoc:null, reportesOTPage:1, currentReporteData:null, reporteOTFotos:[], correctivoFotos:[], selectedEquipoHistorial:null, logo:null };
    },

    translateError(code) {
        const map = { 'auth/user-not-found': 'Usuario no encontrado', 'auth/wrong-password': 'Contraseña incorrecta', 'auth/invalid-email': 'Correo inválido', 'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.', 'auth/invalid-credential': 'Credenciales inválidas', 'auth/email-already-in-use': 'El correo ya está en uso', 'auth/weak-password': 'La contraseña es muy débil (mínimo 6 caracteres)' };
        return map[code] || 'Error de autenticación';
    },

    // --- EQUIPOS ---
    async loadEquipos() {
        this.state.equipos = await Model.equipoGetAll();
    },

    filterEquipos() {
        const term = document.getElementById('searchEquipo').value.toLowerCase().trim();
        let filtered = this.state.equipos;

        if (term) {
            // Verificar si es numérico para buscar por número de orden
            const isNumeric = /^\d+$/.test(term);
            let ordenEquipoId = null;
            // Búsqueda síncrona simplificada: buscar en las órdenes ya cargadas
            if (isNumeric && this.state.ordenes.length) {
                const num = parseInt(term);
                const ord = this.state.ordenes.find(o => o.numero === num);
                if (ord) ordenEquipoId = ord.equipoId;
            }

            filtered = this.state.equipos.filter(eq => {
                if ((eq.codigo||'').toLowerCase().includes(term)) return true;
                if ((eq.nombre||'').toLowerCase().includes(term)) return true;
                if ((eq.serie||'').toLowerCase().includes(term)) return true;
                if ((eq.ubicacion||'').toLowerCase().includes(term)) return true;
                if (ordenEquipoId && eq.id === ordenEquipoId) return true;
                return false;
            });
        }

        // Paginación local
        const page = this.state.equiposPage;
        const perPage = this.state.equiposPerPage;
        const total = filtered.length;
        const totalPages = Math.ceil(total / perPage);
        if (page > totalPages && totalPages > 0) this.state.equiposPage = totalPages;
        const start = (this.state.equiposPage - 1) * perPage;
        const paged = filtered.slice(start, start + perPage);

        View.renderEquipos(paged);
        View.renderPagination('equiposPagination', this.state.equiposPage, totalPages, (p) => {
            this.state.equiposPage = p;
            this.filterEquipos();
        });
    },

    async saveEquipo() {
        const id = document.getElementById('equipoId').value;
        const data = {
            codigo: document.getElementById('equipoCodigo').value.trim(),
            nombre: document.getElementById('equipoNombre').value.trim(),
            marca: document.getElementById('equipoMarca').value.trim(),
            modelo: document.getElementById('equipoModelo').value.trim(),
            serie: document.getElementById('equipoSerie').value.trim(),
            ubicacion: document.getElementById('equipoUbicacion').value.trim()
        };
        if (!data.codigo || !data.nombre) { View.toast('Código y nombre son obligatorios', 'warning'); return; }
        try {
            if (id) {
                await Model.equipoUpdate(id, data);
                View.toast('Equipo actualizado correctamente', 'success');
            } else {
                await Model.equipoCreate(data);
                View.toast('Equipo creado correctamente', 'success');
            }
            App.closeModal('modalEquipo');
            await this.loadEquipos();
                        // Actualizar select de historial
            const histSelect = document.getElementById('selectEquipoHistorial');
            if(histSelect) histSelect.innerHTML = '<option value="">-- Seleccionar equipo --</option>' + this.state.equipos.map(e => `<option value="${e.id}">${Utils.esc(e.codigo)} - ${Utils.esc(e.nombre)}</option>`).join('');
            this.filterEquipos();
        } catch (err) {
            View.toast('Error al guardar: ' + err.message, 'error');
        }
    },

    async editEquipo(id) {
        const eq = this.state.equipos.find(e => e.id === id);
        if (!eq) return;
        document.getElementById('modalEquipoTitle').textContent = 'Editar Equipo';
        document.getElementById('equipoId').value = eq.id;
        document.getElementById('equipoCodigo').value = eq.codigo || '';
        document.getElementById('equipoNombre').value = eq.nombre || '';
        document.getElementById('equipoMarca').value = eq.marca || '';
        document.getElementById('equipoModelo').value = eq.modelo || '';
        document.getElementById('equipoSerie').value = eq.serie || '';
        document.getElementById('equipoUbicacion').value = eq.ubicacion || '';
        App.openModal('modalEquipo');
    },

    async deleteEquipo(id) {
        const confirmed = await View.confirm('¿Estás seguro de que deseas eliminar este equipo?');
        if (!confirmed) return;
        try {
            await Model.equipoDelete(id);
            View.toast('Equipo eliminado', 'success');
            await this.loadEquipos();
            // Actualizar select de historial
            const histSelect = document.getElementById('selectEquipoHistorial');
            if(histSelect) histSelect.innerHTML = '<option value="">-- Seleccionar equipo --</option>' + this.state.equipos.map(e => `<option value="${e.id}">${Utils.esc(e.codigo)} - ${Utils.esc(e.nombre)}</option>`).join('');
            this.filterEquipos();
        } catch (err) {
            View.toast('Error al eliminar: ' + err.message, 'error');
        }
    },

    async importExcel() {
        const input = document.getElementById('excelFileInput');
        if (!input.files.length) return;
        const file = input.files[0];
        try {
            const data = await file.arrayBuffer();
            const wb = XLSX.read(data);
            const ws = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);
            if (!rows.length) { View.toast('El archivo está vacío', 'warning'); return; }
            let count = 0;
            for (const row of rows) {
                const codigo = (row['Código'] || row['codigo'] || row['Codigo'] || '').toString().trim();
                const nombre = (row['Nombre'] || row['nombre'] || '').toString().trim();
                if (!codigo || !nombre) continue;
                await Model.equipoCreate({
                    codigo,
                    nombre,
                    marca: (row['Marca'] || row['marca'] || '').toString().trim(),
                    modelo: (row['Modelo'] || row['modelo'] || '').toString().trim(),
                    serie: (row['Serie'] || row['serie'] || '').toString().trim(),
                    ubicacion: (row['Ubicación'] || row['Ubicacion'] || row['ubicacion'] || '').toString().trim()
                });
                count++;
            }
            View.toast(`${count} equipos importados correctamente`, 'success');
            await this.loadEquipos();
            this.filterEquipos();
        } catch (err) {
            View.toast('Error al importar: ' + err.message, 'error');
        }
        input.value = '';
    },

    // --- ÓRDENES DE TRABAJO ---
    async loadOrdenes() {
        const result = await Model.ordenGetAll(15, this.state.ordenesLastDoc);
        if (this.state.ordenesPage === 1) this.state.ordenes = result.data;
        else this.state.ordenes = [...this.state.ordenes, ...result.data];
        this.state.ordenesLastDoc = result.lastDoc;
        View.renderOrdenes(this.state.ordenes);
        View.renderOrdenesStats(this.state.ordenes);

        // Botón "Cargar más" si hay más datos
        const pag = document.getElementById('ordenesPagination');
        if (result.lastDoc && result.data.length === 15) {
            pag.innerHTML = `<button class="btn btn-outline btn-sm" id="loadMoreOrdenes"><i class="fas fa-chevron-down"></i> Cargar más</button>`;
            document.getElementById('loadMoreOrdenes')?.addEventListener('click', () => {
                this.state.ordenesPage++;
                this.loadOrdenes();
            });
        } else {
            pag.innerHTML = '';
        }
    },

    async saveOrden() {
        const id = document.getElementById('ordenId').value;
        const equipoId = document.getElementById('ordenEquipo').value;
        const tipo = document.querySelector('input[name="ordenTipo"]:checked')?.value;
        const actividades = document.getElementById('ordenActividades').value.trim();
        if (!equipoId || !tipo || !actividades) { View.toast('Todos los campos son obligatorios', 'warning'); return; }
        const equipo = this.state.equipos.find(e => e.id === equipoId);
        try {
            if (id) {
                await Model.ordenUpdate(id, { equipoId, equipoCodigo: equipo?.codigo||'', equipoNombre: equipo?.nombre||'', tipo, actividades });
                View.toast('Orden actualizada', 'success');
            } else {
                await Model.ordenCreate({ equipoId, equipoCodigo: equipo?.codigo||'', equipoNombre: equipo?.nombre||'', tipo, actividades });
                View.toast('Orden creada correctamente', 'success');
            }
            App.closeModal('modalOrden');
            this.state.ordenesPage = 1;
            this.state.ordenesLastDoc = null;
            this.state.ordenes = [];
            await this.loadOrdenes();
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    async editOrden(id) {
        const ord = this.state.ordenes.find(o => o.id === id);
        if (!ord) return;
        document.getElementById('modalOrdenTitle').textContent = 'Editar Orden #' + ord.numero;
        document.getElementById('ordenId').value = ord.id;
        View.fillEquiposSelect('ordenEquipo', this.state.equipos);
        document.getElementById('ordenEquipo').value = ord.equipoId || '';
        const radio = document.querySelector(`input[name="ordenTipo"][value="${ord.tipo}"]`);
        if (radio) radio.checked = true;
        document.getElementById('ordenActividades').value = ord.actividades || '';
        App.openModal('modalOrden');
    },

    async deleteOrden(id) {
        const confirmed = await View.confirm('¿Eliminar esta orden de trabajo?');
        if (!confirmed) return;
        try {
            await Model.ordenDelete(id);
            View.toast('Orden eliminada', 'success');
            this.state.ordenesPage = 1;
            this.state.ordenesLastDoc = null;
            this.state.ordenes = [];
            await this.loadOrdenes();
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- REPORTES DE OT ---
    async loadReportesOT() {
        const result = await Model.ordenGetAll(15, this.state.reportesOTLastDoc);
        const allOrdenes = this.state.ordenesPage === 1 ? result.data : [...this.state.ordenes, ...result.data];
        if (this.state.reportesOTPage === 1) this.state.ordenes = allOrdenes;
        else this.state.ordenes = [...this.state.ordenes, ...result.data];
        this.state.reportesOTLastDoc = result.lastDoc;
        View.renderReportesOT(this.state.ordenes);
        const pag = document.getElementById('reportesOTPagination');
        if (result.lastDoc && result.data.length === 15) {
            pag.innerHTML = `<button class="btn btn-outline btn-sm" id="loadMoreReportesOT"><i class="fas fa-chevron-down"></i> Cargar más</button>`;
            document.getElementById('loadMoreReportesOT')?.addEventListener('click', () => {
                this.state.reportesOTPage++;
                this.loadReportesOT();
            });
        } else { pag.innerHTML = ''; }
    },

    async abrirReporteOT(ordenId) {
        const ord = this.state.ordenes.find(o => o.id === ordenId);
        if (!ord) { await this.loadOrdenes(); return; }
        document.getElementById('modalReporteOTTitle').textContent = `Reportar Orden #${ord.numero}`;
        document.getElementById('reporteOTOrdenId').value = ordenId;
        document.getElementById('reporteOTId').value = '';
        document.getElementById('reporteOTFecha').value = Utils.today();
        document.getElementById('reporteOTHoraInicio').value = '';
        document.getElementById('reporteOTHoraFin').value = '';
        View.fillTecnicosSelect('reporteOTRealiza', this.state.tecnicos);
        View.fillTecnicosSelect('reporteOTRecibido', this.state.tecnicos);
                // Adaptar formulario según el tipo de orden
        const esLocativo = ord.tipo === 'Locativo';
        document.getElementById('reporteOTCamposEspeciales').style.display = esLocativo ? 'none' : 'block';
        document.getElementById('labelRepuestosOT').textContent = esLocativo ? 'Materiales Usados' : 'Repuestos Utilizados';
        document.querySelectorAll('input[name="reporteOTEstado"]').forEach(r => r.checked = false);
        document.querySelectorAll('#reporteOTTareas input[type="checkbox"]').forEach(c => c.checked = false);
        document.getElementById('reporteOTActividades').value = '';
        document.getElementById('reporteOTRepuestos').value = '';
        document.getElementById('reporteOTObservaciones').value = '';
        this.state.reporteOTFotos = [];
        View.renderImagePreviews('reporteOTFotosPreview', []);
        document.getElementById('reporteOTFotos').value = '';
        App.openModal('modalReporteOT');
    },

    async saveReporteOT() {
        const ordenId = document.getElementById('reporteOTOrdenId').value;
        const existId = document.getElementById('reporteOTId').value;
        const orden = this.state.ordenes.find(o => o.id === ordenId);
        if (!orden) { View.toast('Orden no encontrada', 'error'); return; }

        const fecha = document.getElementById('reporteOTFecha').value;
        const horaInicio = document.getElementById('reporteOTHoraInicio').value;
        const horaFin = document.getElementById('reporteOTHoraFin').value;
        const realizaId = document.getElementById('reporteOTRealiza').value;
        const esLocativo = orden.tipo === 'Locativo';
        const estadoEquipo = esLocativo ? 'N/A' : (document.querySelector('input[name="reporteOTEstado"]:checked')?.value);
        const tareas = esLocativo ? [] : Array.from(document.querySelectorAll('#reporteOTTareas input:checked')).map(c => c.value);
        const actividades = document.getElementById('reporteOTActividades').value.trim();
        const repuestos = document.getElementById('reporteOTRepuestos').value.trim();
        const observaciones = document.getElementById('reporteOTObservaciones').value.trim();
        const recibidoId = document.getElementById('reporteOTRecibido').value;

                if (!fecha || !horaInicio || !horaFin || !realizaId || !actividades || !recibidoId) {
        View.toast('Completa todos los campos obligatorios', 'warning'); return;
        }

        const realizaTec = await Model.tecnicoGetById(realizaId);
        const recibidoTec = await Model.tecnicoGetById(recibidoId);

        const reportData = {
            tipo: 'orden',
            ordenId,
            ordenNumero: orden.numero,
            tipoOrden: 'Mantenimiento ' + orden.tipo,
            equipoId: orden.equipoId,
            equipoCodigo: orden.equipoCodigo,
            equipoNombre: orden.equipoNombre,
            fecha, horaInicio, horaFin,
            tiempoTotal: Utils.calcMinutes(horaInicio, horaFin),
            realizadoPorId: realizaId,
            realizadoPorNombre: realizaTec?.nombre || '',
            realizadoPorCargo: realizaTec?.cargo || '',
            realizadoPorFirma: realizaTec?.firma || '',
            estadoEquipo,
            tareas,
            actividadesRealizadas: actividades,
            repuestos: repuestos || null,
            observaciones: observaciones || null,
            recibidoPorId: recibidoId,
            recibidoPorNombre: recibidoTec?.nombre || '',
            recibidoPorCargo: recibidoTec?.cargo || '',
            recibidoPorFirma: recibidoTec?.firma || '',
            evidencias: this.state.reporteOTFotos.length ? this.state.reporteOTFotos : null
        };

        try {
            let reportId = existId;
            if (existId) {
                await Model.reporteUpdate(existId, reportData);
            } else {
                const ref = await Model.reporteCreate(reportData);
                reportId = ref.id;
                await Model.ordenUpdate(ordenId, { estado: 'completada', reportId });
            }
            this.state.currentReporteData = { ...reportData, id: reportId };
            View.toast('Reporte guardado correctamente', 'success');
            App.closeModal('modalReporteOT');
            this.state.reportesOTPage = 1;
            this.state.reportesOTLastDoc = null;
            this.state.ordenes = [];
            await this.loadReportesOT();
            // También recargar órdenes para actualizar stats
            this.state.ordenesPage = 1;
            this.state.ordenesLastDoc = null;
            await this.loadOrdenes();
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- REPORTES CORRECTIVOS ---
    async loadCorrectivos() {
        const result = await Model.reporteGetAllCorrectivos(15, this.state.correctivosLastDoc);
        if (this.state.correctivosPage === 1) {
            View.renderCorrectivos(result.data);
        } else {
            const tbody = document.getElementById('tbodyCorrectivos');
            result.data.forEach(r => {
                const estadoClass = r.estadoEquipo === 'Funcionando' ? 'success' : r.estadoEquipo === 'Con falla' ? 'warning' : 'danger';
                tbody.innerHTML += `<tr>
                    <td>${Utils.formatDateShort(r.fecha)}</td>
                    <td>${Utils.esc(r.equipoNombre||'')}</td>
                    <td>${Utils.esc(r.realizadoPorNombre||'')}</td>
                    <td><span class="badge badge-${estadoClass}">${Utils.esc(r.estadoEquipo||'')}</span></td>
                    <td class="text-right">
                        <button class="btn btn-outline btn-sm" onclick="Controller.verReporte('${r.id}')"><i class="fas fa-eye"></i> Ver</button>
                        <button class="btn-icon btn-outline" style="color:var(--danger);margin-left:4px;" onclick="Controller.deleteReporte('${r.id}','')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
        this.state.correctivosLastDoc = result.lastDoc;
        const pag = document.getElementById('correctivosPagination');
        if (result.lastDoc && result.data.length === 15) {
            pag.innerHTML = `<button class="btn btn-outline btn-sm" id="loadMoreCorrectivos"><i class="fas fa-chevron-down"></i> Cargar más</button>`;
            document.getElementById('loadMoreCorrectivos')?.addEventListener('click', () => {
                this.state.correctivosPage++;
                this.loadCorrectivos();
            });
        } else { pag.innerHTML = ''; }
    },

        async saveCorrectivo() {
        const equipoId = document.getElementById('correctivoEquipo').value;
        const equipo = this.state.equipos.find(e => e.id === equipoId);
        const fecha = document.getElementById('correctivoFecha').value;
        const horaInicio = document.getElementById('correctivoHoraInicio').value;
        const horaFin = document.getElementById('correctivoHoraFin').value;
        const realizaId = document.getElementById('correctivoRealiza').value;
        const estadoEquipo = document.querySelector('input[name="correctivoEstado"]:checked')?.value;
        const tareas = Array.from(document.querySelectorAll('#correctivoTareas input:checked')).map(c => c.value);
        const fallaReportada = document.getElementById('correctivoFalla').value.trim();
        const actividades = document.getElementById('correctivoActividades').value.trim();
        const repuestos = document.getElementById('correctivoRepuestos').value.trim();
        const observaciones = document.getElementById('correctivoObservaciones').value.trim();
        const recibidoId = document.getElementById('correctivoRecibido').value;

        if (!equipoId || !fecha || !horaInicio || !horaFin || !realizaId || !estadoEquipo || !fallaReportada || !actividades || !recibidoId) {
            View.toast('Completa todos los campos obligatorios', 'warning'); return;
        }

        const realizaTec = await Model.tecnicoGetById(realizaId);
        const recibidoTec = await Model.tecnicoGetById(recibidoId);

        try {
            // 1. Obtener consecutivo automático
            const num = await Model.getNextOrdenNumber();
            
            // 2. Crear la Orden de Trabajo en la base de datos
            const ordRef = await db.collection('workOrders').add({
                numero: num,
                equipoId, equipoCodigo: equipo?.codigo||'', equipoNombre: equipo?.nombre||'',
                tipo: 'Correctivo',
                actividades: fallaReportada,
                estado: 'completada',
                reportId: 'pending',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 3. Crear el Reporte asociado a esa orden
            const reportData = {
                tipo: 'correctivo',
                ordenId: ordRef.id,
                ordenNumero: num,
                tipoOrden: 'Mantenimiento Correctivo',
                equipoId, equipoCodigo: equipo?.codigo||'', equipoNombre: equipo?.nombre||'',
                fecha, horaInicio, horaFin,
                tiempoTotal: Utils.calcMinutes(horaInicio, horaFin),
                realizadoPorId: realizaId, realizadoPorNombre: realizaTec?.nombre||'',
                realizadoPorCargo: realizaTec?.cargo||'', realizadoPorFirma: realizaTec?.firma||'',
                estadoEquipo, tareas, fallaReportada,
                actividadesRealizadas: actividades,
                repuestos: repuestos||null, observaciones: observaciones||null,
                recibidoPorId: recibidoId, recibidoPorNombre: recibidoTec?.nombre||'',
                recibidoPorCargo: recibidoTec?.cargo||'', recibidoPorFirma: recibidoTec?.firma||'',
                evidencias: this.state.correctivoFotos.length ? this.state.correctivoFotos : null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            const repRef = await db.collection('reports').add(reportData);

            // 4. Actualizar la orden con el ID real del reporte
            await db.collection('workOrders').doc(ordRef.id).update({ reportId: repRef.id });

            View.toast(`Correctivo #${num} guardado y registrado en Órdenes`, 'success');
            App.closeModal('modalCorrectivo');
            
            // 5. Recargar vistas
            this.state.ordenesPage = 1; this.state.ordenesLastDoc = null; this.state.ordenes = [];
            await this.loadOrdenes();
            this.state.reportesOTPage = 1; this.state.reportesOTLastDoc = null; this.state.ordenes = [];
            await this.loadReportesOT();
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    async deleteReporte(reporteId, ordenId) {
        const confirmed = await View.confirm('¿Eliminar este reporte?');
        if (!confirmed) return;
        try {
            // Si tenía orden asociada, actualizar estado
            if (ordenId) {
                await Model.ordenUpdate(ordenId, { estado: 'pendiente', reportId: null });
            }
            await db.collection('reports').doc(reporteId).delete();
            View.toast('Reporte eliminado', 'success');
            // Recargar la vista correcta
            const view = localStorage.getItem('lleser_view');
            if (view === 'reportesCorrectivo') {
                this.state.correctivosPage = 1;
                this.state.correctivosLastDoc = null;
                await this.loadCorrectivos();
            } else {
                this.state.reportesOTPage = 1;
                this.state.reportesOTLastDoc = null;
                this.state.ordenes = [];
                await this.loadReportesOT();
            }
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- VER REPORTE ---
    async verReporte(reporteId) {
        const reporte = await Model.reporteGetById(reporteId);
        if (!reporte) { View.toast('Reporte no encontrado', 'error'); return; }
        this.state.currentReporteData = reporte;
        View.renderVerReporte(reporte);
        App.openModal('modalVerReporte');
    },

    async generarPDFDesdeOrden(reporteId) {
        View.toast('Generando PDF...', 'info');
        const reporte = await Model.reporteGetById(reporteId);
        if (reporte) this.generatePDF(reporte);
        else View.toast('Error al cargar el reporte', 'error');
    },

    // --- MANEJO DE IMÁGENES ---
    async handleImageUpload(inputId, stateKey) {
        const input = document.getElementById(inputId);
        const files = input.files;
        for (const file of files) {
            const base64 = await Utils.compressImage(file, 800, 0.7);
            this.state[stateKey].push(base64);
        }
        const previewId = inputId === 'reporteOTFotos' ? 'reporteOTFotosPreview' : 'correctivoFotosPreview';
        View.renderImagePreviews(previewId, this.state[stateKey]);
        input.value = '';
    },

    removeImage(containerId, index) {
        const key = containerId === 'reporteOTFotosPreview' ? 'reporteOTFotos' : 'correctivoFotos';
        this.state[key].splice(index, 1);
        View.renderImagePreviews(containerId, this.state[key]);
    },

    // --- TÉCNICOS ---
    async loadTecnicos() {
        this.state.tecnicos = await Model.tecnicoGetAll();
    },

    async saveTecnico() {
        const id = document.getElementById('tecnicoId').value;
        const nombre = document.getElementById('tecnicoNombre').value.trim();
        const cargo = document.getElementById('tecnicoCargo').value.trim();
        const firma = document.getElementById('tecnicoFirma').value;
        if (!nombre || !cargo) { View.toast('Nombre y cargo son obligatorios', 'warning'); return; }
        try {
            if (id) {
                await Model.tecnicoUpdate(id, { nombre, cargo, firma: firma || null });
                View.toast('Técnico actualizado', 'success');
            } else {
                await Model.tecnicoCreate({ nombre, cargo, firma: firma || null });
                View.toast('Técnico creado', 'success');
            }
            App.closeModal('modalTecnico');
            await this.loadTecnicos();
            View.renderTecnicos(this.state.tecnicos);
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    async editTecnico(id) {
        const tec = this.state.tecnicos.find(t => t.id === id);
        if (!tec) return;
        document.getElementById('modalTecnicoTitle').textContent = 'Editar Técnico';
        document.getElementById('tecnicoId').value = tec.id;
        document.getElementById('tecnicoNombre').value = tec.nombre || '';
        document.getElementById('tecnicoCargo').value = tec.cargo || '';
        document.getElementById('tecnicoFirma').value = tec.firma || '';
        
        // Limpiar y mostrar firma existente si la hay
        document.getElementById('firmaPreview').innerHTML = '';
        if (tec.firma) {
            document.getElementById('firmaPreview').innerHTML = `<div class="image-preview"><img src="${tec.firma}" alt="Firma"><button type="button" class="remove-img" onclick="document.getElementById('tecnicoFirma').value='';this.parentElement.remove()"><i class="fas fa-times"></i></button></div>`;
        }
        
        // Limpiar input de archivo por si acaso
        const fileInput = document.getElementById('firmaFileInput');
        if (fileInput) fileInput.value = '';
        
        App.openModal('modalTecnico');
    },

    async deleteTecnico(id) {
        const confirmed = await View.confirm('¿Eliminar este técnico?');
        if (!confirmed) return;
        try {
            await Model.tecnicoDelete(id);
            View.toast('Técnico eliminado', 'success');
            await this.loadTecnicos();
            View.renderTecnicos(this.state.tecnicos);
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- USUARIOS ---
    async saveUsuario() {
        const id = document.getElementById('usuarioId').value;
        const nombre = document.getElementById('usuarioNombre').value.trim();
        const email = document.getElementById('usuarioEmail').value.trim();
        const password = document.getElementById('usuarioPassword').value;
        const role = document.getElementById('usuarioRol').value;
        if (!nombre || !email) { View.toast('Nombre y correo son obligatorios', 'warning'); return; }
        try {
            if (id) {
                await Model.userDocUpdate(id, { nombre, role });
                View.toast('Usuario actualizado', 'success');
            } else {
                if (!password || password.length < 6) { View.toast('La contraseña debe tener al menos 6 caracteres', 'warning'); return; }
                const cred = await Model.userCreateInAuth(email, password);
                await Model.userDocCreate(cred.user.uid, { nombre, email, role });
                // Cerrar sesión del usuario recién creado (está logueado como el nuevo usuario)
                await auth.signInWithEmailAndPassword(this.state.currentUser.email, '/*need current pass*/');
                // Mejor: re-autenticar al admin
                View.toast('Usuario creado correctamente', 'success');
            }
            App.closeModal('modalUsuario');
            await this.loadConfiguracion();
        } catch (err) {
            View.toast(this.translateError(err.code) || err.message, 'error');
            // Re-autenticar al admin si se perdió la sesión
            if (err.code === 'auth/id-token-expired' || this.state.currentUser) {
                // Intentar silenciosamente
            }
        }
    },

    async editUsuario(id, email) {
        document.getElementById('modalUsuarioTitle').textContent = 'Editar Usuario';
        document.getElementById('usuarioId').value = id;
        const userDoc = await Model.userDocGet(id);
        if (!userDoc) return;
        document.getElementById('usuarioNombre').value = userDoc.nombre || '';
        document.getElementById('usuarioEmail').value = userDoc.email || '';
        document.getElementById('usuarioEmail').disabled = true;
        document.getElementById('usuarioPasswordGroup').style.display = 'none';
        document.getElementById('usuarioRol').value = userDoc.role || 'tecnico';
        App.openModal('modalUsuario');
    },

    async toggleUsuario(id, currentlyActive) {
        const action = currentlyActive ? 'desactivar' : 'activar';
        const textoBtn = currentlyActive ? 'Desactivar' : 'Activar';
        const confirmed = await View.confirm(`¿${action.charAt(0).toUpperCase()+action.slice(1)} este usuario?`, textoBtn);
        if (!confirmed) return;
        try {
            await Model.userDocUpdate(id, { activo: !currentlyActive });
            View.toast(`Usuario ${currentlyActive ? 'desactivado' : 'activado'}`, 'success');
            await this.loadConfiguracion();
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- CONFIGURACIÓN ---
    async loadConfiguracion() {
        await this.loadTecnicos();
        View.renderTecnicos(this.state.tecnicos);
        const usuarios = await Model.userDocGetAll();
        View.renderUsuarios(usuarios);
    },

    async handleLogoUpload(file) {
        const base64 = await Utils.compressImage(file, 400, 0.9);
        this.updateLogoPreview(base64);
        this.state.logo = base64;
        View.show('btnSaveLogo');
        View.show('btnRemoveLogo');
    },

    updateLogoPreview(base64) {
        const content = document.getElementById('logoPreviewContent');
        content.innerHTML = `<img src="${base64}" alt="Logo"><p style="font-size:0.85rem;color:var(--muted);">Haz clic para cambiar el logotipo</p>`;
        View.show('btnSaveLogo');
        View.show('btnRemoveLogo');
    },

    async saveLogo() {
        if (!this.state.logo) return;
        try {
            await Model.saveLogo(this.state.logo);
            View.toast('Logo guardado correctamente', 'success');
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    async removeLogo() {
        try {
            await Model.removeLogo();
            this.state.logo = null;
            document.getElementById('logoPreviewContent').innerHTML = `
                <svg viewBox="0 0 160 50" style="height:60px;margin-bottom:12px;"><rect width="160" height="50" rx="8" fill="#0F2B46"/><text x="16" y="35" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="#FFFFFF">Lle</text><text x="68" y="35" font-family="Arial,sans-serif" font-size="26" font-weight="bold" fill="#2E86DE">Ser</text></svg>
                <p style="font-size:0.85rem;color:var(--muted);">Haz clic para cargar el logotipo</p>`;
            View.hide('btnSaveLogo');
            View.hide('btnRemoveLogo');
            View.toast('Logo eliminado', 'success');
        } catch (err) {
            View.toast('Error: ' + err.message, 'error');
        }
    },

    // --- GENERACIÓN DE PDF ---
    async generatePDF(reporte) {
        if (!reporte) { View.toast('No hay datos del reporte', 'error'); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'letter');
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 15;
        const contentW = pageW - margin * 2;
        let y = 15;

        // --- HEADER ---
        // Fecha izquierda
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm(Utils.formatDate(reporte.fecha)), margin, y);
        // Logo derecha
        if (this.state.logo) {
            try { doc.addImage(this.state.logo, 'JPEG', pageW - margin - 40, y - 7, 40, 14); } catch(e) {}
        }
        y += 18;

        // Título
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('REPORTE DE MANTENIMIENTO'), pageW / 2, y, { align: 'center' });
        y += 3;

        // Línea horizontal
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageW - margin, y);
        y += 8;

        // --- DATOS DEL EQUIPO ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('DATOS DEL EQUIPO'), margin, y);
        y += 6;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        const eqData = [
            ['Codigo:', reporte.equipoCodigo || ''],
            ['Nombre:', reporte.equipoNombre || ''],
            ['Marca:', ''], ['Modelo:', ''], ['Serie:', ''], ['Ubicacion:', '']
        ];
        // Intentar obtener datos completos del equipo
        let equipoFull = this.state.equipos.find(e => e.id === reporte.equipoId);
        if (equipoFull) {
            eqData[2][1] = equipoFull.marca || '';
            eqData[3][1] = equipoFull.modelo || '';
            eqData[4][1] = equipoFull.serie || '';
            eqData[5][1] = equipoFull.ubicacion || '';
        }
        const col1X = margin;
        const col2X = margin + contentW / 2;
        for (let i = 0; i < eqData.length; i++) {
            const x = i % 2 === 0 ? col1X : col2X;
            doc.setFont(undefined, 'bold');
            doc.text(Utils.norm(eqData[i][0]), x, y);
            doc.setFont(undefined, 'normal');
            doc.text(Utils.norm(eqData[i][1]), x + 25, y);
            if (i % 2 === 1 || i === eqData.length - 1) y += 5;
        }
        y += 3;

        // Hora inicio, fin, tiempo total
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('Hora de inicio:'), margin, y);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm(reporte.horaInicio || ''), margin + 32, y);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('Hora final:'), margin + 55, y);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm(reporte.horaFin || ''), margin + 80, y);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('Tiempo total:'), margin + 110, y);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm((reporte.tiempoTotal || 0) + ' min'), margin + 140, y);
        y += 8;

// --- TIPO DE ORDEN ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('TIPO DE ORDEN'), margin, y);
        y += 6;
        doc.setFontSize(9);
        const tipoOrdenActual = reporte.tipoOrden || 'Mantenimiento Correctivo';
        const tiposOrden = Utils.tiposOrden;
        const tipoColW = contentW / tiposOrden.length;
        tiposOrden.forEach((tipo, i) => {
            const tx = margin + i * tipoColW;
            const checked = tipo === tipoOrdenActual;
            doc.setDrawColor(0);
            doc.setLineWidth(0.3);
            doc.rect(tx, y - 3.5, 4, 4);
            if (checked) {
                doc.setFontSize(8);
                doc.text('X', tx + 0.8, y - 0.2);
            }
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.text(Utils.norm(tipo), tx + 6, y);
        });
        y += 8;

        // --- ESTADO DEL EQUIPO ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('ESTADO ACTUAL DEL EQUIPO'), margin, y);
        y += 6;
        doc.setFontSize(9);
        const estadosEq = Utils.estadosEquipo;
        const estadoColW = contentW / estadosEq.length;
        estadosEq.forEach((est, i) => {
            const tx = margin + i * estadoColW;
            const checked = est === reporte.estadoEquipo;
            doc.setDrawColor(0);
            doc.setLineWidth(0.3);
            doc.rect(tx, y - 3.5, 4, 4);
            if (checked) {
                doc.setFontSize(8);
                doc.text('X', tx + 0.8, y - 0.2);
            }
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.text(Utils.norm(est), tx + 6, y);
        });
        y += 8;

        // --- TAREAS EJECUTADAS ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('TAREAS EJECUTADAS'), margin, y);
        y += 6;
        doc.setFontSize(9);
        const tareasSeleccionadas = reporte.tareas || [];
        const todasTareas = Utils.tareas;
        // Distribuir en 2 columnas
        const halfTareas = Math.ceil(todasTareas.length / 2);
        for (let col = 0; col < 2; col++) {
            const tx = col === 0 ? margin : margin + contentW / 2;
            for (let i = 0; i < halfTareas; i++) {
                const idx = col * halfTareas + i;
                if (idx >= todasTareas.length) break;
                const ty = y + i * 5;
                const checked = tareasSeleccionadas.includes(todasTareas[idx]);
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.rect(tx, ty - 3.5, 4, 4);
                if (checked) {
                    doc.setFontSize(8);
                    doc.text('X', tx + 0.8, ty - 0.2);
                }
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.text(Utils.norm(todasTareas[idx]), tx + 6, ty);
            }
        }
        y += halfTareas * 5 + 4;

        // --- FALLA REPORTADA (solo correctivos) ---
        if (reporte.fallaReportada) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(Utils.norm('FALLA REPORTADA'), margin, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            const fallaLines = doc.splitTextToSize(Utils.norm(reporte.fallaReportada), contentW);
            doc.text(fallaLines, margin, y);
            y += fallaLines.length * 4.5 + 4;
        }

        // --- ACTIVIDADES REALIZADAS ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('ACTIVIDADES REALIZADAS'), margin, y);
        y += 6;
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        const actLines = doc.splitTextToSize(Utils.norm(reporte.actividadesRealizadas || ''), contentW);
        doc.text(actLines, margin, y);
        y += actLines.length * 4.5 + 4;

        // --- REPUESTOS UTILIZADOS (solo si hay info) ---
        if (reporte.repuestos) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(Utils.norm('REPUESTOS UTILIZADOS'), margin, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            const repLines = doc.splitTextToSize(Utils.norm(reporte.repuestos), contentW);
            doc.text(repLines, margin, y);
            y += repLines.length * 4.5 + 4;
        }

        // --- OBSERVACIONES (solo si hay info) ---
        if (reporte.observaciones) {
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(Utils.norm('OBSERVACIONES'), margin, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            const obsLines = doc.splitTextToSize(Utils.norm(reporte.observaciones), contentW);
            doc.text(obsLines, margin, y);
            y += obsLines.length * 4.5 + 4;
        }

        y += 4;

        // --- FIRMAS ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        const firmaY = y + 30;
        const leftX = margin;
        const rightX = margin + contentW / 2 + 10;

        // Lado izquierdo: Mantenimiento realizado por
        doc.text(Utils.norm('Mantenimiento realizado por:'), leftX, y);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm(reporte.realizadoPorNombre || ''), leftX, y + 5);
        doc.text(Utils.norm(reporte.realizadoPorCargo || ''), leftX, y + 9.5);
        // Línea de firma
        doc.setDrawColor(0);
        doc.setLineWidth(0.3);
        doc.line(leftX, firmaY, leftX + 60, firmaY);
        // Imagen de firma
        if (reporte.realizadoPorFirma) {
            try { doc.addImage(reporte.realizadoPorFirma, 'PNG', leftX + 5, firmaY - 22, 50, 20); } catch(e) {}
        }

        // Lado derecho: Mantenimiento recibido y aprobado por
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text(Utils.norm('Mantenimiento recibido y'), rightX, y);
        doc.text(Utils.norm('aprobado por:'), rightX, y + 5);
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text(Utils.norm(reporte.recibidoPorNombre || ''), rightX, y + 9.5);
        doc.text(Utils.norm(reporte.recibidoPorCargo || ''), rightX, y + 14);
        // Línea de firma
        doc.line(rightX, firmaY, rightX + 60, firmaY);
        // Imagen de firma
        if (reporte.recibidoPorFirma) {
            try { doc.addImage(reporte.recibidoPorFirma, 'PNG', rightX + 5, firmaY - 22, 50, 20); } catch(e) {}
        }

        y = firmaY + 8;

        // --- EVIDENCIA FOTOGRÁFICA (solo si hay) ---
        if (reporte.evidencias && reporte.evidencias.length > 0) {
            // Verificar si hay espacio suficiente, si no nueva página
            if (y > 220) { doc.addPage(); y = 15; }

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(Utils.norm('EVIDENCIA FOTOGRAFICA'), margin, y);
            y += 6;

            const maxImgW = 80;
            const maxImgH = 60;
            const gap = 8;
            const cols = 2;
            let colIdx = 0;
            let rowY = y;

            for (let i = 0; i < reporte.evidencias.length; i++) {
                const ex = margin + colIdx * (maxImgW + gap);
                // Si se sale de la página, nueva página
                if (rowY + maxImgH > 260) {
                    doc.addPage();
                    rowY = 15;
                }
                try {
                    doc.addImage(reporte.evidencias[i], 'JPEG', ex, rowY, maxImgW, maxImgH);
                } catch(e) {
                    doc.setDrawColor(200);
                    doc.rect(ex, rowY, maxImgW, maxImgH);
                    doc.setFontSize(8);
                    doc.text('Imagen', ex + 30, rowY + 30);
                }
                colIdx++;
                if (colIdx >= cols) {
                    colIdx = 0;
                    rowY += maxImgH + gap;
                }
            }
        }

        // Guardar PDF
        const fileName = `Reporte_${reporte.equipoCodigo || 'Eq'}_${reporte.fecha || Utils.today()}.pdf`;
        doc.save(fileName);
        View.toast('PDF generado correctamente', 'success');
    },

    // --- EVENTOS ---
    bindEvents() {
        // Seleccionar equipo en historial
        document.getElementById('selectEquipoHistorial').addEventListener('change', async (e) => {
            const equipoId = e.target.value;
            if (!equipoId) {
                document.getElementById('equipoHistorialList').innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Selecciona un equipo para ver su historial</p></div>';
                return;
            }
            const reportes = await Model.reporteGetByEquipo(equipoId);
            View.renderHistorial(reportes);
        });
        // Login
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('btnLogout').addEventListener('click', () => this.handleLogout());

        // Sidebar
        document.getElementById('hamburgerBtn').addEventListener('click', () => App.toggleSidebar());
        document.getElementById('sidebarOverlay').addEventListener('click', () => App.closeSidebar());
        document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                // Reset paginación al cambiar de vista
                this.resetPagination(view);
                View.setView(view);
                this.loadCurrentViewData();
            });
        });

        // Tabs
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                View.setTab(tabId);
                // Cargar datos específicos del tab si es necesario
                if (tabId === 'cfgTecnicos' || tabId === 'cfgUsuarios') this.loadConfiguracion();
            });
        });

        // --- EQUIPOS ---
        document.getElementById('btnAddEquipo').addEventListener('click', () => {
            document.getElementById('modalEquipoTitle').textContent = 'Agregar Equipo';
            document.getElementById('formEquipo').reset();
            document.getElementById('equipoId').value = '';
            App.openModal('modalEquipo');
        });
        document.getElementById('btnSaveEquipo').addEventListener('click', () => this.saveEquipo());
        document.getElementById('btnImportExcel').addEventListener('click', () => document.getElementById('excelFileInput').click());
        document.getElementById('excelFileInput').addEventListener('change', () => this.importExcel());

        // Búsqueda de historial
        const histInput = document.getElementById('searchEquipoHistorial');
        const histDropdown = document.getElementById('equipoSearchDropdown');

        // --- ÓRDENES ---
        document.getElementById('btnAddOrden')?.addEventListener('click', () => {
            document.getElementById('modalOrdenTitle').textContent = 'Nueva Orden de Trabajo';
            document.getElementById('formOrden').reset();
            document.getElementById('ordenId').value = '';
            View.fillEquiposSelect('ordenEquipo', this.state.equipos);
            App.openModal('modalOrden');
        });
        document.getElementById('btnSaveOrden').addEventListener('click', () => this.saveOrden());

        // --- REPORTES OT ---
        document.getElementById('btnSaveReporteOT').addEventListener('click', () => this.saveReporteOT());
  
      

        // Imágenes reporte OT
        document.getElementById('reporteOTFotos').addEventListener('change', () => this.handleImageUpload('reporteOTFotos', 'reporteOTFotos'));

        // --- CORRECTIVOS ---
        document.getElementById('btnAddCorrectivo').addEventListener('click', () => {
            document.getElementById('modalCorrectivoTitle').textContent = 'Reporte de Mantenimiento Correctivo';
            document.getElementById('formCorrectivo').reset();
            document.getElementById('correctivoId').value = '';
            View.fillEquiposSelect('correctivoEquipo', this.state.equipos);
            View.fillTecnicosSelect('correctivoRealiza', this.state.tecnicos);
            View.fillTecnicosSelect('correctivoRecibido', this.state.tecnicos);
            document.getElementById('correctivoFecha').value = Utils.today();
            this.state.correctivoFotos = [];
            View.renderImagePreviews('correctivoFotosPreview', []);
            App.openModal('modalCorrectivo');
        });
        document.getElementById('btnSaveCorrectivo').addEventListener('click', () => this.saveCorrectivo());


        // Imágenes correctivo
        document.getElementById('correctivoFotos').addEventListener('change', () => this.handleImageUpload('correctivoFotos', 'correctivoFotos'));

        // Ver reporte PDF
        document.getElementById('btnPDFVerReporte').addEventListener('click', () => {
            if (this.state.currentReporteData) this.generatePDF(this.state.currentReporteData);
        });

                // --- TÉCNICOS ---
        document.getElementById('btnAddTecnico').addEventListener('click', () => {
            document.getElementById('modalTecnicoTitle').textContent = 'Agregar Técnico';
            document.getElementById('formTecnico').reset();
            document.getElementById('tecnicoId').value = '';
            document.getElementById('tecnicoFirma').value = '';
            document.getElementById('firmaPreview').innerHTML = '';
            App.openModal('modalTecnico');
        });

        document.getElementById('btnSaveTecnico').addEventListener('click', () => {
            Controller.saveTecnico();
        });

        // Carga de imagen de firma
        document.getElementById('firmaFileInput').addEventListener('change', async (e) => {
            if (e.target.files.length) {
                const base64 = await Utils.compressImage(e.target.files[0], 300, 0.8);
                document.getElementById('tecnicoFirma').value = base64;
                document.getElementById('firmaPreview').innerHTML = `<div class="image-preview"><img src="${base64}" alt="Firma"><button type="button" class="remove-img" onclick="document.getElementById('tecnicoFirma').value='';this.parentElement.remove()"><i class="fas fa-times"></i></button></div>`;
            }
        });
        // --- USUARIOS ---
        document.getElementById('btnAddUsuario').addEventListener('click', () => {
            document.getElementById('modalUsuarioTitle').textContent = 'Crear Usuario';
            document.getElementById('formUsuario').reset();
            document.getElementById('usuarioId').value = '';
            document.getElementById('usuarioEmail').disabled = false;
            document.getElementById('usuarioPasswordGroup').style.display = '';
            App.openModal('modalUsuario');
        });
        document.getElementById('btnSaveUsuario').addEventListener('click', async () => {
            await this.saveUsuario();
            // Re-autenticar al admin si perdió sesión
            try {
                if (!auth.currentUser) {
                    // Esto no debería pasar pero como fallback
                }
            } catch(e) {}
        });

        // --- LOGO ---
        document.getElementById('logoFileInput').addEventListener('change', (e) => {
            if (e.target.files.length) this.handleLogoUpload(e.target.files[0]);
        });
        document.getElementById('btnSaveLogo').addEventListener('click', () => this.saveLogo());
        document.getElementById('btnRemoveLogo').addEventListener('click', () => this.removeLogo());

        // Cerrar modales al hacer clic fuera
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('show');
                    document.body.style.overflow = '';
                }
            });
        });

        // Tecla Escape para cerrar modales
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.show').forEach(m => {
                    m.classList.remove('show');
                });
                document.body.style.overflow = '';
            }
        });
    },

    resetPagination(view) {
        switch(view) {
            case 'equipos': this.state.equiposPage = 1; break;
            case 'ordenes':
                this.state.ordenesPage = 1;
                this.state.ordenesLastDoc = null;
                this.state.ordenes = [];
                break;
            case 'reportesOT':
                this.state.reportesOTPage = 1;
                this.state.reportesOTLastDoc = null;
                this.state.ordenes = [];
                break;
            case 'reportesCorrectivo':
                this.state.correctivosPage = 1;
                this.state.correctivosLastDoc = null;
                break;
        }
    }
};


// ============================================
// APP - Inicialización y utilidades generales
// ============================================
const App = {
    openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebarOverlay').classList.toggle('show');
    },

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('show');
    }
};

// ============================================
// PUNTO DE ENTRADA
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    Controller.init();
});
