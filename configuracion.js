// ==========================================================================
// MÓDULO: CONFIGURACIÓN
// Tabs de configuración (por rol) y cambio de contraseña.
// Depende de: auth.js (usuarioActual, rolActual), utilidades.js (mostrarToast)
// ==========================================================================

function renderTabsConfig() {
  const tabs = [
    { id: "password", label: "Cambiar contraseña", disabled: false },
    { id: "logo",     label: "Logo de la empresa",  disabled: rolActual !== "admin" },
    { id: "tecnicos", label: "Técnicos",             disabled: rolActual !== "admin" }
  ];
  const cont = document.getElementById("tabsConfig");
  cont.innerHTML = "";
  tabs.forEach((t, i) => {
    const btn = document.createElement("button");
    btn.className = "tab-config" + (i === 0 ? " activa" : "");
    btn.textContent = t.label;
    if (t.disabled) btn.setAttribute("disabled", "disabled");
    btn.onclick = () => mostrarTabConfig(t.id, btn);
    cont.appendChild(btn);
  });
  // Al entrar siempre mostramos la pestaña de contraseña por defecto
  ["password", "logo", "tecnicos"].forEach((sec) => {
    document.getElementById("config-" + sec).classList.toggle("oculto", sec !== "password");
  });
}

function mostrarTabConfig(id, btnEl) {
  document.querySelectorAll(".tab-config").forEach((b) => b.classList.remove("activa"));
  btnEl.classList.add("activa");
  ["password", "logo", "tecnicos"].forEach((sec) => {
    document.getElementById("config-" + sec).classList.toggle("oculto", sec !== id);
  });

  // Carga perezosa: solo pedimos los datos cuando el usuario entra a esa pestaña
  if (id === "logo") cargarLogo();
  if (id === "tecnicos") cargarTecnicos();
}

// ---------- Logo de la empresa ----------
document.getElementById("formLogo").addEventListener("submit", function (e) {
  e.preventDefault();
  const archivo = document.getElementById("logoEmpresa").files[0];
  if (!archivo) {
    mostrarToast("Selecciona una imagen primero", "warning");
    return;
  }

  const lector = new FileReader();
  lector.onload = function (evento) {
    const logoBase64 = evento.target.result;
    db.collection("configuracion").doc("general")
      .set({ logoBase64, actualizado: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .then(() => {
        mostrarToast("Logo guardado correctamente", "success");
        pintarPreviewLogo(logoBase64);
      })
      .catch((error) => mostrarToast("Error al guardar el logo: " + error.message, "error"));
  };
  lector.readAsDataURL(archivo);
});

function cargarLogo() {
  db.collection("configuracion").doc("general").get()
    .then((doc) => {
      if (doc.exists && doc.data().logoBase64) {
        pintarPreviewLogo(doc.data().logoBase64);
      }
    })
    .catch((error) => console.error("Error al cargar el logo:", error));
}

function pintarPreviewLogo(base64) {
  document.getElementById("previewLogo").innerHTML = `<img src="${base64}" alt="Logo de la empresa">`;
}

// ---------- Cambiar contraseña ----------
document.getElementById("formCambiarPassword").addEventListener("submit", function (e) {
  e.preventDefault();

  const actual = document.getElementById("pwActual").value;
  const nueva = document.getElementById("pwNueva").value;
  const confirmar = document.getElementById("pwConfirmar").value;

  if (nueva !== confirmar) {
    mostrarToast("Las contraseñas nuevas no coinciden", "warning");
    return;
  }
  if (nueva.length < 6) {
    mostrarToast("La nueva contraseña debe tener al menos 6 caracteres", "warning");
    return;
  }

  const credencial = firebase.auth.EmailAuthProvider.credential(usuarioActual.email, actual);

  usuarioActual.reauthenticateWithCredential(credencial)
    .then(() => usuarioActual.updatePassword(nueva))
    .then(() => {
      mostrarToast("Contraseña actualizada correctamente", "success");
      document.getElementById("formCambiarPassword").reset();
    })
    .catch((error) => {
      let msg = "No se pudo actualizar la contraseña.";
      if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") msg = "La contraseña actual es incorrecta.";
      if (error.code === "auth/weak-password") msg = "La nueva contraseña es muy débil (mínimo 6 caracteres).";
      mostrarToast(msg, "error");
    });
});
