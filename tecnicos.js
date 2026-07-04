// ==========================================================================
// MÓDULO: TÉCNICOS
// CRUD de perfiles de técnico (nombre, cargo, firma en base64).
// Esto es independiente del login: todos los técnicos comparten la misma
// cuenta de acceso, pero cada uno necesita su propio perfil para que su
// firma quede en los reportes PDF.
// Depende de: firebase-config.js (db), utilidades.js (mostrarToast)
// ==========================================================================

let tecnicosCache = [];

// ---------- Preview de la firma al seleccionar archivo ----------
document.getElementById("tecnicoFirma").addEventListener("change", function (e) {
  const archivo = e.target.files[0];
  const preview = document.getElementById("previewFirmaTecnico");
  if (!archivo) {
    preview.innerHTML = `<span class="preview-vacio">Sin firma cargada</span>`;
    return;
  }
  const lector = new FileReader();
  lector.onload = (evento) => {
    preview.innerHTML = `<img src="${evento.target.result}" alt="Firma">`;
  };
  lector.readAsDataURL(archivo);
});

// ---------- Guardar (crear o actualizar) ----------
document.getElementById("formTecnico").addEventListener("submit", function (e) {
  e.preventDefault();

  const id = document.getElementById("tecnicoId").value;
  const nombre = document.getElementById("tecnicoNombre").value.trim();
  const cargo = document.getElementById("tecnicoCargo").value.trim();
  const archivoFirma = document.getElementById("tecnicoFirma").files[0];

  if (!id && !archivoFirma) {
    mostrarToast("Selecciona la firma del técnico", "warning");
    return;
  }

  function guardarConFirma(firmaBase64) {
    const datos = { nombre, cargo };
    if (firmaBase64) datos.firma = firmaBase64;

    const operacion = id
      ? db.collection("tecnicos").doc(id).update(datos)
      : db.collection("tecnicos").add({ ...datos, fechaCreacion: firebase.firestore.FieldValue.serverTimestamp() });

    operacion
      .then(() => {
        mostrarToast(id ? "Técnico actualizado" : "Técnico agregado", "success");
        cancelarEdicionTecnico();
        cargarTecnicos();
      })
      .catch((error) => mostrarToast("Error al guardar: " + error.message, "error"));
  }

  if (archivoFirma) {
    const lector = new FileReader();
    lector.onload = (evento) => guardarConFirma(evento.target.result);
    lector.readAsDataURL(archivoFirma);
  } else {
    guardarConFirma(null);
  }
});

// ---------- Listar ----------
function cargarTecnicos() {
  db.collection("tecnicos").orderBy("nombre").get()
    .then((snapshot) => {
      tecnicosCache = [];
      snapshot.forEach((doc) => tecnicosCache.push({ id: doc.id, ...doc.data() }));
      pintarTecnicos();
    })
    .catch((error) => console.error("Error al cargar técnicos:", error));
}

function pintarTecnicos() {
  const cont = document.getElementById("listaTecnicos");
  cont.innerHTML = "";

  if (tecnicosCache.length === 0) {
    cont.innerHTML = `<div class="texto-vacio">Aún no hay técnicos registrados.</div>`;
    return;
  }

  tecnicosCache.forEach((t) => {
    const fila = document.createElement("div");
    fila.className = "item-fila";
    fila.innerHTML = `
      <div class="info">
        <h4>${t.nombre}</h4>
        <p>${t.cargo}</p>
        ${t.firma ? `<img class="firma-mini" src="${t.firma}" alt="Firma de ${t.nombre}">` : `<p>Sin firma registrada</p>`}
      </div>
      <div class="acciones">
        <button onclick="editarTecnico('${t.id}')" title="Editar">✏️</button>
        <button class="eliminar" onclick="eliminarTecnico('${t.id}')" title="Eliminar">🗑️</button>
      </div>
    `;
    cont.appendChild(fila);
  });
}

// ---------- Editar ----------
function editarTecnico(id) {
  const t = tecnicosCache.find((x) => x.id === id);
  if (!t) return;

  document.getElementById("tecnicoId").value = t.id;
  document.getElementById("tecnicoNombre").value = t.nombre;
  document.getElementById("tecnicoCargo").value = t.cargo;
  document.getElementById("tecnicoFirma").value = "";
  document.getElementById("previewFirmaTecnico").innerHTML = t.firma
    ? `<img src="${t.firma}" alt="Firma actual">`
    : `<span class="preview-vacio">Sin firma cargada</span>`;

  document.getElementById("tituloFormTecnico").textContent = "Editar técnico";
  document.getElementById("btnGuardarTecnico").textContent = "Actualizar técnico";
  document.getElementById("btnCancelarEdicionTecnico").classList.remove("oculto");

  document.getElementById("formTecnico").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelarEdicionTecnico() {
  document.getElementById("formTecnico").reset();
  document.getElementById("tecnicoId").value = "";
  document.getElementById("previewFirmaTecnico").innerHTML = `<span class="preview-vacio">Sin firma cargada</span>`;
  document.getElementById("tituloFormTecnico").textContent = "Nuevo técnico";
  document.getElementById("btnGuardarTecnico").textContent = "Agregar técnico";
  document.getElementById("btnCancelarEdicionTecnico").classList.add("oculto");
}

// ---------- Eliminar ----------
function eliminarTecnico(id) {
  if (!confirm("¿Eliminar este técnico? Los reportes anteriores no se verán afectados.")) return;
  db.collection("tecnicos").doc(id).delete()
    .then(() => {
      mostrarToast("Técnico eliminado", "success");
      cargarTecnicos();
    })
    .catch((error) => mostrarToast("Error al eliminar: " + error.message, "error"));
}
