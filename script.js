/* ============================================================
   script.js — LleSer Ltda.
   Lógica de la aplicación (SPA sin framework, ES Modules nativos).

   ------------------------------------------------------------
   ESTADO DE CONSTRUCCIÓN — PARTE 1 de N
   ------------------------------------------------------------
   Este archivo se está construyendo por partes. En esta entrega:
     ✅ Utilidades compartidas (toasts, modales, validaciones)
     ✅ Módulo COMPLETO: Configuración
         - Pestaña "Logo de la empresa"
         - Pestaña "Técnicos" (CRUD + firma con canvas)

   Pendiente para próximas partes (no tocar / no implementado aún):
     ⏳ Autenticación (login, logout, onAuthStateChanged, roles)
     ⏳ Router de módulos (sidebar, hamburguesa, hash persistente)
     ⏳ Módulo Equipos (CRUD, historial, importar Excel)
     ⏳ Módulo Órdenes de trabajo
     ⏳ Módulo Reportes de OT asignadas (+ generación PDF)
     ⏳ Módulo Reportes de mantenimiento correctivo (+ PDF)
     ⏳ Buscador global
     ⏳ Paginación / lazy loading genérico

   Por eso, al final del archivo, `initConfiguracionModule()` se
   expone y se llama directamente en DOMContentLoaded SOLO para
   poder probar este módulo de forma aislada mientras se completan
   las demás partes. Cuando agreguemos el router (Parte 2), esa
   llamada se moverá a un init() central.
   ============================================================ */

import {
  db, storage,
  collection, doc, setDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, query, orderBy, serverTimestamp,
  storageRef, uploadBytes, getDownloadURL, deleteObject,
  COLLECTIONS, APP_CONFIG
} from "./config.js";

/* ============================================================
   UTILIDADES COMPARTIDAS
   (se usarán también en los módulos de las próximas partes)
   ============================================================ */

/** Refresca los íconos Lucide después de inyectar HTML dinámico. */
function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/** Muestra una notificación tipo toast. */
function toast(mensaje, tipo = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const el = document.createElement("div");
  el.className = `toast toast--${tipo}`;
  el.setAttribute("role", "status");

  const iconMap = { success: "check-circle-2", error: "alert-circle", info: "info" };
  el.innerHTML = `<i data-lucide="${iconMap[tipo] || "info"}"></i><span>${mensaje}</span>`;

  container.appendChild(el);
  refreshIcons();

  requestAnimationFrame(() => el.classList.add("is-visible"));
  setTimeout(() => {
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 250);
  }, 4000);
}

/** Abre un modal por su id. */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add("is-open"));
  refreshIcons();
}

/** Cierra un modal por su id y resetea su(s) formulario(s). */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("is-open");
  setTimeout(() => {
    modal.hidden = true;
    modal.querySelectorAll("form").forEach((f) => f.reset());
  }, 200);
}

// Delegación global: cualquier botón con [data-close-modal="id"] cierra ese modal
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-close-modal]");
  if (btn) closeModal(btn.dataset.closeModal);
});

/**
 * Abre el modal de confirmación genérico y ejecuta `onConfirm` si el
 * usuario confirma. Reutilizable por todos los módulos (eliminar
 * equipo, orden, técnico, etc.).
 */
function confirmAction({ title = "¿Confirmar acción?", message = "Esta acción no se puede deshacer.", confirmLabel = "Eliminar", onConfirm }) {
  const modal = document.getElementById("modal-confirm");
  document.getElementById("modal-confirm-title").textContent = title;
  document.getElementById("modal-confirm-message").textContent = message;

  const btn = document.getElementById("btn-confirm-action");
  btn.textContent = confirmLabel;

  // Reemplaza el botón para limpiar listeners previos (evita ejecuciones duplicadas)
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);

  freshBtn.addEventListener("click", async () => {
    freshBtn.disabled = true;
    try {
      await onConfirm();
      closeModal("modal-confirm");
    } catch (err) {
      console.error(err);
      toast("Ocurrió un error al ejecutar la acción.", "error");
    } finally {
      freshBtn.disabled = false;
    }
  });

  openModal("modal-confirm");
}

/** Valida que un archivo sea una imagen y no supere el tamaño máximo. */
function validarImagen(file, maxMB = APP_CONFIG.maxTamanoImagenMB) {
  if (!file) return "No se seleccionó ningún archivo.";
  if (!file.type.startsWith("image/")) return "El archivo debe ser una imagen.";
  if (file.size > maxMB * 1024 * 1024) return `La imagen no debe superar ${maxMB} MB.`;
  return null;
}

/** Activa/desactiva el estado de "cargando" de un botón con spinner. */
function setButtonLoading(button, loading, labelSelector = ".btn-label", spinnerSelector = ".btn-spinner") {
  if (!button) return;
  button.disabled = loading;
  const label = button.querySelector(labelSelector);
  const spinner = button.querySelector(spinnerSelector);
  if (spinner) spinner.hidden = !loading;
  if (label && loading) label.dataset.original = label.dataset.original || label.textContent;
}

/* ============================================================
   MÓDULO: CONFIGURACIÓN
   ============================================================ */

/* ---------- Sub-pestañas (Logo / Técnicos) ---------- */
function initConfiguracionTabs() {
  const section = document.getElementById("module-configuracion");
  if (!section) return;

  const tabs = section.querySelectorAll(".tabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      tabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", t === tab ? "true" : "false");
      });

      section.querySelectorAll(".tab-panel").forEach((panel) => {
        const isTarget = panel.id === `tab-${target}`;
        panel.hidden = !isTarget;
        panel.classList.toggle("is-active", isTarget);
      });
    });
  });
}

/* ---------- 5.1 Logo de la empresa ---------- */

const logoPreviewEl = () => document.getElementById("logo-preview");

function renderLogoPreview(url) {
  const preview = logoPreviewEl();
  if (!preview) return;

  if (url) {
    preview.innerHTML = `<img src="${url}" alt="Logo de ${APP_CONFIG.nombreEmpresa}">`;
  } else {
    preview.innerHTML = `<i data-lucide="image"></i><span>Sin logo cargado</span>`;
    refreshIcons();
  }
}

async function cargarLogoActual() {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.CONFIGURACION, APP_CONFIG.configDocId));
    renderLogoPreview(snap.exists() ? snap.data().logoURL : null);
  } catch (err) {
    console.error("Error al cargar el logo:", err);
  }
}

async function subirLogo(file) {
  const error = validarImagen(file);
  if (error) return toast(error, "error");

  const btn = document.getElementById("btn-upload-logo");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Subiendo…`;
  refreshIcons();

  try {
    const extension = file.name.split(".").pop();
    const ref = storageRef(storage, `${APP_CONFIG.storagePathLogo}.${extension}`);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);

    await setDoc(
      doc(db, COLLECTIONS.CONFIGURACION, APP_CONFIG.configDocId),
      { logoURL: url, logoActualizado: serverTimestamp() },
      { merge: true }
    );

    renderLogoPreview(url);
    toast("Logo actualizado correctamente.", "success");
  } catch (err) {
    console.error("Error al subir el logo:", err);
    toast("No se pudo subir el logo. Intenta nuevamente.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
    refreshIcons();
  }
}

async function quitarLogo() {
  try {
    const refDoc = doc(db, COLLECTIONS.CONFIGURACION, APP_CONFIG.configDocId);
    const snap = await getDoc(refDoc);
    const data = snap.data();

    if (data?.logoURL) {
      try {
        // Intenta borrar el archivo físico; si ya no existe, continúa sin error.
        const path = decodeURIComponent(new URL(data.logoURL).pathname.split("/o/")[1].split("?")[0]);
        await deleteObject(storageRef(storage, path));
      } catch (e) {
        console.warn("No se pudo eliminar el archivo del logo en Storage:", e);
      }
    }

    await updateDoc(refDoc, { logoURL: null, logoActualizado: serverTimestamp() });
    renderLogoPreview(null);
    toast("Logo eliminado.", "success");
  } catch (err) {
    console.error("Error al quitar el logo:", err);
    toast("No se pudo quitar el logo.", "error");
  }
}

function initLogoTab() {
  const fileInput = document.getElementById("logo-file-input");
  const uploadBtn = document.getElementById("btn-upload-logo");
  const removeBtn = document.getElementById("btn-remove-logo");

  uploadBtn?.addEventListener("click", () => fileInput.click());
  fileInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) subirLogo(file);
    fileInput.value = ""; // permite volver a seleccionar el mismo archivo
  });

  removeBtn?.addEventListener("click", () => {
    confirmAction({
      title: "Quitar logo",
      message: "El logo dejará de mostrarse en los reportes PDF. ¿Deseas continuar?",
      confirmLabel: "Quitar logo",
      onConfirm: quitarLogo
    });
  });

  cargarLogoActual();
}

/* ---------- 5.2 Técnicos (CRUD + firma) ---------- */

let tecnicosCache = [];       // último snapshot recibido de Firestore
let unsubscribeTecnicos = null;
let firmaDibujada = false;    // true si el usuario dibujó algo en el canvas actual

function initTecnicosRealtime() {
  const q = query(collection(db, COLLECTIONS.TECNICOS), orderBy("nombre"));
  unsubscribeTecnicos = onSnapshot(
    q,
    (snap) => {
      tecnicosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderTecnicosTable(tecnicosCache);
    },
    (err) => {
      console.error("Error al escuchar técnicos:", err);
      toast("No se pudieron cargar los técnicos.", "error");
    }
  );
}

function renderTecnicosTable(lista) {
  const tbody = document.getElementById("tecnicos-tbody");
  const empty = document.getElementById("tecnicos-empty");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!lista.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  lista.forEach((tec) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(tec.nombre)}</td>
      <td>${escapeHtml(tec.cargo || "—")}</td>
      <td>${tec.firmaURL ? `<img class="firma-thumb" src="${tec.firmaURL}" alt="Firma de ${escapeHtml(tec.nombre)}">` : "—"}</td>
      <td class="col-actions">
        <button class="icon-btn" data-action="edit" data-id="${tec.id}" aria-label="Editar técnico"><i data-lucide="pencil"></i></button>
        <button class="icon-btn icon-btn--danger" data-action="delete" data-id="${tec.id}" aria-label="Eliminar técnico"><i data-lucide="trash-2"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  refreshIcons();
}

function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ----- Buscador local de la tabla de técnicos ----- */
function initTecnicosSearch() {
  const input = document.getElementById("tecnicos-search");
  input?.addEventListener("input", () => {
    const term = input.value.trim().toLowerCase();
    const filtrados = !term
      ? tecnicosCache
      : tecnicosCache.filter((t) =>
          `${t.nombre} ${t.cargo}`.toLowerCase().includes(term)
        );
    renderTecnicosTable(filtrados);
  });
}

/* ----- Firma (canvas) ----- */
let canvasCtx = null;
let dibujando = false;

function getCanvasPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

function initFirmaCanvas() {
  const canvas = document.getElementById("tecnico-firma-canvas");
  if (!canvas) return;

  canvasCtx = canvas.getContext("2d");
  canvasCtx.lineWidth = 2.2;
  canvasCtx.lineCap = "round";
  canvasCtx.strokeStyle = "#0F2A43";

  const startDraw = (evt) => {
    dibujando = true;
    firmaDibujada = true;
    const { x, y } = getCanvasPos(canvas, evt);
    canvasCtx.beginPath();
    canvasCtx.moveTo(x, y);
  };
  const draw = (evt) => {
    if (!dibujando) return;
    const { x, y } = getCanvasPos(canvas, evt);
    canvasCtx.lineTo(x, y);
    canvasCtx.stroke();
  };
  const stopDraw = () => { dibujando = false; };

  canvas.addEventListener("pointerdown", startDraw);
  canvas.addEventListener("pointermove", draw);
  canvas.addEventListener("pointerup", stopDraw);
  canvas.addEventListener("pointerleave", stopDraw);

  document.getElementById("btn-clear-firma")?.addEventListener("click", () => {
    limpiarCanvas();
    firmaDibujada = false;
  });
}

function limpiarCanvas() {
  const canvas = document.getElementById("tecnico-firma-canvas");
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
}

/** Dibuja una firma existente (URL) sobre el canvas, p. ej. al editar. */
function cargarFirmaEnCanvas(url) {
  const canvas = document.getElementById("tecnico-firma-canvas");
  limpiarCanvas();
  if (!url) { firmaDibujada = false; return; }

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    canvasCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
    firmaDibujada = true; // se considera "presente" aunque no haya sido redibujada
  };
  img.src = url;
}

function canvasEstaVacio() {
  const canvas = document.getElementById("tecnico-firma-canvas");
  const blank = document.createElement("canvas");
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

/** Convierte el contenido actual del canvas a Blob PNG. */
function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/* ----- Modal Agregar/Editar técnico ----- */
function abrirModalTecnico(tecnico = null) {
  const form = document.getElementById("form-tecnico");
  form.reset();
  limpiarCanvas();
  firmaDibujada = false;

  document.getElementById("modal-tecnico-title").textContent =
    tecnico ? "Editar técnico" : "Agregar técnico";
  document.getElementById("tecnico-doc-id").value = tecnico?.id || "";
  document.getElementById("tecnico-nombre").value = tecnico?.nombre || "";
  document.getElementById("tecnico-cargo").value = tecnico?.cargo || "";

  if (tecnico?.firmaURL) cargarFirmaEnCanvas(tecnico.firmaURL);

  openModal("modal-tecnico");
}

async function guardarTecnico(e) {
  e.preventDefault();

  const idExistente = document.getElementById("tecnico-doc-id").value;
  const nombre = document.getElementById("tecnico-nombre").value.trim();
  const cargo = document.getElementById("tecnico-cargo").value.trim();
  const canvas = document.getElementById("tecnico-firma-canvas");

  if (!nombre || !cargo) return toast("Nombre y cargo son obligatorios.", "error");
  if (canvasEstaVacio()) return toast("La firma es obligatoria.", "error");

  const submitBtn = e.target.closest("form").parentElement
    .querySelector('[form="form-tecnico"]') || document.querySelector('button[form="form-tecnico"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    // Determina/crea el ID del documento primero, para poder nombrar
    // el archivo de la firma en Storage de forma consistente.
    const refDoc = idExistente
      ? doc(db, COLLECTIONS.TECNICOS, idExistente)
      : doc(collection(db, COLLECTIONS.TECNICOS));

    const blob = await canvasToBlob(canvas);
    const firmaRef = storageRef(storage, `${APP_CONFIG.storagePathFirmas}/${refDoc.id}.png`);
    await uploadBytes(firmaRef, blob);
    const firmaURL = await getDownloadURL(firmaRef);

    const payload = {
      nombre,
      cargo,
      firmaURL,
      actualizadoEn: serverTimestamp()
    };

    if (idExistente) {
      await updateDoc(refDoc, payload);
      toast("Técnico actualizado.", "success");
    } else {
      payload.creadoEn = serverTimestamp();
      await setDoc(refDoc, payload);
      toast("Técnico agregado.", "success");
    }

    closeModal("modal-tecnico");
  } catch (err) {
    console.error("Error al guardar técnico:", err);
    toast("No se pudo guardar el técnico.", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function eliminarTecnico(tecnico) {
  try {
    await deleteDoc(doc(db, COLLECTIONS.TECNICOS, tecnico.id));
    if (tecnico.firmaURL) {
      try {
        await deleteObject(storageRef(storage, `${APP_CONFIG.storagePathFirmas}/${tecnico.id}.png`));
      } catch (e) {
        console.warn("No se pudo eliminar el archivo de firma:", e);
      }
    }
    toast("Técnico eliminado.", "success");
  } catch (err) {
    console.error("Error al eliminar técnico:", err);
    throw err; // permite que confirmAction muestre el toast de error genérico
  }
}

function initTecnicosTab() {
  initFirmaCanvas();
  initTecnicosRealtime();
  initTecnicosSearch();

  document.getElementById("btn-add-tecnico")?.addEventListener("click", () => abrirModalTecnico());
  document.getElementById("form-tecnico")?.addEventListener("submit", guardarTecnico);

  document.getElementById("tecnicos-tbody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const tecnico = tecnicosCache.find((t) => t.id === btn.dataset.id);
    if (!tecnico) return;

    if (btn.dataset.action === "edit") {
      abrirModalTecnico(tecnico);
    } else if (btn.dataset.action === "delete") {
      confirmAction({
        title: "Eliminar técnico",
        message: `¿Eliminar a "${tecnico.nombre}"? Esta acción no se puede deshacer.`,
        confirmLabel: "Eliminar",
        onConfirm: () => eliminarTecnico(tecnico)
      });
    }
  });
}

/* ---------- Init general del módulo Configuración ---------- */
function initConfiguracionModule() {
  initConfiguracionTabs();
  initLogoTab();
  initTecnicosTab();
}

/* ============================================================
   ARRANQUE TEMPORAL (solo para probar esta parte de forma aislada)
   Cuando se agregue el router de módulos y la autenticación
   (próximas partes), esta llamada se reemplazará por el flujo
   real: login -> onAuthStateChanged -> mostrar #app -> initApp().
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  refreshIcons();
  initConfiguracionModule();
});
