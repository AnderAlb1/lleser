/**
 * ============================================
 * LleSer Ltda. - Sistema de Gestión de Mantenimientos
 * Arquitectura MVC - Script Principal
 * ============================================
 */

// ============================================
// INICIALIZACIÓN FIREBASE
// ============================================
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();

// Habilitar persistencia offline para mejor rendimiento
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================
const AppState = {
    currentUser: null,
    userRole: null,
    currentModule: 'equipos-gestion',
    // Paginación
    equipos: { lastDoc: null, data: [], loading: false, hasMore: true, count: 0 },
    ordenes: { lastDoc: null, data: [], loading: false, hasMore: true, count: 0 },
    // Fotos temporales para formularios
    tempPhotos: { ro: [], rc: [] },
    // Reporte guardado recientemente (para generar PDF)
    lastSavedReport: null,
    lastSavedCorrectivo: null,
    // Firma temporal
    firmaData: { ro: null, rc: null }
};

// ============================================
// MODELO (Capa de datos - Firebase)
// ============================================
const Model = {

    // --- Contadores (transacciones atómicas) ---
    async getNextCounter(type) {
        const ref = db.collection('counters').doc(type);
        return db.runTransaction(async tx => {
            const doc = await tx.get(ref);
            let val = doc.exists ? doc.data().value : 0;
            val++;
            tx.set(ref, { value: val });
            return val;
        });
    },

    // --- EQUIPOS ---
    async crearEquipo(data) {
        return db.collection('equipos').add({
            ...data,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async actualizarEquipo(id, data) {
        return db.collection('equipos').doc(id).update(data);
    },

    async eliminarEquipo(id) {
        return db.collection('equipos').doc(id).delete();
    },

    getEquiposQuery(limit = APP_CONFIG.itemsPorPagina, startAfter = null) {
        let q = db.collection('equipos').orderBy('codigo').limit(limit);
        if (startAfter) q = q.startAfter(startAfter);
        return q.get();
    },

    async contarEquipos() {
        // Firestore no tiene count eficiente, usamos una aproximación con el primer batch
        const snap = await db.collection('equipos').limit(1000).get();
        return snap.size;
    },

    async getEquiposAll() {
        // Para selects, cargamos todos (esperado < 500)
        const snap = await db.collection('equipos').orderBy('codigo').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    // --- ÓRDENES DE TRABAJO ---
    async crearOrden(data) {
        const consecutivo = await this.getNextCounter('ordenes');
        return db.collection('ordenes').add({
            ...data,
            consecutivo,
            estado: 'Pendiente',
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async actualizarOrden(id, data) {
        return db.collection('ordenes').doc(id).update(data);
    },

    async eliminarOrden(id) {
        return db.collection('ordenes').doc(id).delete();
    },

    getOrdenesQuery(limit = APP_CONFIG.itemsPorPagina, startAfter = null) {
        let q = db.collection('ordenes').orderBy('consecutivo', 'desc').limit(limit);
        if (startAfter) q = q.startAfter(startAfter);
        return q.get();
    },

    async contarOrdenes() {
        const snap = await db.collection('ordenes').limit(1000).get();
        return snap.size;
    },

    // --- REPORTES DE ÓRDENES ---
    async crearReporteOrden(data) {
        return db.collection('reportesOrdenes').add({
            ...data,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async getReportesByEquipo(equipoId) {
        const snap = await db.collection('reportesOrdenes')
            .where('equipoId', '==', equipoId)
            .orderBy('fechaCreacion', 'desc')
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data(), _tipo: 'orden' }));
    },

    async getReportesOrdenesAll() {
        const snap = await db.collection('reportesOrdenes')
            .orderBy('fechaCreacion', 'desc')
            .limit(200)
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    // --- REPORTES CORRECTIVOS ---
    async crearReporteCorrectivo(data) {
        const consecutivo = await this.getNextCounter('reportesCorrectivos');
        return db.collection('reportesCorrectivos').add({
            ...data,
            consecutivo,
            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async getCorrectivosByEquipo(equipoId) {
        const snap = await db.collection('reportesCorrectivos')
            .where('equipoId', '==', equipoId)
            .orderBy('fechaCreacion', 'desc')
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data(), _tipo: 'correctivo' }));
    },

    async getCorrectivosAll() {
        const snap = await db.collection('reportesCorrectivos')
            .orderBy('fechaCreacion', 'desc')
            .limit(200)
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getCorrectivoById(id) {
        const doc = await db.collection('reportesCorrectivos').doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    // --- TÉCNICOS ---
    async crearTecnico(data) {
        return db.collection('tecnicos').add(data);
    },

    async actualizarTecnico(id, data) {
        return db.collection('tecnicos').doc(id).update(data);
    },

    async eliminarTecnico(id) {
        return db.collection('tecnicos').doc(id).delete();
    },

    async getTecnicosAll() {
        const snap = await db.collection('tecnicos').orderBy('nombre').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    // --- CONFIGURACIÓN ---
    async getLogo() {
        const doc = await db.collection('config').doc('logo').get();
        return doc.exists ? doc.data().imagen : null;
    },

    async setLogo(base64) {
        return db.collection('config').doc('logo').set({ imagen: base64 });
    },

    async removeLogo() {
        return db.collection('config').doc('logo').delete();
    },

    // --- USUARIOS ---
    async crearUsuarioEnDB(uid, data) {
        return db.collection('usuarios').doc(uid).set(data);
    },

    async getUsuario(uid) {
        const doc = await db.collection('usuarios').doc(uid).get();
        return doc.exists ? doc.data() : null;
    },

    async getUsuariosAll() {
        const snap = await db.collection('usuarios').orderBy('nombre').get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async actualizarUsuarioRol(uid, rol) {
        return db.collection('usuarios').doc(uid).update({ rol });
    },

    async tieneUsuariosRegistrados() {
        const snap = await db.collection('usuarios').limit(1).get();
        return !snap.empty;
    },

    // --- BÚSQUEDA ---
    async buscarGlobal(termino) {
        const t = termino.toLowerCase().trim();
        if (!t) return { equipos: [], ordenes: [] };

        const results = { equipos: [], ordenes: [] };

        // Buscar en equipos (código, nombre, serie, ubicación)
        const eqSnap = await db.collection('equipos').limit(50).get();
        eqSnap.docs.forEach(d => {
            const e = d.data();
            if (
                (e.codigo && e.codigo.toLowerCase().includes(t)) ||
                (e.nombre && e.nombre.toLowerCase().includes(t)) ||
                (e.serie && e.serie.toLowerCase().includes(t)) ||
                (e.ubicacion && e.ubicacion.toLowerCase().includes(t))
            ) {
                results.equipos.push({ id: d.id, ...e });
            }
        });

        // Buscar en órdenes (consecutivo, equipoNombre)
        const orSnap = await db.collection('ordenes').limit(50).get();
        orSnap.docs.forEach(d => {
            const o = d.data();
            if (
                String(o.consecutivo).includes(t) ||
                (o.equipoNombre && o.equipoNombre.toLowerCase().includes(t))
            ) {
                results.ordenes.push({ id: d.id, ...o });
            }
        });

        return results;
    },

    // --- HISTORIAL COMPLETO DE UN EQUIPO ---
    async getHistorialEquipo(equipoId) {
        const [reportesOrdenes, reportesCorrectivos] = await Promise.all([
            this.getReportesByEquipo(equipoId),
            this.getCorrectivosByEquipo(equipoId)
        ]);

        // Combinar y ordenar por fecha
        const todos = [...reportesOrdenes, ...reportesCorrectivos];
        todos.sort((a, b) => {
            const fa = a.fecha || '';
            const fb = b.fecha || '';
            return fb.localeCompare(fa);
        });

        return todos;
    }
};

// ============================================
// VISTA (Capa de presentación - DOM)
// ============================================
const View = {

    // --- Toasts ---
    toast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const icons = { success: 'fa-check-circle', danger: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || 'fa-info-circle'} toast-icon"></i>
            <span class="toast-message">${message}</span>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // --- Modal ---
    openModal(title, bodyHtml, footerHtml = '', size = '') {
        const overlay = document.getElementById('modal-overlay');
        const container = document.getElementById('modal-container');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        const footer = document.getElementById('modal-footer');
        if (footerHtml) {
            footer.innerHTML = footerHtml;
            footer.classList.remove('hidden');
        } else {
            footer.innerHTML = '';
            footer.classList.add('hidden');
        }
        container.className = 'modal-container' + (size ? ` modal-${size}` : '');
        overlay.classList.add('visible');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('visible');
    },

    // --- Navegación ---
    setActiveModule(moduleId) {
        // Ocultar todos los módulos
        document.querySelectorAll('.module-section').forEach(s => s.classList.remove('active'));
        // Mostrar el seleccionado
        const mod = document.getElementById('mod-' + moduleId);
        if (mod) mod.classList.add('active');

        // Actualizar sidebar
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[data-module="${moduleId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
            // Expandir submenu padre si aplica
            const parentSubmenu = activeLink.closest('.submenu');
            if (parentSubmenu) {
                parentSubmenu.classList.add('open');
                const parentToggle = parentSubmenu.previousElementSibling;
                if (parentToggle) parentToggle.classList.add('expanded');
            }
        }

        // Guardar en localStorage para persistencia
        localStorage.setItem('lleSer_module', moduleId);
        AppState.currentModule = moduleId;

        // Cerrar sidebar en móvil
        Controller.closeSidebar();
    },

    // --- Ocultar/mostrar elementos admin ---
    updateUIForRole(role) {
        const adminElements = document.querySelectorAll('.admin-only-nav, .admin-only-section');
        adminElements.forEach(el => {
            el.style.display = role === 'admin' ? '' : 'none';
        });
    },

    // --- Renderizar equipos ---
    renderEquiposTable(equipos) {
        const tbody = document.getElementById('equipos-tbody');
        if (equipos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">
                <div class="empty-state">
                    <i class="fas fa-cogs"></i>
                    <h4>Sin equipos registrados</h4>
                    <p>Agrega tu primer equipo o impórtalos desde un archivo Excel.</p>
                </div>
            </td></tr>`;
            return;
        }

        const estadoBadge = (estado) => {
            const map = {
                'Operativo': 'badge-success',
                'En mantenimiento': 'badge-warning',
                'Fuera de servicio': 'badge-danger'
            };
            return `<span class="badge ${map[estado] || 'badge-info'}">${estado}</span>`;
        };

        tbody.innerHTML = equipos.map(eq => `
            <tr>
                <td class="fw-600">${eq.codigo || '-'}</td>
                <td>${eq.nombre || '-'}</td>
                <td>${eq.marca || '-'}</td>
                <td>${eq.modelo || '-'}</td>
                <td>${eq.serie || '-'}</td>
                <td>${eq.ubicacion || '-'}</td>
                <td>${estadoBadge(eq.estado)}</td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-outline btn-sm btn-icon" onclick="Controller.editarEquipo('${eq.id}')" title="Editar">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-outline btn-sm btn-icon" style="color:var(--danger);" onclick="Controller.eliminarEquipo('${eq.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderEquiposStats(data) {
        const container = document.getElementById('equipos-stats');
        const operativos = data.filter(e => e.estado === 'Operativo').length;
        const mantenimiento = data.filter(e => e.estado === 'En mantenimiento').length;
        const fuera = data.filter(e => e.estado === 'Fuera de servicio').length;
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-cogs"></i></div>
                <div><div class="stat-value">${data.length}</div><div class="stat-label">Total equipos</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
                <div><div class="stat-value">${operativos}</div><div class="stat-label">Operativos</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon orange"><i class="fas fa-wrench"></i></div>
                <div><div class="stat-value">${mantenimiento}</div><div class="stat-label">En mantenimiento</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-times-circle"></i></div>
                <div><div class="stat-value">${fuera}</div><div class="stat-label">Fuera de servicio</div></div>
            </div>
        `;
    },

    renderEquiposPagination(hasMore, loaded) {
        const container = document.getElementById('equipos-pagination');
        if (!hasMore) {
            container.innerHTML = loaded > 0 ? `<p class="text-muted text-center" style="font-size:0.85rem;">Mostrando ${loaded} equipo(s)</p>` : '';
            return;
        }
        container.innerHTML = `
            <span class="pagination-info">${loaded} cargados</span>
            <button class="btn btn-outline" id="btn-more-equipos"><i class="fas fa-chevron-down"></i> Cargar más</button>
        `;
        document.getElementById('btn-more-equipos')?.addEventListener('click', () => Controller.loadMoreEquipos());
    },

    // --- Renderizar órdenes ---
    renderOrdenesTable(ordenes) {
        const tbody = document.getElementById('ordenes-tbody');
        if (ordenes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7">
                <div class="empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h4>Sin órdenes de trabajo</h4>
                    <p>Crea una nueva orden para comenzar a programar mantenimientos.</p>
                </div>
            </td></tr>`;
            return;
        }

        const tipoBadge = (tipo) => {
            const map = { 'Preventivo': 'badge-info', 'Correctivo': 'badge-danger', 'Diagnóstico': 'badge-accent', 'Instalación': 'badge-warning' };
            return `<span class="badge ${map[tipo] || 'badge-info'}">${tipo}</span>`;
        };
        const estadoBadge = (estado) => {
            const map = { 'Pendiente': 'badge-warning', 'En proceso': 'badge-info', 'Completada': 'badge-success' };
            return `<span class="badge ${map[estado] || 'badge-info'}">${estado}</span>`;
        };

        tbody.innerHTML = ordenes.map(o => {
            const fecha = o.fechaCreacion ? (o.fechaCreacion.toDate ? o.fechaCreacion.toDate().toLocaleDateString('es-CO') : o.fechaCreacion) : '-';
            return `
            <tr>
                <td class="fw-600">#${String(o.consecutivo || 0).padStart(4, '0')}</td>
                <td>${o.equipoNombre || '-'}</td>
                <td>${tipoBadge(o.tipo)}</td>
                <td class="text-truncate" style="max-width:200px;" title="${o.actividades || ''}">${o.actividades || '-'}</td>
                <td>${estadoBadge(o.estado)}</td>
                <td>${fecha}</td>
                <td>
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-outline btn-sm btn-icon" onclick="Controller.editarOrden('${o.id}')" title="Editar">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn btn-outline btn-sm btn-icon" style="color:var(--danger);" onclick="Controller.eliminarOrden('${o.id}')" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    },

    renderOrdenesStats(data) {
        const container = document.getElementById('ordenes-stats');
        const pendientes = data.filter(o => o.estado === 'Pendiente').length;
        const enProceso = data.filter(o => o.estado === 'En proceso').length;
        const completadas = data.filter(o => o.estado === 'Completada').length;
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-clipboard-list"></i></div>
                <div><div class="stat-value">${data.length}</div><div class="stat-label">Total órdenes</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
                <div><div class="stat-value">${pendientes}</div><div class="stat-label">Pendientes</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon teal"><i class="fas fa-spinner"></i></div>
                <div><div class="stat-value">${enProceso}</div><div class="stat-label">En proceso</div></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-check-double"></i></div>
                <div><div class="stat-value">${completadas}</div><div class="stat-label">Completadas</div></div>
            </div>
        `;
    },

    renderOrdenesPagination(hasMore, loaded) {
        const container = document.getElementById('ordenes-pagination');
        if (!hasMore) {
            container.innerHTML = loaded > 0 ? `<p class="text-muted text-center" style="font-size:0.85rem;">Mostrando ${loaded} orden(es)</p>` : '';
            return;
        }
        container.innerHTML = `
            <span class="pagination-info">${loaded} cargados</span>
            <button class="btn btn-outline" id="btn-more-ordenes"><i class="fas fa-chevron-down"></i> Cargar más</button>
        `;
        document.getElementById('btn-more-ordenes')?.addEventListener('click', () => Controller.loadMoreOrdenes());
    },

    // --- Reportes de órdenes (lista) ---
    renderReportesOrdenesList(ordenes) {
        const container = document.getElementById('reportes-ordenes-list');
        if (ordenes.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-file-alt"></i>
                <h4>Sin órdenes pendientes</h4>
                <p>No hay órdenes de trabajo disponibles para generar reportes.</p>
            </div>`;
            return;
        }

        const tipoBadge = (tipo) => {
            const map = { 'Preventivo': 'badge-info', 'Correctivo': 'badge-danger', 'Diagnóstico': 'badge-accent', 'Instalación': 'badge-warning' };
            return `<span class="badge ${map[tipo] || 'badge-info'}">${tipo}</span>`;
        };

        container.innerHTML = ordenes.map(o => `
            <div class="order-report-item" onclick="Controller.abrirReporteOrden('${o.id}')">
                <div class="order-number">#${String(o.consecutivo || 0).padStart(4, '0')}</div>
                <div class="order-info">
                    <div class="order-equipment">${o.equipoNombre || 'Sin equipo'}</div>
                    <div class="order-type-badge">${tipoBadge(o.tipo)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.82rem;color:var(--text-muted);">${o.fechaCreacion ? (o.fechaCreacion.toDate ? o.fechaCreacion.toDate().toLocaleDateString('es-CO') : '') : ''}</div>
                    <i class="fas fa-chevron-right" style="color:var(--text-muted);margin-top:4px;"></i>
                </div>
            </div>
        `).join('');
    },

    // --- Reportes correctivos (lista) ---
    renderCorrectivosList(correctivos) {
        const container = document.getElementById('correctivos-list');
        if (correctivos.length === 0) {
            container.innerHTML = '';
            return;
        }

        const html = `<div class="card mb-24">
            <div class="card-header"><h3>Reportes correctivos anteriores</h3></div>
            <div style="padding:8px;">
                ${correctivos.map(c => `
                    <div class="order-report-item" onclick="Controller.verCorrectivo('${c.id}')">
                        <div class="order-number">RC-${String(c.consecutivo || 0).padStart(4, '0')}</div>
                        <div class="order-info">
                            <div class="order-equipment">${c.equipoNombre || 'Sin equipo'}</div>
                            <div class="order-date">${c.fecha || '-'}</div>
                        </div>
                        <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();Controller.generarPDFCorrectivo('${c.id}')">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>`;

        container.innerHTML = html;
    },

    // --- Historial de equipo ---
    renderHistorial(historial, equipoNombre) {
        const container = document.getElementById('historial-list');
        if (!equipoNombre) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-history"></i>
                <h4>Selecciona un equipo</h4>
                <p>Elige un equipo del menú desplegable para ver su historial de mantenimientos.</p>
            </div>`;
            return;
        }

        if (historial.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h4>Sin historial</h4>
                <p>No se encontraron reportes de mantenimiento para este equipo.</p>
            </div>`;
            return;
        }

        container.innerHTML = historial.map(h => {
            const isOrden = h._tipo === 'orden';
            const icon = isOrden ? 'fa-file-alt' : 'fa-wrench';
            const iconBg = isOrden ? 'background:var(--info-bg);color:var(--primary);' : 'background:var(--danger-bg);color:var(--danger);';
            const titulo = isOrden
                ? `Orden #${String(h.consecutivoOrden || 0).padStart(4, '0')} - ${h.tipo || ''}`
                : `Correctivo RC-${String(h.consecutivo || 0).padStart(4, '0')}`;
            const detalle = `${h.fecha || '-'} | Técnico: ${h.tecnicoNombre || '-'}`;

            return `
            <div class="history-item">
                <div class="history-icon" style="${iconBg}"><i class="fas ${icon}"></i></div>
                <div class="history-info">
                    <div class="history-title">${titulo}</div>
                    <div class="history-detail">${detalle}</div>
                    <div class="history-detail" style="margin-top:4px;">${(h.actividadesRealizadas || '').substring(0, 100)}${(h.actividadesRealizadas || '').length > 100 ? '...' : ''}</div>
                </div>
                <div class="history-actions">
                    <button class="btn btn-accent btn-sm" onclick="Controller.generarPDFHistorial('${h._tipo}','${h.id}')">
                        <i class="fas fa-file-pdf"></i> PDF
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    // --- Técnicos ---
    renderTecnicosList(tecnicos) {
        const container = document.getElementById('tecnicos-list');
        if (tecnicos.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <i class="fas fa-user-hard-hat"></i>
                <h4>Sin técnicos registrados</h4>
                <p>Agrega técnicos para asignarlos a los reportes de mantenimiento.</p>
            </div>`;
            return;
        }

        container.innerHTML = `<div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>Nombre</th><th>Cargo</th><th>Firma</th><th>Acciones</th></tr></thead>
                <tbody>
                    ${tecnicos.map(t => `
                        <tr>
                            <td class="fw-600">${t.nombre || '-'}</td>
                            <td>${t.cargo || '-'}</td>
                            <td>${t.firma ? '<img src="' + t.firma + '" style="height:30px;" alt="Firma">' : '<span class="text-muted">Sin firma</span>'}</td>
                            <td>
                                <div style="display:flex;gap:4px;">
                                    <button class="btn btn-outline btn-sm btn-icon" onclick="Controller.editarTecnico('${t.id}')" title="Editar"><i class="fas fa-pen"></i></button>
                                    <button class="btn btn-outline btn-sm btn-icon" style="color:var(--danger);" onclick="Controller.eliminarTecnico('${t.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    },

    // --- Usuarios ---
    renderUsuariosTable(usuarios) {
        const tbody = document.getElementById('usuarios-tbody');
        if (usuarios.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><i class="fas fa-users"></i><h4>Sin usuarios</h4></div></td></tr>`;
            return;
        }
        tbody.innerHTML = usuarios.map(u => `
            <tr>
                <td class="fw-600">${u.nombre || '-'}</td>
                <td>${u.email || '-'}</td>
                <td><span class="badge ${u.rol === 'admin' ? 'badge-accent' : 'badge-info'}">${u.rol === 'admin' ? 'Administrador' : 'Técnico'}</span></td>
                <td>
                    ${u.id !== AppState.currentUser.uid ? `
                        <button class="btn btn-outline btn-sm" onclick="Controller.cambiarRolUsuario('${u.id}','${u.rol}')">
                            <i class="fas fa-exchange-alt"></i> Cambiar rol
                        </button>
                    ` : '<span class="text-muted" style="font-size:0.82rem;">Tu cuenta</span>'}
                </td>
            </tr>
        `).join('');
    },

    // --- Búsqueda ---
    renderSearchResults(results) {
        const container = document.getElementById('search-results');
        const { equipos, ordenes } = results;

        if (equipos.length === 0 && ordenes.length === 0) {
            container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.88rem;">Sin resultados</div>`;
            container.classList.add('visible');
            return;
        }

        let html = '';

        if (equipos.length > 0) {
            html += `<div class="search-result-group-title">Equipos (${equipos.length})</div>`;
            html += equipos.map(e => `
                <div class="search-result-item" onclick="Controller.irAEquipo('${e.id}')">
                    <i class="fas fa-cog"></i>
                    <div class="search-result-info">
                        <div class="search-result-name">${e.nombre || e.codigo}</div>
                        <div class="search-result-detail">${e.codigo} | ${e.serie || '-'} | ${e.ubicacion || '-'}</div>
                    </div>
                </div>
            `).join('');
        }

        if (ordenes.length > 0) {
            html += `<div class="search-result-group-title">Órdenes (${ordenes.length})</div>`;
            html += ordenes.map(o => `
                <div class="search-result-item" onclick="Controller.irAOrden('${o.id}')">
                    <i class="fas fa-clipboard"></i>
                    <div class="search-result-info">
                        <div class="search-result-name">#${String(o.consecutivo || 0).padStart(4, '0')} - ${o.equipoNombre || ''}</div>
                        <div class="search-result-detail">${o.tipo} | ${o.estado || ''}</div>
                    </div>
                </div>
            `).join('');
        }

        container.innerHTML = html;
        container.classList.add('visible');
    },

    hideSearchResults() {
        document.getElementById('search-results').classList.remove('visible');
    },

    // --- Fotos ---
    renderPhotoGrid(photos, prefix) {
        const grid = document.getElementById(`${prefix}-photo-grid`);
        grid.innerHTML = photos.map((p, i) => `
            <div class="photo-item">
                <img src="${p}" alt="Evidencia ${i + 1}">
                <button class="photo-remove" onclick="Controller.removePhoto('${prefix}', ${i})"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    },

    // --- Logo ---
    renderLogoPreview(base64) {
        const preview = document.getElementById('logo-preview');
        const removeBtn = document.getElementById('btn-remove-logo');
        if (base64) {
            preview.innerHTML = `<img src="${base64}" alt="Logo empresa">`;
            removeBtn.classList.remove('hidden');
        } else {
            preview.innerHTML = `<span class="text-muted" style="font-size:0.85rem;">Sin logo cargado</span>`;
            removeBtn.classList.add('hidden');
        }
    },

    // --- Loading ---
    showLoading(containerId) {
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;
    }
};

// ============================================
// CONTROLADOR (Lógica de negocio)
// ============================================
const Controller = {

    // --- Inicialización ---
    async init() {
        // Listener de autenticación
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                AppState.currentUser = user;
                const userData = await Model.getUsuario(user.uid);
                AppState.userRole = userData ? userData.rol : 'tecnico';

                // Actualizar UI
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('app-screen').style.display = 'block';
                document.getElementById('user-display-name').textContent = userData?.nombre || user.email;
                document.getElementById('user-display-role').textContent = AppState.userRole === 'admin' ? 'Administrador' : 'Técnico';
                document.getElementById('user-avatar').textContent = (userData?.nombre || user.email).charAt(0).toUpperCase();
                View.updateUIForRole(AppState.userRole);

                // Restaurar módulo activo
                const savedModule = localStorage.getItem('lleSer_module');
                const defaultModule = AppState.userRole === 'tecnico' ? 'reportes-ordenes' : (savedModule || 'equipos-gestion');
                View.setActiveModule(defaultModule);

                // Cargar datos del módulo
                this.loadModuleData(defaultModule);

                // Cargar datos comunes
                this.loadTecnicosSelect();
                this.loadEquiposSelect();
                this.loadLogo();

                // Fecha en header
                document.getElementById('header-date').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            } else {
                AppState.currentUser = null;
                document.getElementById('app-screen').style.display = 'none';
                document.getElementById('login-screen').style.display = 'flex';

                // Verificar si hay usuarios registrados
                const hasUsers = await Model.tieneUsuariosRegistrados();
                document.getElementById('register-link').classList.toggle('hidden', hasUsers);
            }
        });

        // Configurar event listeners
        this.setupEventListeners();
    },

    setupEventListeners() {
        // Login / Registro
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('show-register').addEventListener('click', (e) => { e.preventDefault(); this.toggleAuthForm('register'); });
        document.getElementById('show-login').addEventListener('click', (e) => { e.preventDefault(); this.toggleAuthForm('login'); });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => auth.signOut());

        // Sidebar
        document.getElementById('btn-hamburger').addEventListener('click', () => this.toggleSidebar());
        document.getElementById('sidebar-overlay').addEventListener('click', () => this.closeSidebar());

        // Navegación sidebar
        document.querySelectorAll('.nav-link[data-module]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const mod = link.dataset.module;
                View.setActiveModule(mod);
                this.loadModuleData(mod);
            });
        });

        // Submenus toggle
        document.querySelectorAll('.nav-link[data-toggle="submenu"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.dataset.target;
                const submenu = document.getElementById(targetId);
                submenu.classList.toggle('open');
                link.classList.toggle('expanded');
            });
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => View.closeModal());
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) View.closeModal();
        });

        // Búsqueda global con debounce
        let searchTimeout;
        document.getElementById('global-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const term = e.target.value;
            if (term.length < 2) { View.hideSearchResults(); return; }
            searchTimeout = setTimeout(() => this.handleSearch(term), 350);
        });

        document.getElementById('global-search').addEventListener('blur', () => {
            setTimeout(() => View.hideSearchResults(), 200);
        });

        // Botones de módulos
        document.getElementById('btn-add-equipo').addEventListener('click', () => this.abrirFormEquipo());
        document.getElementById('btn-import-excel').addEventListener('click', () => this.abrirImportExcel());
        document.getElementById('btn-add-orden').addEventListener('click', () => this.abrirFormOrden());
        document.getElementById('btn-add-tecnico').addEventListener('click', () => this.abrirFormTecnico());
        document.getElementById('btn-upload-logo').addEventListener('click', () => document.getElementById('logo-input').click());
        document.getElementById('btn-remove-logo').addEventListener('click', () => this.removeLogo());
        document.getElementById('logo-input').addEventListener('change', (e) => this.handleLogoUpload(e));

        // Historial
        document.getElementById('historial-equipo-select').addEventListener('change', (e) => this.cargarHistorial(e.target.value));

        // Reporte de orden - formulario
        document.getElementById('reporte-orden-form').addEventListener('submit', (e) => this.guardarReporteOrden(e));
        document.getElementById('ro-volver-lista').addEventListener('click', () => this.volverListaReportesOrdenes());
        document.getElementById('ro-generar-pdf').addEventListener('click', () => this.generarPDFReporteOrden());

        // Reporte correctivo - formulario
        document.getElementById('correctivo-form').addEventListener('submit', (e) => this.guardarReporteCorrectivo(e));
        document.getElementById('rc-generar-pdf').addEventListener('click', () => {
            if (AppState.lastSavedCorrectivo) this.generarPDFCorrectivo(AppState.lastSavedCorrectivo);
        });

        // Fotos - reporte orden
        this.setupPhotoUpload('ro');
        // Fotos - reporte correctivo
        this.setupPhotoUpload('rc');

        // Firmas
        this.setupSignatureCanvas('ro-firma-canvas', 'ro');
        this.setupSignatureCanvas('rc-firma-canvas', 'rc');

        document.getElementById('ro-limpiar-firma').addEventListener('click', () => this.limpiarFirma('ro'));
        document.getElementById('rc-limpiar-firma').addEventListener('click', () => this.limpiarFirma('rc'));

        // Tecla Escape para cerrar modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') View.closeModal();
        });
    },

    // --- Autenticación ---
    toggleAuthForm(type) {
        document.getElementById('login-form-container').classList.toggle('hidden', type === 'register');
        document.getElementById('register-form-container').classList.toggle('hidden', type === 'login');
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorEl = document.getElementById('login-error');
        errorEl.classList.add('hidden');

        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            errorEl.textContent = this.getAuthErrorMessage(err.code);
            errorEl.classList.remove('hidden');
        }
    },

    async handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const password = document.getElementById('reg-password').value;
        const errorEl = document.getElementById('register-error');
        errorEl.classList.add('hidden');

        try {
            const cred = await auth.createUserWithEmailAndPassword(email, password);
            // Determinar rol: primer usuario = admin
            const hasUsers = await Model.tieneUsuariosRegistrados();
            const rol = hasUsers ? 'tecnico' : 'admin';
            await Model.crearUsuarioEnDB(cred.user.uid, { nombre: name, email, rol });
        } catch (err) {
            errorEl.textContent = this.getAuthErrorMessage(err.code);
            errorEl.classList.remove('hidden');
        }
    },

    getAuthErrorMessage(code) {
        const messages = {
            'auth/email-already-in-use': 'Este correo ya está registrado.',
            'auth/invalid-email': 'Correo electrónico inválido.',
            'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
            'auth/user-not-found': 'No existe una cuenta con este correo.',
            'auth/wrong-password': 'Contraseña incorrecta.',
            'auth/invalid-credential': 'Credenciales inválidas.',
            'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde.'
        };
        return messages[code] || 'Error de autenticación. Inténtalo de nuevo.';
    },

    // --- Sidebar ---
    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('visible');
    },

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('visible');
    },

    // --- Carga de datos por módulo (lazy loading) ---
    async loadModuleData(moduleId) {
        switch (moduleId) {
            case 'equipos-gestion': await this.loadEquipos(); break;
            case 'equipos-historial': await this.loadEquiposHistorialSelect(); break;
            case 'ordenes': await this.loadOrdenes(); break;
            case 'reportes-ordenes': await this.loadReportesOrdenes(); break;
            case 'reportes-correctivos': await this.loadCorrectivos(); break;
            case 'config-tecnicos': await this.loadTecnicos(); break;
            case 'config-usuarios': await this.loadUsuarios(); break;
            case 'config-logo': await this.loadLogo(); break;
        }
    },

    // --- EQUIPOS ---
    async loadEquipos() {
        View.showLoading('equipos-tbody');
        AppState.equipos = { lastDoc: null, data: [], loading: false, hasMore: true, count: 0 };

        try {
            const snap = await Model.getEquiposQuery();
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            AppState.equipos.data = data;
            AppState.equipos.lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            AppState.equipos.hasMore = snap.docs.length === APP_CONFIG.itemsPorPagina;
            AppState.equipos.count = await Model.contarEquipos();

            View.renderEquiposTable(data);
            View.renderEquiposStats(data);
            View.renderEquiposPagination(AppState.equipos.hasMore, data.length);
        } catch (err) {
            View.toast('Error al cargar equipos', 'danger');
            console.error(err);
        }
    },

    async loadMoreEquipos() {
        if (AppState.equipos.loading || !AppState.equipos.hasMore) return;
        AppState.equipos.loading = true;

        try {
            const snap = await Model.getEquiposQuery(APP_CONFIG.itemsPorPagina, AppState.equipos.lastDoc);
            const newData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            AppState.equipos.data.push(...newData);
            AppState.equipos.lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            AppState.equipos.hasMore = snap.docs.length === APP_CONFIG.itemsPorPagina;

            View.renderEquiposTable(AppState.equipos.data);
            View.renderEquiposStats(AppState.equipos.data);
            View.renderEquiposPagination(AppState.equipos.hasMore, AppState.equipos.data.length);
        } catch (err) {
            View.toast('Error al cargar más equipos', 'danger');
        } finally {
            AppState.equipos.loading = false;
        }
    },

    abrirFormEquipo(editId = null) {
        const isEdit = !!editId;
        let equipo = { codigo: '', nombre: '', marca: '', modelo: '', serie: '', ubicacion: '', estado: 'Operativo' };

        if (isEdit) {
            equipo = AppState.equipos.data.find(e => e.id === editId) || equipo;
        }

        const estadosOptions = APP_CONFIG.estadosEquipo.map(e =>
            `<option value="${e}" ${equipo.estado === e ? 'selected' : ''}>${e}</option>`
        ).join('');

        const body = `
            <form id="equipo-form">
                <div class="form-row">
                    <div class="form-group">
                        <label>Código *</label>
                        <input type="text" class="form-control" id="eq-codigo" value="${equipo.codigo}" required>
                    </div>
                    <div class="form-group">
                        <label>Nombre *</label>
                        <input type="text" class="form-control" id="eq-nombre" value="${equipo.nombre}" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Marca</label>
                        <input type="text" class="form-control" id="eq-marca" value="${equipo.marca}">
                    </div>
                    <div class="form-group">
                        <label>Modelo</label>
                        <input type="text" class="form-control" id="eq-modelo" value="${equipo.modelo}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Serie</label>
                        <input type="text" class="form-control" id="eq-serie" value="${equipo.serie}">
                    </div>
                    <div class="form-group">
                        <label>Ubicación</label>
                        <input type="text" class="form-control" id="eq-ubicacion" value="${equipo.ubicacion}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Estado</label>
                    <select class="form-control" id="eq-estado">${estadosOptions}</select>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="Controller.guardarEquipo('${editId || ''}')">
                <i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Guardar'}
            </button>
        `;

        View.openModal(isEdit ? 'Editar Equipo' : 'Nuevo Equipo', body, footer);
    },

    async guardarEquipo(editId) {
        const data = {
            codigo: document.getElementById('eq-codigo').value.trim(),
            nombre: document.getElementById('eq-nombre').value.trim(),
            marca: document.getElementById('eq-marca').value.trim(),
            modelo: document.getElementById('eq-modelo').value.trim(),
            serie: document.getElementById('eq-serie').value.trim(),
            ubicacion: document.getElementById('eq-ubicacion').value.trim(),
            estado: document.getElementById('eq-estado').value
        };

        if (!data.codigo || !data.nombre) {
            View.toast('Código y nombre son obligatorios', 'warning');
            return;
        }

        try {
            if (editId) {
                await Model.actualizarEquipo(editId, data);
                View.toast('Equipo actualizado correctamente');
            } else {
                await Model.crearEquipo(data);
                View.toast('Equipo creado correctamente');
            }
            View.closeModal();
            this.loadEquipos();
            this.loadEquiposSelect();
        } catch (err) {
            View.toast('Error al guardar equipo', 'danger');
            console.error(err);
        }
    },

    editarEquipo(id) {
        this.abrirFormEquipo(id);
    },

    async eliminarEquipo(id) {
        const body = `<p style="text-align:center;">¿Estás seguro de que deseas eliminar este equipo? Esta acción no se puede deshacer.</p>`;
        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="Controller.confirmarEliminarEquipo('${id}')">
                <i class="fas fa-trash"></i> Eliminar
            </button>
        `;
        View.openModal('Eliminar Equipo', body, footer);
    },

    async confirmarEliminarEquipo(id) {
        try {
            await Model.eliminarEquipo(id);
            View.toast('Equipo eliminado');
            View.closeModal();
            this.loadEquipos();
            this.loadEquiposSelect();
        } catch (err) {
            View.toast('Error al eliminar equipo', 'danger');
        }
    },

    // --- Importación Excel ---
    abrirImportExcel() {
        const body = `
            <div class="import-drop-zone" id="import-drop-zone">
                <i class="fas fa-file-excel"></i>
                <h4>Arrastra tu archivo Excel aquí</h4>
                <p>o haz clic para seleccionar (formato .xlsx o .xls)</p>
            </div>
            <input type="file" id="import-file-input" accept=".xlsx,.xls" class="hidden">
            <div id="import-preview" class="hidden">
                <h4 style="margin-bottom:12px;font-size:0.95rem;">Vista previa</h4>
                <div class="preview-table" id="import-preview-table"></div>
                <p id="import-count" class="text-muted" style="font-size:0.85rem;"></p>
            </div>
        `;
        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-success" id="btn-confirm-import" disabled>
                <i class="fas fa-file-import"></i> Importar
            </button>
        `;

        View.openModal('Importar Equipos desde Excel', body, footer, 'lg');

        // Configurar drop zone y file input
        setTimeout(() => {
            const dropZone = document.getElementById('import-drop-zone');
            const fileInput = document.getElementById('import-file-input');
            let importData = [];

            if (dropZone) {
                dropZone.addEventListener('click', () => fileInput.click());
                dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
                dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('drag-over');
                    const file = e.dataTransfer.files[0];
                    if (file) this.processExcelFile(file);
                });
            }

            if (fileInput) {
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) this.processExcelFile(file);
                });
            }

            // Botón confirmar importación
            document.getElementById('btn-confirm-import')?.addEventListener('click', async () => {
                if (importData.length === 0) return;
                try {
                    const batch = db.batch();
                    importData.forEach(row => {
                        const ref = db.collection('equipos').doc();
                        batch.set(ref, {
                            ...row,
                            estado: row.estado || 'Operativo',
                            fechaCreacion: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();
                    View.toast(`${importData.length} equipos importados correctamente`);
                    View.closeModal();
                    this.loadEquipos();
                    this.loadEquiposSelect();
                } catch (err) {
                    View.toast('Error al importar equipos', 'danger');
                    console.error(err);
                }
            });

            // Exponer importData para el botón
            window._importData = importData;
            Object.defineProperty(window, '_importData', {
                set(val) { importData = val; document.getElementById('btn-confirm-import').disabled = val.length === 0; },
                get() { return importData; }
            });
        }, 100);
    },

    processExcelFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (json.length === 0) {
                    View.toast('El archivo está vacío', 'warning');
                    return;
                }

                // Mapear columnas (soporta nombres en español)
                const mapped = json.map(row => ({
                    codigo: row['Código'] || row['codigo'] || row['Codigo'] || '',
                    nombre: row['Nombre'] || row['nombre'] || '',
                    marca: row['Marca'] || row['marca'] || '',
                    modelo: row['Modelo'] || row['modelo'] || '',
                    serie: row['Serie'] || row['serie'] || '',
                    ubicacion: row['Ubicación'] || row['Ubicacion'] || row['ubicacion'] || '',
                    estado: row['Estado'] || row['estado'] || 'Operativo'
                }));

                window._importData = mapped;

                // Mostrar preview
                const preview = document.getElementById('import-preview');
                const table = document.getElementById('import-preview-table');
                const count = document.getElementById('import-count');
                preview?.classList.remove('hidden');
                document.getElementById('import-drop-zone').style.display = 'none';

                let tableHtml = `<table class="data-table"><thead><tr>
                    <th>Código</th><th>Nombre</th><th>Marca</th><th>Modelo</th><th>Serie</th><th>Ubicación</th><th>Estado</th>
                </tr></thead><tbody>`;
                mapped.forEach(r => {
                    tableHtml += `<tr>
                        <td>${r.codigo}</td><td>${r.nombre}</td><td>${r.marca}</td>
                        <td>${r.modelo}</td><td>${r.serie}</td><td>${r.ubicacion}</td><td>${r.estado}</td>
                    </tr>`;
                });
                tableHtml += '</tbody></table>';
                if (table) table.innerHTML = tableHtml;
                if (count) count.textContent = `${mapped.length} registro(s) encontrado(s)`;
            } catch (err) {
                View.toast('Error al leer el archivo Excel', 'danger');
                console.error(err);
            }
        };
        reader.readAsArrayBuffer(file);
    },

    // --- HISTORIAL ---
    async loadEquiposHistorialSelect() {
        const select = document.getElementById('historial-equipo-select');
        select.innerHTML = '<option value="">-- Seleccione un equipo --</option>';
        try {
            const equipos = await Model.getEquiposAll();
            equipos.forEach(eq => {
                const opt = document.createElement('option');
                opt.value = eq.id;
                opt.textContent = `${eq.codigo} - ${eq.nombre}`;
                select.appendChild(opt);
            });
        } catch (err) { console.error(err); }
        View.renderHistorial([], null);
    },

    async cargarHistorial(equipoId) {
        if (!equipoId) {
            View.renderHistorial([], null);
            return;
        }
        const select = document.getElementById('historial-equipo-select');
        const nombre = select.options[select.selectedIndex]?.text || '';
        View.showLoading('historial-list');
        try {
            const historial = await Model.getHistorialEquipo(equipoId);
            View.renderHistorial(historial, nombre);
        } catch (err) {
            View.toast('Error al cargar historial', 'danger');
        }
    },

    // --- ÓRDENES DE TRABAJO ---
    async loadOrdenes() {
        View.showLoading('ordenes-tbody');
        AppState.ordenes = { lastDoc: null, data: [], loading: false, hasMore: true, count: 0 };

        try {
            const snap = await Model.getOrdenesQuery();
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            AppState.ordenes.data = data;
            AppState.ordenes.lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            AppState.ordenes.hasMore = snap.docs.length === APP_CONFIG.itemsPorPagina;

            View.renderOrdenesTable(data);
            View.renderOrdenesStats(data);
            View.renderOrdenesPagination(AppState.ordenes.hasMore, data.length);
        } catch (err) {
            View.toast('Error al cargar órdenes', 'danger');
        }
    },

    async loadMoreOrdenes() {
        if (AppState.ordenes.loading || !AppState.ordenes.hasMore) return;
        AppState.ordenes.loading = true;
        try {
            const snap = await Model.getOrdenesQuery(APP_CONFIG.itemsPorPagina, AppState.ordenes.lastDoc);
            const newData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            AppState.ordenes.data.push(...newData);
            AppState.ordenes.lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
            AppState.ordenes.hasMore = snap.docs.length === APP_CONFIG.itemsPorPagina;

            View.renderOrdenesTable(AppState.ordenes.data);
            View.renderOrdenesStats(AppState.ordenes.data);
            View.renderOrdenesPagination(AppState.ordenes.hasMore, AppState.ordenes.data.length);
        } catch (err) {
            View.toast('Error al cargar más órdenes', 'danger');
        } finally {
            AppState.ordenes.loading = false;
        }
    },

    async abrirFormOrden(editId = null) {
        const isEdit = !!editId;
        let orden = { equipoId: '', tipo: 'Preventivo', actividades: '' };

        // Cargar equipos para el select
        const equipos = await Model.getEquiposAll();
        const equipoOptions = equipos.map(eq =>
            `<option value="${eq.id}" data-nombre="${eq.nombre}" data-codigo="${eq.codigo}">${eq.codigo} - ${eq.nombre}</option>`
        ).join('');

        if (isEdit) {
            orden = AppState.ordenes.data.find(o => o.id === editId) || orden;
        }

        const tipoOptions = APP_CONFIG.tiposOrden.map(t =>
            `<option value="${t}" ${orden.tipo === t ? 'selected' : ''}>${t}</option>`
        ).join('');

        const body = `
            <form id="orden-form">
                <div class="form-group">
                    <label>Equipo *</label>
                    <select class="form-control" id="or-equipo" required>
                        <option value="">-- Seleccione un equipo --</option>
                        ${equipoOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label>Tipo de orden *</label>
                    <select class="form-control" id="or-tipo">${tipoOptions}</select>
                </div>
                <div class="form-group">
                    <label>Actividades a realizar *</label>
                    <textarea class="form-control" id="or-actividades" rows="4" required>${orden.actividades || ''}</textarea>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="Controller.guardarOrden('${editId || ''}')">
                <i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Crear orden'}
            </button>
        `;

        View.openModal(isEdit ? 'Editar Orden' : 'Nueva Orden de Trabajo', body, footer);

        // Seleccionar equipo si edita
        if (isEdit && orden.equipoId) {
            setTimeout(() => { document.getElementById('or-equipo').value = orden.equipoId; }, 50);
        }
    },

    async guardarOrden(editId) {
        const equipoSelect = document.getElementById('or-equipo');
        const equipoOption = equipoSelect.options[equipoSelect.selectedIndex];
        const data = {
            equipoId: equipoSelect.value,
            equipoNombre: equipoOption?.dataset.nombre || '',
            equipoCodigo: equipoOption?.dataset.codigo || '',
            tipo: document.getElementById('or-tipo').value,
            actividades: document.getElementById('or-actividades').value.trim()
        };

        if (!data.equipoId || !data.actividades) {
            View.toast('Equipo y actividades son obligatorios', 'warning');
            return;
        }

        try {
            if (editId) {
                await Model.actualizarOrden(editId, data);
                View.toast('Orden actualizada');
            } else {
                await Model.crearOrden(data);
                View.toast('Orden creada correctamente');
            }
            View.closeModal();
            this.loadOrdenes();
        } catch (err) {
            View.toast('Error al guardar orden', 'danger');
        }
    },

    editarOrden(id) { this.abrirFormOrden(id); },

    async eliminarOrden(id) {
        const body = `<p style="text-align:center;">¿Eliminar esta orden de trabajo?</p>`;
        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="Controller.confirmarEliminarOrden('${id}')"><i class="fas fa-trash"></i> Eliminar</button>
        `;
        View.openModal('Eliminar Orden', body, footer);
    },

    async confirmarEliminarOrden(id) {
        try {
            await Model.eliminarOrden(id);
            View.toast('Orden eliminada');
            View.closeModal();
            this.loadOrdenes();
        } catch (err) { View.toast('Error al eliminar', 'danger'); }
    },

    // --- REPORTES DE ÓRDENES ---
    async loadReportesOrdenes() {
        const container = document.getElementById('reportes-ordenes-list');
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        document.getElementById('reporte-orden-form-container').classList.add('hidden');

        try {
            const snap = await db.collection('ordenes').orderBy('consecutivo', 'desc').limit(100).get();
            const ordenes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            View.renderReportesOrdenesList(ordenes);
        } catch (err) {
            View.toast('Error al cargar órdenes', 'danger');
        }
    },

    async abrirReporteOrden(ordenId) {
        try {
            const doc = await db.collection('ordenes').doc(ordenId).get();
            if (!doc.exists) { View.toast('Orden no encontrada', 'danger'); return; }
            const orden = { id: doc.id, ...doc.data() };

            // Llenar formulario
            document.getElementById('ro-orden-id').value = orden.id;
            document.getElementById('ro-equipo-id').value = orden.equipoId || '';
            document.getElementById('ro-consecutivo').value = orden.consecutivo || 0;
            document.getElementById('ro-tipo').value = orden.tipo || '';
            document.getElementById('ro-equipo-nombre').value = orden.equipoNombre || '';
            document.getElementById('ro-equipo-codigo').value = orden.equipoCodigo || '';
            document.getElementById('ro-fecha').value = new Date().toISOString().split('T')[0];
            document.getElementById('reporte-orden-title').textContent = `Reporte de Orden #${String(orden.consecutivo || 0).padStart(4, '0')}`;

            // Limpiar campos
            document.getElementById('ro-hora-inicio').value = '';
            document.getElementById('ro-hora-final').value = '';
            document.getElementById('ro-repuestos').value = '';
            document.getElementById('ro-actividades').value = orden.actividades || '';
            document.getElementById('ro-observaciones').value = '';

            // Limpiar fotos y firma
            AppState.tempPhotos.ro = [];
            AppState.firmaData.ro = null;
            View.renderPhotoGrid([], 'ro');
            this.limpiarFirma('ro');

            // Mostrar formulario, ocultar lista
            document.getElementById('reportes-ordenes-list').classList.add('hidden');
            document.getElementById('reporte-orden-form-container').classList.remove('hidden');
            document.getElementById('ro-generar-pdf').disabled = true;
            AppState.lastSavedReport = null;

            // Cargar técnicos en select
            await this.loadTecnicosSelect('ro-tecnico');

            // Marcar orden como "En proceso"
            await Model.actualizarOrden(orden.id, { estado: 'En proceso' });

        } catch (err) {
            View.toast('Error al cargar orden', 'danger');
            console.error(err);
        }
    },

    volverListaReportesOrdenes() {
        document.getElementById('reportes-ordenes-list').classList.remove('hidden');
        document.getElementById('reporte-orden-form-container').classList.add('hidden');
        this.loadReportesOrdenes();
    },

    async guardarReporteOrden(e) {
        e.preventDefault();
        const data = {
            ordenId: document.getElementById('ro-orden-id').value,
            equipoId: document.getElementById('ro-equipo-id').value,
            consecutivoOrden: parseInt(document.getElementById('ro-consecutivo').value) || 0,
            tipo: document.getElementById('ro-tipo').value,
            equipoNombre: document.getElementById('ro-equipo-nombre').value,
            equipoCodigo: document.getElementById('ro-equipo-codigo').value,
            fecha: document.getElementById('ro-fecha').value,
            horaInicio: document.getElementById('ro-hora-inicio').value,
            horaFinal: document.getElementById('ro-hora-final').value,
            tecnicoNombre: document.getElementById('ro-tecnico').value,
            repuestos: document.getElementById('ro-repuestos').value.trim(),
            actividadesRealizadas: document.getElementById('ro-actividades').value.trim(),
            observaciones: document.getElementById('ro-observaciones').value.trim(),
            evidencias: [...AppState.tempPhotos.ro],
            firma: AppState.firmaData.ro
        };

        try {
            const ref = await Model.crearReporteOrden(data);
            // Marcar orden como completada
            await Model.actualizarOrden(data.ordenId, { estado: 'Completada' });

            AppState.lastSavedReport = ref.id;
            document.getElementById('ro-generar-pdf').disabled = false;
            View.toast('Reporte guardado correctamente');
        } catch (err) {
            View.toast('Error al guardar reporte', 'danger');
            console.error(err);
        }
    },

    // --- REPORTES CORRECTIVOS ---
    async loadCorrectivos() {
        try {
            const correctivos = await Model.getCorrectivosAll();
            View.renderCorrectivosList(correctivos);
            await this.loadTecnicosSelect('rc-tecnico');
            await this.loadEquiposSelect('rc-equipo');

            // Reset formulario
            document.getElementById('correctivo-form').reset();
            AppState.tempPhotos.rc = [];
            AppState.firmaData.rc = null;
            View.renderPhotoGrid([], 'rc');
            this.limpiarFirma('rc');
            document.getElementById('rc-generar-pdf').disabled = true;
            AppState.lastSavedCorrectivo = null;
        } catch (err) {
            View.toast('Error al cargar correctivos', 'danger');
        }
    },

    async guardarReporteCorrectivo(e) {
        e.preventDefault();
        const equipoSelect = document.getElementById('rc-equipo');
        const equipoOption = equipoSelect.options[equipoSelect.selectedIndex];

        const data = {
            equipoId: equipoSelect.value,
            equipoNombre: equipoOption?.textContent?.split(' - ')[1] || '',
            equipoCodigo: equipoOption?.textContent?.split(' - ')[0] || '',
            fecha: document.getElementById('rc-fecha').value,
            horaInicio: document.getElementById('rc-hora-inicio').value,
            horaFinal: document.getElementById('rc-hora-final').value,
            tecnicoNombre: document.getElementById('rc-tecnico').value,
            repuestos: document.getElementById('rc-repuestos').value.trim(),
            actividadesRealizadas: document.getElementById('rc-actividades').value.trim(),
            observaciones: document.getElementById('rc-observaciones').value.trim(),
            evidencias: [...AppState.tempPhotos.rc],
            firma: AppState.firmaData.rc
        };

        if (!data.equipoId) {
            View.toast('Seleccione un equipo', 'warning');
            return;
        }

        try {
            const ref = await Model.crearReporteCorrectivo(data);
            AppState.lastSavedCorrectivo = ref.id;
            document.getElementById('rc-generar-pdf').disabled = false;
            View.toast('Reporte correctivo guardado correctamente');

            // Recargar lista
            const correctivos = await Model.getCorrectivosAll();
            View.renderCorrectivosList(correctivos);

            // Limpiar formulario para el próximo
            document.getElementById('correctivo-form').reset();
            AppState.tempPhotos.rc = [];
            AppState.firmaData.rc = null;
            View.renderPhotoGrid([], 'rc');
            this.limpiarFirma('rc');
            document.getElementById('rc-generar-pdf').disabled = true;
            AppState.lastSavedCorrectivo = null;
        } catch (err) {
            View.toast('Error al guardar reporte correctivo', 'danger');
            console.error(err);
        }
    },

    async verCorrectivo(id) {
        const data = await Model.getCorrectivoById(id);
        if (!data) { View.toast('Reporte no encontrado', 'danger'); return; }
        this.generarPDFCorrectivo(id);
    },

    // --- TÉCNICOS ---
    async loadTecnicos() {
        try {
            const tecnicos = await Model.getTecnicosAll();
            View.renderTecnicosList(tecnicos);
        } catch (err) { View.toast('Error al cargar técnicos', 'danger'); }
    },

    abrirFormTecnico(editId = null) {
        const isEdit = !!editId;
        const body = `
            <form id="tecnico-form">
                <div class="form-group">
                    <label>Nombre completo *</label>
                    <input type="text" class="form-control" id="tc-nombre" required>
                </div>
                <div class="form-group">
                    <label>Cargo *</label>
                    <input type="text" class="form-control" id="tc-cargo" required>
                </div>
                <div class="form-group">
                    <label>Firma</label>
                    <canvas class="signature-canvas" id="tc-firma-canvas"></canvas>
                    <div class="signature-actions">
                        <button type="button" class="btn btn-outline btn-sm" id="tc-limpiar-firma"><i class="fas fa-eraser"></i> Limpiar</button>
                    </div>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="Controller.guardarTecnico('${editId || ''}')">
                <i class="fas fa-save"></i> ${isEdit ? 'Actualizar' : 'Guardar'}
            </button>
        `;

        View.openModal(isEdit ? 'Editar Técnico' : 'Nuevo Técnico', body, footer);

        setTimeout(() => {
            this.setupSignatureCanvas('tc-firma-canvas', 'tc');
            document.getElementById('tc-limpiar-firma').addEventListener('click', () => this.limpiarFirma('tc'));

            if (isId) {
                // Cargar datos existentes
                Model.getTecnicosAll().then(tecnicos => {
                    const tec = tecnicos.find(t => t.id === editId);
                    if (tec) {
                        document.getElementById('tc-nombre').value = tec.nombre || '';
                        document.getElementById('tc-cargo').value = tec.cargo || '';
                    }
                });
            }
        }, 100);
    },

    async guardarTecnico(editId) {
        const data = {
            nombre: document.getElementById('tc-nombre').value.trim(),
            cargo: document.getElementById('tc-cargo').value.trim(),
            firma: AppState.firmaData.tc || null
        };

        if (!data.nombre || !data.cargo) {
            View.toast('Nombre y cargo son obligatorios', 'warning');
            return;
        }

        try {
            if (editId) {
                await Model.actualizarTecnico(editId, data);
                View.toast('Técnico actualizado');
            } else {
                await Model.crearTecnico(data);
                View.toast('Técnico creado correctamente');
            }
            View.closeModal();
            this.loadTecnicos();
            this.loadTecnicosSelect();
        } catch (err) {
            View.toast('Error al guardar técnico', 'danger');
        }
    },

    editarTecnico(id) { this.abrirFormTecnico(id); },

    async eliminarTecnico(id) {
        const body = `<p style="text-align:center;">¿Eliminar este técnico?</p>`;
        const footer = `
            <button class="btn btn-outline" onclick="View.closeModal()">Cancelar</button>
            <button class="btn btn-danger" onclick="Controller.confirmarEliminarTecnico('${id}')"><i class="fas fa-trash"></i> Eliminar</button>
        `;
        View.openModal('Eliminar Técnico', body, footer);
    },

    async confirmarEliminarTecnico(id) {
        try {
            await Model.eliminarTecnico(id);
            View.toast('Técnico eliminado');
            View.closeModal();
            this.loadTecnicos();
            this.loadTecnicosSelect();
        } catch (err) { View.toast('Error al eliminar', 'danger'); }
    },

    // --- USUARIOS ---
    async loadUsuarios() {
        try {
            const usuarios = await Model.getUsuariosAll();
            View.renderUsuariosTable(usuarios);
        } catch (err) { View.toast('Error al cargar usuarios', 'danger'); }
    },

    async cambiarRolUsuario(uid, currentRol) {
        const newRol = currentRol === 'admin' ? 'tecnico' : 'admin';
        try {
            await Model.actualizarUsuarioRol(uid, newRol);
            View.toast(`Rol cambiado a ${newRol}`);
            this.loadUsuarios();
        } catch (err) { View.toast('Error al cambiar rol', 'danger'); }
    },

    // --- LOGO ---
    async loadLogo() {
        try {
            const logo = await Model.getLogo();
            View.renderLogoPreview(logo);
        } catch (err) { console.error(err); }
    },

    async handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Comprimir imagen
        const base64 = await this.comprimirImagen(file, 400, 0.8);
        try {
            await Model.setLogo(base64);
            View.renderLogoPreview(base64);
            View.toast('Logo actualizado correctamente');
        } catch (err) {
            View.toast('Error al subir logo', 'danger');
        }
    },

    async removeLogo() {
        try {
            await Model.removeLogo();
            View.renderLogoPreview(null);
            View.toast('Logo eliminado');
        } catch (err) { View.toast('Error al eliminar logo', 'danger'); }
    },

    // --- SELECTS COMUNES ---
    async loadTecnicosSelect(selectId = 'ro-tecnico') {
        try {
            const tecnicos = await Model.getTecnicosAll();
            const select = document.getElementById(selectId);
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">-- Seleccione técnico --</option>';
            tecnicos.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.nombre;
                opt.textContent = `${t.nombre} - ${t.cargo}`;
                select.appendChild(opt);
            });
            if (currentVal) select.value = currentVal;
        } catch (err) { console.error(err); }
    },

    async loadEquiposSelect(selectId = null) {
        try {
            const equipos = await Model.getEquiposAll();
            if (selectId) {
                const select = document.getElementById(selectId);
                if (!select) return;
                select.innerHTML = '<option value="">-- Seleccione un equipo --</option>';
                equipos.forEach(eq => {
                    const opt = document.createElement('option');
                    opt.value = eq.id;
                    opt.textContent = `${eq.codigo} - ${eq.nombre}`;
                    select.appendChild(opt);
                });
            }
        } catch (err) { console.error(err); }
    },

    // --- BÚSQUEDA ---
    async handleSearch(term) {
        try {
            const results = await Model.buscarGlobal(term);
            View.renderSearchResults(results);
        } catch (err) { console.error(err); }
    },

    irAEquipo(id) {
        View.hideSearchResults();
        document.getElementById('historial-equipo-select').value = id;
        View.setActiveModule('equipos-historial');
        this.loadEquiposHistorialSelect().then(() => {
            document.getElementById('historial-equipo-select').value = id;
            this.cargarHistorial(id);
        });
    },

    irAOrden(id) {
        View.hideSearchResults();
        // Buscar la orden y abrir su edición o reporte
        View.setActiveModule('ordenes');
        this.loadOrdenes();
    },

    // --- BÚSQUEDA ---
    async handleSearch(term) {
        try {
            const results = await Model.buscarGlobal(term);
            View.renderSearchResults(results);
        } catch (err) { console.error(err); }
    },

    // --- FOTOS ---
    setupPhotoUpload(prefix) {
        const uploadArea = document.getElementById(`${prefix}-photo-upload`);
        const fileInput = document.getElementById(`${prefix}-photo-input`);

        if (uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
            uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
            uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'));
            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('drag-over');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                this.processPhotos(files, prefix);
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
                this.processPhotos(files, prefix);
                e.target.value = '';
            });
        }
    },

    async processPhotos(files, prefix) {
        const max = APP_CONFIG.maxFotosEvidencia;
        const remaining = max - AppState.tempPhotos[prefix].length;
        const toProcess = files.slice(0, remaining);

        if (files.length > remaining) {
            View.toast(`Máximo ${max} fotos. Se tomarán las primeras ${remaining}`, 'warning');
        }

        for (const file of toProcess) {
            const base64 = await this.comprimirImagen(file, APP_CONFIG.maxTamannoFoto, APP_CONFIG.calidadFoto);
            AppState.tempPhotos[prefix].push(base64);
        }
        View.renderPhotoGrid(AppState.tempPhotos[prefix], prefix);
    },

    removePhoto(prefix, index) {
        AppState.tempPhotos[prefix].splice(index, 1);
        View.renderPhotoGrid(AppState.tempPhotos[prefix], prefix);
    },

    comprimirImagen(file, maxAncho, calidad) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxAncho) { h = (maxAncho / w) * h; w = maxAncho; }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', calidad));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    // --- FIRMAS ---
    setupSignatureCanvas(canvasId, prefix) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let drawing = false;

        // Ajustar tamaño del canvas al contenedor
        const resize = () => {
            const rect = canvas.parentElement.getBoundingClientRect();
            const tempData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            canvas.width = rect.width - 4;
            canvas.height = 120;
            ctx.putImageData(tempData, 0, 0);
            ctx.strokeStyle = '#1A2332';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        };
        resize();
        window.addEventListener('resize', resize);

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches ? e.touches[0] : e;
            return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        };

        const start = (e) => { e.preventDefault(); drawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
        const move = (e) => { if (!drawing) return; e.preventDefault(); const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
        const end = () => { drawing = false; AppState.firmaData[prefix] = canvas.toDataURL('image/png'); };

        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end);
    },

    limpiarFirma(prefix) {
        const canvasMap = { ro: 'ro-firma-canvas', rc: 'rc-firma-canvas', tc: 'tc-firma-canvas' };
        const canvas = document.getElementById(canvasMap[prefix]);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        AppState.firmaData[prefix] = null;
    },

    // --- LOGO ---
    async handleLogoUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const base64 = await this.comprimirImagen(file, 400, 0.8);
        try {
            await Model.setLogo(base64);
            View.renderLogoPreview(base64);
            View.toast('Logo actualizado correctamente');
        } catch (err) { View.toast('Error al subir logo', 'danger'); }
    },

    async removeLogo() {
        try {
            await Model.removeLogo();
            View.renderLogoPreview(null);
            View.toast('Logo eliminado');
        } catch (err) { View.toast('Error al eliminar logo', 'danger'); }
    },

    // --- GENERACIÓN DE PDFs ---
    async generarPDFReporteOrden() {
        if (!AppState.lastSavedReport) return;
        View.toast('Generando PDF...', 'warning');
        try {
            const doc = await db.collection('reportesOrdenes').doc(AppState.lastSavedReport).get();
            if (!doc.exists) { View.toast('Reporte no encontrado', 'danger'); return; }
            const data = doc.data();
            const logo = await Model.getLogo();
            this.construirPDF(data, logo, 'REPORTE DE ORDEN DE TRABAJO');
        } catch (err) { View.toast('Error al generar PDF', 'danger'); console.error(err); }
    },

    async generarPDFCorrectivo(id) {
        View.toast('Generando PDF...', 'warning');
        try {
            const data = await Model.getCorrectivoById(id);
            if (!data) { View.toast('Reporte no encontrado', 'danger'); return; }
            const logo = await Model.getLogo();
            this.construirPDF(data, logo, 'REPORTE DE MANTENIMIENTO CORRECTIVO');
        } catch (err) { View.toast('Error al generar PDF', 'danger'); console.error(err); }
    },

    async generarPDFHistorial(tipo, id) {
        View.toast('Generando PDF...', 'warning');
        try {
            let data;
            if (tipo === 'orden') {
                const doc = await db.collection('reportesOrdenes').doc(id).get();
                data = doc.exists ? doc.data() : null;
            } else {
                data = await Model.getCorrectivoById(id);
            }
            if (!data) { View.toast('No encontrado', 'danger'); return; }
            const logo = await Model.getLogo();
            this.construirPDF(data, logo, 'REPORTE DE MANTENIMIENTO');
        } catch (err) { View.toast('Error al generar PDF', 'danger'); }
    },

    construirPDF(data, logo, titulo) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = 210, ph = 297, margin = 15;
        let y = margin;

        // Encabezado con logo y nombre de empresa
        if (logo) {
            try { pdf.addImage(logo, 'JPEG', margin, y, 35, 18); } catch(e) {}
        }
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.text(APP_CONFIG.nombreEmpresa, logo ? margin + 40 : margin, y + 10);
        pdf.setFontSize(9);
        pdf.setFont(undefined, 'normal');
        pdf.text('NIT: 901.234.567-8', logo ? margin + 40 : margin, y + 16);
        y += 25;

        // Línea separadora
        pdf.setDrawColor(13, 92, 143);
        pdf.setLineWidth(0.8);
        pdf.line(margin, y, pw - margin, y);
        y += 8;

        // Título del reporte
        pdf.setFontSize(13);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(13, 92, 143);
        pdf.text(titulo, pw / 2, y, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
        y += 10;

        // Número de reporte
        const numReporte = data.consecutivoOrden ? `Orden No. ${String(data.consecutivoOrden).padStart(4, '0')}` : `RC-${String(data.consecutivo || 0).padStart(4, '0')}`;
        pdf.setFontSize(11);
        pdf.text(numReporte, pw / 2, y, { align: 'center' });
        y += 10;

        // Función helper para agregar campo
        const addField = (label, value) => {
            if (y > ph - 30) { pdf.addPage(); y = margin; }
            pdf.setFontSize(9);
            pdf.setFont(undefined, 'bold');
            pdf.text(label + ':', margin, y);
            pdf.setFont(undefined, 'normal');
            pdf.text(String(value || '-'), margin + 45, y);
            y += 6;
        };

        // Función helper para texto largo
        const addLongText = (label, value) => {
            if (!value) return;
            pdf.setFontSize(9);
            pdf.setFont(undefined, 'bold');
            pdf.text(label + ':', margin, y);
            y += 5;
            pdf.setFont(undefined, 'normal');
            const lines = pdf.splitTextToSize(String(value), pw - margin * 2 - 5);
            lines.forEach(line => {
                if (y > ph - 25) { pdf.addPage(); y = margin; }
                pdf.text(line, margin + 5, y);
                y += 4.5;
            });
            y += 3;
        };

        // Datos del reporte
        addField('Fecha', data.fecha);
        addField('Hora Inicio', data.horaInicio);
        addField('Hora Final', data.horaFinal);
        addField('Equipo', `${data.equipoCodigo || ''} - ${data.equipoNombre || ''}`);
        if (data.tipo) addField('Tipo', data.tipo);
        addField('Tecnico', data.tecnicoNombre);

        y += 3;
        addLongText('Repuestos Utilizados', data.repuestos);
        addLongText('Actividades Realizadas', data.actividadesRealizadas);
        addLongText('Observaciones', data.observaciones);

        // Evidencia fotográfica
        if (data.evidencias && data.evidencias.length > 0) {
            if (y > ph - 80) { pdf.addPage(); y = margin; }
            pdf.setFontSize(9);
            pdf.setFont(undefined, 'bold');
            pdf.text('Evidencia Fotografica:', margin, y);
            y += 6;

            const imgW = 80, imgH = 60;
            let col = margin;
            data.evidencias.forEach((img, i) => {
                if (y + imgH > ph - 20) { pdf.addPage(); y = margin; col = margin; }
                try {
                    pdf.addImage(img, 'JPEG', col, y, imgW, imgH);
                    pdf.setDrawColor(200, 200, 200);
                    pdf.rect(col, y, imgW, imgH);
                } catch(e) {}
                col += imgW + 8;
                if (col + imgW > pw - margin) { col = margin; y += imgH + 5; }
            });
            y += imgH + 8;
        }

        // Firma
        if (data.firma) {
            if (y > ph - 50) { pdf.addPage(); y = margin; }
            y += 10;
            pdf.setFontSize(9);
            pdf.setFont(undefined, 'bold');
            pdf.text('Firma del Tecnico:', margin, y);
            y += 5;
            try {
                pdf.addImage(data.firma, 'PNG', margin, y, 60, 25);
            } catch(e) {}
            y += 28;
            pdf.setDrawColor(0, 0, 0);
            pdf.setLineWidth(0.3);
            pdf.line(margin, y, margin + 60, y);
            y += 4;
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(8);
            pdf.text(data.tecnicoNombre || 'Tecnico', margin, y);
        }

        // Pie de página
        const pageCount = pdf.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(7);
            pdf.setTextColor(150, 150, 150);
            pdf.text(`Generado por ${APP_CONFIG.nombreEmpresa} - ${new Date().toLocaleString('es-CO')}`, pw / 2, ph - 8, { align: 'center' });
            pdf.text(`Pagina ${i} de ${pageCount}`, pw - margin, ph - 8, { align: 'right' });
            pdf.setTextColor(0, 0, 0);
        }

        // Descargar
        const fileName = `${titulo.replace(/ /g, '_')}_${numReporte.replace(/ /g, '')}_${data.fecha || 'sin_fecha'}.pdf`;
        pdf.save(fileName);
        View.toast('PDF generado correctamente');
    }
};

// ============================================
// INICIALIZAR LA APLICACIÓN
// ============================================
// Hacer Controller accesible globalmente para los onclick del HTML
window.Controller = Controller;

// Esperar a que el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Controller.init());
} else {
    Controller.init();
}
