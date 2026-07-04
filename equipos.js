// ==========================================================================
// MÓDULO: GESTIÓN DE EQUIPOS
// Alta/edición/eliminación de equipos, código consecutivo automático,
// búsqueda en vivo, y pestaña de historial (reportes por equipo).
// Depende de: firebase-config.js (db), utilidades.js (mostrarToast)
// ==========================================================================

let equiposCache = [];
let equiposInicializado = false;

/* --------------------------------------------------------------------
   Se llama cada vez que se entra a la vista de Equipos (ver navegacion.js).
   La bandera evita repetir listeners de tabs cada vez que se reingresa.
   -------------------------------------------------------------------- */
function inicializarModuloEquipos() {
  if (!equiposInicializado) {
    renderTabsEquipos();
    equiposInicializado = true;
  }
  cargarEquipos();
}

// ---------- Tabs internas: Equipos / Historial ----------
function renderTabsEquipos() {
  const tabs = [
    { id: "listado", label: "Equipos" },
    { id: "historial", label: "Historial" }
  ];
  const cont = document.getElementById("tabsEquipos");
  cont.innerHTML = "";
  tabs.forEach((t, i) => {
    const btn = document.createElement("button");
    btn.className = "tab-config" + (i === 0 ? " activa" : "");
    btn.textContent = t.label;
    btn.onclick = () => mostrarTabEquipos(t.id, btn);
    cont.appendChild(btn);
  });
}

function mostrarTabEquipos(id, btnEl) {
  document.querySelectorAll("#tabsEquipos .tab-config").forEach((b) => b.classList.remove("activa"));
  btnEl.classList.add("activa");
  document.getElementById("equipos-listado").classList.toggle("oculto", id !== "listado");
  document.getElementById("equipos-historial").classList.toggle("oculto", id !== "historial");
  if (id === "historial") cargarSelectHistorial();
}

// ---------- Guardar (crear o actualizar) ----------
document.getElementById("formEquipo").addEventListener("submit", function (e) {
  e.preventDefault();

  const id = document.getElementById("equipoId").value;
  const datos = {
    codigo: document.getElementById("equipoCodigo").value.trim().toUpperCase(),
    nombre: document.getElementById("equipoNombre").value.trim().toUpperCase(),
    marca: document.getElementById("equipoMarca").value.trim().toUpperCase(),
    modelo: document.getElementById("equipoModelo").value.trim().toUpperCase(),
    serie: document.getElementById("equipoSerie").value.trim().toUpperCase(),
    ubicacion: document.getElementById("equipoUbicacion").value.trim().toUpperCase()
  };

  const operacion = id
    ? db.collection("equipos").doc(id).update(datos)
    : db.collection("equipos").add({ ...datos, fechaCreacion: firebase.firestore.FieldValue.serverTimestamp() });

  operacion
    .then(() => {
      mostrarToast(id ? "Equipo actualizado" : "Equipo agregado", "success");
      cancelarEdicionEquipo();
      cargarEquipos();
    })
    .catch((error) => mostrarToast("Error al guardar: " + error.message, "error"));
});

// ---------- Listar ----------
function cargarEquipos() {
  db.collection("equipos").orderBy("codigo").get()
    .then((snapshot) => {
      equiposCache = [];
      snapshot.forEach((doc) => equiposCache.push({ id: doc.id, ...doc.data() }));
      pintarEquipos(equiposCache);
    })
    .catch((error) => console.error("Error al cargar equipos:", error));
}

function pintarEquipos(lista) {
  const cont = document.getElementById("listaEquipos");
  document.getElementById("contadorEquipos").textContent = lista.length;
  cont.innerHTML = "";

  if (lista.length === 0) {
    cont.innerHTML = `<div class="texto-vacio">No hay equipos que coincidan.</div>`;
    return;
  }

  lista.forEach((eq) => {
    const fila = document.createElement("div");
    fila.className = "item-fila";
    fila.innerHTML = `
      <div class="info">
        <span class="codigo-mono">${eq.codigo}</span>
        <h4>${eq.nombre}</h4>
        <p>${eq.marca} ${eq.modelo} · Serie ${eq.serie}</p>
        <p>${eq.ubicacion}</p>
      </div>
      <div class="acciones">
        <button onclick="editarEquipo('${eq.id}')" title="Editar">✏️</button>
        <button class="eliminar" onclick="eliminarEquipo('${eq.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    cont.appendChild(fila);
  });
}

// ---------- Búsqueda en vivo ----------
function buscarEquipos(texto) {
  const q = texto.toLowerCase().trim();
  if (!q) { pintarEquipos(equiposCache); return; }

  const filtrados = equiposCache.filter((eq) =>
    [eq.codigo, eq.nombre, eq.marca, eq.modelo, eq.serie, eq.ubicacion]
      .some((campo) => (campo || "").toLowerCase().includes(q))
  );
  pintarEquipos(filtrados);
}

// ---------- Editar ----------
function editarEquipo(id) {
  const eq = equiposCache.find((x) => x.id === id);
  if (!eq) return;

  document.getElementById("equipoId").value = eq.id;
  document.getElementById("equipoCodigo").value = eq.codigo;
  document.getElementById("equipoNombre").value = eq.nombre;
  document.getElementById("equipoMarca").value = eq.marca;
  document.getElementById("equipoModelo").value = eq.modelo;
  document.getElementById("equipoSerie").value = eq.serie;
  document.getElementById("equipoUbicacion").value = eq.ubicacion;

  document.getElementById("tituloFormEquipo").textContent = "Editar equipo";
  document.getElementById("btnGuardarEquipo").textContent = "Actualizar equipo";
  document.getElementById("btnCancelarEdicionEquipo").classList.remove("oculto");

  document.getElementById("formEquipo").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarEdicionEquipo() {
  document.getElementById("formEquipo").reset();
  document.getElementById("equipoId").value = "";
  document.getElementById("equipoCodigo").value = "";
  document.getElementById("tituloFormEquipo").textContent = "Nuevo equipo";
  document.getElementById("btnGuardarEquipo").textContent = "Agregar equipo";
  document.getElementById("btnCancelarEdicionEquipo").classList.add("oculto");
}

// ---------- Eliminar ----------
function eliminarEquipo(id) {
  if (!confirm("¿Eliminar este equipo? Esta acción no se puede deshacer.")) return;
  db.collection("equipos").doc(id).delete()
    .then(() => {
      mostrarToast("Equipo eliminado", "success");
      cargarEquipos();
    })
    .catch((error) => mostrarToast("Error al eliminar: " + error.message, "error"));
}

// ==========================================================================
// SUB-MÓDULO: HISTORIAL POR EQUIPO
// Lee la colección "reportes" (aún no existe hasta construir el módulo de
// Generar Reporte, pero la consulta ya queda lista para cuando exista).
// ==========================================================================
function cargarSelectHistorial() {
  const select = document.getElementById("historialEquipoSelect");
  select.innerHTML = `<option value="">-- Selecciona un equipo --</option>`;
  equiposCache.forEach((eq) => {
    const opt = document.createElement("option");
    opt.value = eq.id;
    opt.textContent = `${eq.codigo} · ${eq.nombre}`;
    select.appendChild(opt);
  });
}

function cargarHistorialEquipo(equipoId) {
  const cont = document.getElementById("listaHistorialEquipo");
  if (!equipoId) {
    cont.innerHTML = `<div class="aviso-proximo">Selecciona un equipo para ver su historial de reportes.</div>`;
    return;
  }

  cont.innerHTML = `<div class="texto-vacio">Cargando...</div>`;

  db.collection("reportes")
    .where("equipoId", "==", equipoId)
    .orderBy("fecha", "desc")
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        cont.innerHTML = `<div class="texto-vacio">Este equipo aún no tiene reportes registrados.</div>`;
        return;
      }
      cont.innerHTML = "";
      snapshot.forEach((doc) => {
        const r = doc.data();
        const fila = document.createElement("div");
        fila.className = "item-fila";
        fila.innerHTML = `
          <div class="info">
            <h4>${r.tipoMantenimiento || "Reporte"} — ${r.fecha || ""}</h4>
            <p>${r.actividad || ""}</p>
          </div>
        `;
        cont.appendChild(fila);
      });
    })
    .catch((error) => {
      // Si la colección "reportes" todavía no existe, Firestore igual
      // devuelve una consulta vacía, así que este catch cubre otros errores.
      cont.innerHTML = `<div class="texto-vacio">Este equipo aún no tiene reportes registrados.</div>`;
      console.error("Error al cargar historial:", error);
    });
}
