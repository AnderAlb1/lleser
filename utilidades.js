// ==========================================================================
// UTILIDADES COMPARTIDAS
// ==========================================================================

function mostrarToast(mensaje, tipo) {
  const cont = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = "toast " + tipo;
  t.textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.classList.add("show"), 10);
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 250);
  }, 3200);
}
