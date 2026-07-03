// ==========================================================================
// MÓDULO: AUTENTICACIÓN
// Maneja login, logout, persistencia de sesión y detección de rol.
// Depende de: firebase-config.js (variables auth, ADMIN_EMAIL)
// ==========================================================================

let usuarioActual = null;
let rolActual = null; // "admin" | "tecnico"

auth.onAuthStateChanged((user) => {
  if (user) {
    usuarioActual = user;
    rolActual = (user.email === ADMIN_EMAIL) ? "admin" : "tecnico";
    mostrarAppPrincipal();
  } else {
    mostrarPantallaLogin();
  }
  ocultarPantallaCarga();
});

document.getElementById("formLogin").addEventListener("submit", function (e) {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const mantener = document.getElementById("mantenerSesion").checked;

  const persistencia = mantener
    ? firebase.auth.Auth.Persistence.LOCAL
    : firebase.auth.Auth.Persistence.SESSION;

  auth.setPersistence(persistencia)
    .then(() => auth.signInWithEmailAndPassword(email, password))
    .catch((error) => {
      let msg = "No se pudo iniciar sesión. Intenta de nuevo.";
      if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") msg = "Correo o contraseña incorrectos.";
      if (error.code === "auth/invalid-email") msg = "Correo electrónico inválido.";
      if (error.code === "auth/too-many-requests") msg = "Demasiados intentos. Espera unos minutos.";
      mostrarErrorLogin(msg);
    });
});

function cerrarSesion() {
  if (!confirm("¿Deseas cerrar sesión?")) return;
  auth.signOut().then(() => {
    usuarioActual = null;
    rolActual = null;
  });
}

function mostrarErrorLogin(msg) {
  const el = document.getElementById("errorLogin");
  el.textContent = msg;
  el.classList.add("mostrar");
  setTimeout(() => el.classList.remove("mostrar"), 5000);
}

function ocultarPantallaCarga() {
  const el = document.getElementById("pantalla-cargando");
  el.style.opacity = "0";
  setTimeout(() => (el.style.display = "none"), 350);
}

function mostrarPantallaLogin() {
  document.getElementById("pantalla-login").classList.add("mostrar");
  document.getElementById("app-principal").style.display = "none";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
}

function mostrarAppPrincipal() {
  document.getElementById("pantalla-login").classList.remove("mostrar");
  document.getElementById("app-principal").style.display = "block";
  document.getElementById("chipCorreo").textContent = usuarioActual.email;
  document.getElementById("chipRol").textContent = rolActual === "admin" ? "Administrador" : "Técnico";

  renderMenu();
  renderGridModulos();
  renderTabsConfig();
  mostrarVista("vista-inicio");
}
