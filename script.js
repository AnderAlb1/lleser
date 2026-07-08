/* ============================================================================
   LleSer Ltda. — Sistema de gestión de mantenimientos
   script.js  (Parte 1 de varias)
   ----------------------------------------------------------------------------
   Usa el SDK "compat" de Firebase. Las variables auth, db, storage,
   COLLECTIONS, ROLES, onAuthChange, login, logout, getUserProfile y
   createUserWithRole vienen de config.js (se carga antes que este archivo
   en index.html y comparten el mismo ámbito global del documento).

   Contenido de esta parte:
     0. Helpers genéricos (DOM, toasts, modales, tabs)
     1. Sidebar / topbar / navegación entre módulos
     2. Autenticación (login, logout, estado de sesión, roles)
     3. Módulo de Configuración: Logo, Técnicos (firma), Usuarios (roles)

   Falta para partes siguientes: Equipos, Órdenes de trabajo, Reportes de
   OT, Reportes correctivos, generación de PDF, importación de Excel,
   buscador global y paginación de tablas grandes.
   ============================================================================ */

console.log("[LleSer] script.js cargado, esperando estado de autenticación…");

/* ============================================================================
   0. HELPERS GENÉRICOS
   ============================================================================ */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

const LAST_MODULE_KEY = "lleser_current_module";

/* ---------------- Toasts ---------------- */
function showToast(message, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = { success: "check-circle", error: "alert-circle", warning: "alert-triangle", info: "info" }[type];
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  refreshIcons();
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

/* ---------------- Modales genéricos ---------------- */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
}
$$("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
$$(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
});

let pendingConfirmAction = null;
function openConfirm(message, onConfirm, { title = "¿Confirmar acción?", confirmLabel = "Eliminar" } = {}) {
  $("#modal-confirm-title").textContent = title;
  $("#modal-confirm-message").textContent = message;
  $("#btn-confirm-action").textContent = confirmLabel;
  pendingConfirmAction = onConfirm;
  openModal("modal-confirm");
}
$("#btn-confirm-action").addEventListener("click", async () => {
  if (typeof pendingConfirmAction === "function") {
    await pendingConfirmAction();
  }
  pendingConfirmAction = null;
  closeModal("modal-confirm");
});

/* ---------------- Tabs genéricas ---------------- */
function initTabs() {
  $$(".tabs").forEach((tabsEl) => {
    const section = tabsEl.closest("section") || document;
    $$(".tab", tabsEl).forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const target = tabBtn.dataset.tab;

        $$(".tab", tabsEl).forEach((t) => {
          t.classList.toggle("is-active", t === tabBtn);
          t.setAttribute("aria-selected", t === tabBtn ? "true" : "false");
        });

        $$(".tab-panel", section).forEach((panel) => {
          const isTarget = panel.id === `tab-${target}`;
          panel.classList.toggle("is-active", isTarget);
          panel.hidden = !isTarget;
        });
      });
    });
  });
}

/* ============================================================================
   1. SIDEBAR / TOPBAR / NAVEGACIÓN ENTRE MÓDULOS
   ============================================================================ */

function openSidebar() {
  $("#sidebar").classList.add("is-open");
  $("#sidebar-overlay").hidden = false;
  $("#hamburger-btn").setAttribute("aria-expanded", "true");
}
function closeSidebar() {
  $("#sidebar").classList.remove("is-open");
  $("#sidebar-overlay").hidden = true;
  $("#hamburger-btn").setAttribute("aria-expanded", "false");
}
$("#hamburger-btn").addEventListener("click", openSidebar);
$("#sidebar-close").addEventListener("click", closeSidebar);
$("#sidebar-overlay").addEventListener("click", closeSidebar);

function goToModule(moduleName) {
  const targetNav = $(`.nav-item[data-module="${moduleName}"]`);
  const targetView = $(`#module-${moduleName}`);
  if (!targetNav || !targetView) return;

  const li = targetNav.closest("li");
  if (li && li.hidden) return;

  $$(".nav-item").forEach((btn) => btn.classList.toggle("is-active", btn === targetNav));
  $$(".module-view").forEach((view) => view.classList.toggle("is-active", view === targetView));

  $("#topbar-title").textContent = targetNav.querySelector("span").textContent;
  localStorage.setItem(LAST_MODULE_KEY, moduleName);
  closeSidebar();
}

$$(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => goToModule(btn.dataset.module));
});

/* ============================================================================
   2. AUTENTICACIÓN
   ============================================================================ */

let currentUser = null;
let currentProfile = null;

function applyRoleVisibility(rol) {
  $$("[data-role-visibility]").forEach((el) => {
    const allowed = el.dataset.roleVisibility.split(",").map((r) => r.trim());
    el.hidden = !allowed.includes(rol);
  });
}

function fillSidebarUser(profile) {
  $("#sidebar-user-name").textContent = profile.nombre || profile.correo;
  $("#sidebar-user-role").textContent = profile.rol === ROLES.ADMIN ? "Administrador" : "Técnico";
  $("#sidebar-user-avatar").textContent = (profile.nombre || profile.correo || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  $("#topbar-role-badge").textContent = profile.rol === ROLES.ADMIN ? "ADMINISTRADOR" : "TÉCNICO";
}

async function showApp() {
  $("#loading-screen").hidden = true;
  $("#login-screen").hidden = true;
  $("#app").hidden = false;

  applyRoleVisibility(currentProfile.rol);
  fillSidebarUser(currentProfile);

  const savedModule = localStorage.getItem(LAST_MODULE_KEY);
  const savedNav = savedModule && $(`.nav-item[data-module="${savedModule}"]`);
  const savedAllowed = savedNav && !savedNav.closest("li").hidden;
  goToModule(savedAllowed ? savedModule : "dashboard");

  if (currentProfile.rol === ROLES.ADMIN) {
    initConfiguracionModule();
  }
}

function showLogin() {
  $("#loading-screen").hidden = true;
  $("#app").hidden = true;
  $("#login-screen").hidden = false;
}

onAuthChange(async (user) => {
  console.log("[LleSer] onAuthChange disparado. Usuario:", user);
  currentUser = user;

  if (!user) {
    currentProfile = null;
    showLogin();
    return;
  }

  try {
    console.log("[LleSer] Buscando perfil en Firestore para uid:", user.uid);
    const profile = await getUserProfile(user.uid);
    console.log("[LleSer] Perfil obtenido:", profile);
    if (!profile) {
      showToast("Tu cuenta no tiene un rol asignado. Contacta a un administrador.", "error");
      await logout();
      return;
    }
    if (profile.activo === false) {
      showToast("Tu cuenta está inactiva. Contacta a un administrador.", "error");
      await logout();
      return;
    }
    currentProfile = profile;
    await showApp();
  } catch (err) {
    console.error(err);
    showToast("No se pudo cargar tu perfil. Intenta de nuevo.", "error");
    showLogin();
  }
});

/* ---------------- Formulario de login ---------------- */

const LOGIN_ERROR_MESSAGES = {
  "auth/invalid-email": "El correo no es válido.",
  "auth/user-disabled": "Esta cuenta está deshabilitada.",
  "auth/user-not-found": "No existe una cuenta con ese correo.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Intenta de nuevo más tarde.",
};

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  const errorBox = $("#login-error");
  const submitBtn = $("#login-submit");

  errorBox.hidden = true;
  submitBtn.disabled = true;
  $(".btn-label", submitBtn).hidden = true;
  $(".btn-spinner", submitBtn).hidden = false;

  try {
    await login(email, password);
  } catch (err) {
    errorBox.textContent = LOGIN_ERROR_MESSAGES[err.code] || "No se pudo iniciar sesión. Intenta de nuevo.";
    errorBox.hidden = false;
  } finally {
    submitBtn.disabled = false;
    $(".btn-label", submitBtn).hidden = false;
    $(".btn-spinner", submitBtn).hidden = true;
  }
});

$("#toggle-password").addEventListener("click", () => {
  const input = $("#login-password");
  const icon = $("#toggle-password i");
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  icon.setAttribute("data-lucide", isHidden ? "eye-off" : "eye");
  refreshIcons();
});

$("#logout-btn").addEventListener("click", async () => {
  await logout();
  localStorage.removeItem(LAST_MODULE_KEY);
});

/* ============================================================================
   3. MÓDULO DE CONFIGURACIÓN
   ============================================================================ */

let configuracionInitialized = false;

function initConfiguracionModule() {
  if (configuracionInitialized) return;
  configuracionInitialized = true;

  initLogoTab();
  initTecnicosTab();
  initUsuariosTab();
}

/* ----------------------------------------------------------------------
   3.1 LOGO DE LA EMPRESA
   Storage: configuracion/logo.<ext> — Firestore: configuracion/general.logoUrl
---------------------------------------------------------------------- */
const CONFIG_DOC_ID = "general";

function initLogoTab() {
  const preview = $("#logo-preview");
  const fileInput = $("#logo-file-input");

  async function loadLogo() {
    const snap = await db.collection(COLLECTIONS.CONFIGURACION).doc(CONFIG_DOC_ID).get();
    const logoUrl = snap.exists ? snap.data().logoUrl : null;
    renderLogoPreview(logoUrl);
  }

  function renderLogoPreview(url) {
    if (url) {
      preview.innerHTML = `<img src="${url}" alt="Logo de LleSer Ltda.">`;
    } else {
      preview.innerHTML = `<i data-lucide="image"></i><span>Sin logo cargado</span>`;
      refreshIcons();
    }
  }

  $("#btn-upload-logo").addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) {
      showToast("El logo debe ser PNG, JPG o SVG.", "error");
      return;
    }

    try {
      const ext = file.name.split(".").pop();
      const ref = storage.ref(`configuracion/logo.${ext}`);
      await ref.put(file);
      const url = await ref.getDownloadURL();

      await db.collection(COLLECTIONS.CONFIGURACION).doc(CONFIG_DOC_ID).set({ logoUrl: url }, { merge: true });
      renderLogoPreview(url);
      showToast("Logo actualizado correctamente.", "success");
    } catch (err) {
      console.error(err);
      showToast("No se pudo cargar el logo.", "error");
    } finally {
      fileInput.value = "";
    }
  });

  $("#btn-remove-logo").addEventListener("click", () => {
    openConfirm(
      "¿Quitar el logo de la empresa? Los próximos reportes en PDF se generarán sin logo.",
      async () => {
        try {
          const snap = await db.collection(COLLECTIONS.CONFIGURACION).doc(CONFIG_DOC_ID).get();
          const logoUrl = snap.exists ? snap.data().logoUrl : null;
          if (logoUrl) {
            const path = decodeURIComponent(new URL(logoUrl).pathname.split("/o/")[1].split("?")[0]);
            await storage.ref(path).delete().catch(() => {});
          }
          await db.collection(COLLECTIONS.CONFIGURACION).doc(CONFIG_DOC_ID).set({ logoUrl: null }, { merge: true });
          renderLogoPreview(null);
          showToast("Logo eliminado.", "success");
        } catch (err) {
          console.error(err);
          showToast("No se pudo quitar el logo.", "error");
        }
      },
      { title: "Quitar logo", confirmLabel: "Quitar" }
    );
  });

  loadLogo();
}

/* ----------------------------------------------------------------------
   3.2 TÉCNICOS (ficha: nombre, cargo, firma en canvas → dataURL)
---------------------------------------------------------------------- */
let tecnicosCache = [];
let signaturePad = null;

function initTecnicosTab() {
  const tbody = $("#tecnicos-tbody");
  const empty = $("#tecnicos-empty");
  const search = $("#tecnicos-search");

  db.collection(COLLECTIONS.TECNICOS).orderBy("nombre").onSnapshot((snap) => {
    tecnicosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTecnicos(search.value);
  });

  function renderTecnicos(filterText = "") {
    const filtered = tecnicosCache.filter((t) => {
      const haystack = `${t.nombre} ${t.cargo}`.toLowerCase();
      return haystack.includes(filterText.trim().toLowerCase());
    });

    tbody.innerHTML = filtered
      .map(
        (t) => `
      <tr data-id="${t.id}">
        <td>${escapeHtml(t.nombre)}</td>
        <td>${escapeHtml(t.cargo)}</td>
        <td>${t.firmaDataUrl ? `<img class="signature-thumb" src="${t.firmaDataUrl}" alt="Firma de ${escapeHtml(t.nombre)}">` : "—"}</td>
        <td class="col-actions">
          <span class="row-actions">
            <button class="icon-btn" data-action="edit" aria-label="Editar"><i data-lucide="pencil"></i></button>
            <button class="icon-btn" data-action="delete" aria-label="Eliminar"><i data-lucide="trash-2"></i></button>
          </span>
        </td>
      </tr>`
      )
      .join("");

    empty.hidden = filtered.length > 0;
    refreshIcons();
  }

  search.addEventListener("input", () => renderTecnicos(search.value));

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const row = btn.closest("tr");
    const tecnico = tecnicosCache.find((t) => t.id === row.dataset.id);

    if (btn.dataset.action === "edit") openTecnicoModal(tecnico);
    if (btn.dataset.action === "delete") {
      openConfirm(`¿Eliminar al técnico "${tecnico.nombre}"? Esta acción no se puede deshacer.`, async () => {
        await db.collection(COLLECTIONS.TECNICOS).doc(tecnico.id).delete();
        showToast("Técnico eliminado.", "success");
      });
    }
  });

  $("#btn-add-tecnico").addEventListener("click", () => openTecnicoModal(null));

  initSignaturePad();

  $("#form-tecnico").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#tecnico-doc-id").value;
    const nombre = $("#tecnico-nombre").value.trim();
    const cargo = $("#tecnico-cargo").value.trim();

    if (!nombre || !cargo) {
      showToast("Nombre y cargo son obligatorios.", "error");
      return;
    }
    if (!signaturePad.hasStroke && !id) {
      showToast("La firma es obligatoria.", "error");
      return;
    }

    const data = { nombre, cargo };
    if (signaturePad.hasStroke) {
      data.firmaDataUrl = signaturePad.canvas.toDataURL("image/png");
    }

    try {
      if (id) {
        await db.collection(COLLECTIONS.TECNICOS).doc(id).update(data);
        showToast("Técnico actualizado.", "success");
      } else {
        data.firmaDataUrl = data.firmaDataUrl || null;
        data.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection(COLLECTIONS.TECNICOS).add(data);
        showToast("Técnico agregado.", "success");
      }
      closeModal("modal-tecnico");
    } catch (err) {
      console.error(err);
      showToast("No se pudo guardar el técnico.", "error");
    }
  });
}

function openTecnicoModal(tecnico) {
  $("#form-tecnico").reset();
  $("#tecnico-doc-id").value = tecnico?.id || "";
  $("#tecnico-nombre").value = tecnico?.nombre || "";
  $("#tecnico-cargo").value = tecnico?.cargo || "";
  $("#modal-tecnico-title").textContent = tecnico ? "Editar técnico" : "Agregar técnico";

  clearSignaturePad();
  if (tecnico?.firmaDataUrl) {
    drawImageOnSignaturePad(tecnico.firmaDataUrl);
    signaturePad.hasStroke = false;
  }

  openModal("modal-tecnico");
}

function initSignaturePad() {
  const canvas = $("#tecnico-firma-canvas");
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#0F2A43";

  signaturePad = { canvas, ctx, drawing: false, hasStroke: false };

  function getPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    return {
      x: ((point.clientX - rect.left) / rect.width) * canvas.width,
      y: ((point.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(evt) {
    evt.preventDefault();
    signaturePad.drawing = true;
    signaturePad.hasStroke = true;
    const { x, y } = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(evt) {
    if (!signaturePad.drawing) return;
    evt.preventDefault();
    const { x, y } = getPos(evt);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  function end() {
    signaturePad.drawing = false;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  $("#btn-clear-firma").addEventListener("click", clearSignaturePad);
}

function clearSignaturePad() {
  const { canvas, ctx } = signaturePad;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signaturePad.hasStroke = false;
}

function drawImageOnSignaturePad(dataUrl) {
  const { canvas, ctx } = signaturePad;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = dataUrl;
}

/* ----------------------------------------------------------------------
   3.3 USUARIOS (cuentas de acceso + rol) — solo administradores
---------------------------------------------------------------------- */
let usuariosCache = [];

function initUsuariosTab() {
  const tbody = $("#usuarios-tbody");
  const empty = $("#usuarios-empty");
  const search = $("#usuarios-search");

  db.collection(COLLECTIONS.USUARIOS).orderBy("nombre").onSnapshot((snap) => {
    usuariosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderUsuarios(search.value);
  });

  function renderUsuarios(filterText = "") {
    const filtered = usuariosCache.filter((u) => {
      const haystack = `${u.nombre} ${u.correo}`.toLowerCase();
      return haystack.includes(filterText.trim().toLowerCase());
    });

    tbody.innerHTML = filtered
      .map(
        (u) => `
      <tr data-id="${u.id}">
        <td>${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(u.correo)}</td>
        <td>${u.rol === ROLES.ADMIN ? "Administrador" : "Técnico"}</td>
        <td><span class="status-tag ${u.activo === false ? "status-fuera-servicio" : "status-operativo"}">${u.activo === false ? "Inactivo" : "Activo"}</span></td>
        <td class="col-actions">
          <span class="row-actions">
            <button class="icon-btn" data-action="edit" aria-label="Editar"><i data-lucide="pencil"></i></button>
          </span>
        </td>
      </tr>`
      )
      .join("");

    empty.hidden = filtered.length > 0;
    refreshIcons();
  }

  search.addEventListener("input", () => renderUsuarios(search.value));

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action='edit']");
    if (!btn) return;
    const row = btn.closest("tr");
    const usuario = usuariosCache.find((u) => u.id === row.dataset.id);
    openUsuarioModal(usuario);
  });

  $("#btn-add-usuario").addEventListener("click", () => openUsuarioModal(null));

  $("#form-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#usuario-doc-id").value;
    const nombre = $("#usuario-nombre").value.trim();
    const correo = $("#usuario-correo").value.trim();
    const password = $("#usuario-password").value;
    const rol = $("#usuario-rol").value;
    const activo = $("#usuario-activo").value === "true";

    if (!nombre || !correo) {
      showToast("Nombre y correo son obligatorios.", "error");
      return;
    }

    try {
      if (id) {
        if (id === currentUser.uid && !activo) {
          showToast("No puedes desactivar tu propia cuenta.", "error");
          return;
        }
        if (id === currentUser.uid && rol !== ROLES.ADMIN) {
          showToast("No puedes quitarte a ti mismo el rol de administrador.", "error");
          return;
        }
        await db.collection(COLLECTIONS.USUARIOS).doc(id).update({ nombre, rol, activo });
        showToast("Usuario actualizado.", "success");
      } else {
        if (!password || password.length < 6) {
          showToast("La contraseña debe tener al menos 6 caracteres.", "error");
          return;
        }
        await createUserWithRole({ nombre, correo, password, rol });
        showToast("Usuario creado correctamente.", "success");
      }
      closeModal("modal-usuario");
    } catch (err) {
      console.error(err);
      const msg = err.code === "auth/email-already-in-use"
        ? "Ya existe una cuenta con ese correo."
        : "No se pudo guardar el usuario.";
      showToast(msg, "error");
    }
  });
}

function openUsuarioModal(usuario) {
  $("#form-usuario").reset();
  $("#usuario-doc-id").value = usuario?.id || "";
  $("#usuario-nombre").value = usuario?.nombre || "";
  $("#usuario-correo").value = usuario?.correo || "";
  $("#usuario-rol").value = usuario?.rol || ROLES.TECNICO;
  $("#usuario-activo").value = usuario?.activo === false ? "false" : "true";

  $("#usuario-correo").disabled = Boolean(usuario);
  $("#usuario-password-field").hidden = Boolean(usuario);
  $("#usuario-password").required = !usuario;

  $("#modal-usuario-title").textContent = usuario ? "Editar usuario" : "Crear usuario";
  openModal("modal-usuario");
}

/* ============================================================================
   UTILIDADES VARIAS
   ============================================================================ */
function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ============================================================================
   ARRANQUE
   ============================================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  refreshIcons();
});
