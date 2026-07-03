// ==========================================================================
// MÓDULO: NAVEGACIÓN
// Sidebar, menú filtrado por rol, grid de módulos en la vista de inicio.
// Depende de: auth.js (rolActual)
// ==========================================================================

// Catálogo de módulos del sistema. Cuando un módulo quede listo,
// solo hay que cambiar "listo:true" y ya se activa en el menú y el grid.
const MODULOS = [
  { id: "equipos",       icono: "01", nombre: "Gestión de Equipos", codigo: "MOD-EQP", desc: "Alta, edición e historial de equipos.",              roles: ["admin"],           listo: false, vista: "vista-equipos" },
  { id: "ordenes",       icono: "02", nombre: "Orden de Trabajo",   codigo: "MOD-OT",  desc: "Programación de mantenimientos y actividades.",       roles: ["admin"],           listo: false, vista: "vista-ordenes" },
  { id: "reportes",      icono: "03", nombre: "Generar Reporte",    codigo: "MOD-REP", desc: "Formulario de servicio técnico y generación de PDF.", roles: ["tecnico"],         listo: false, vista: "vista-reportes" },
  { id: "configuracion", icono: "04", nombre: "Configuración",      codigo: "MOD-CFG", desc: "Logo, técnicos, usuarios y seguridad de la cuenta.",  roles: ["admin", "tecnico"], listo: true,  vista: "vista-configuracion" }
];

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("activo");
  document.getElementById("overlay").classList.toggle("activo");
}

function renderMenu() {
  const cont = document.getElementById("menuItems");
  cont.innerHTML = "";

  const inicio = document.createElement("div");
  inicio.className = "item-menu";
  inicio.innerHTML = `<span class="icono">•</span> Inicio`;
  inicio.onclick = () => { mostrarVista("vista-inicio"); toggleSidebar(); };
  cont.appendChild(inicio);

  MODULOS.filter((m) => m.roles.includes(rolActual)).forEach((m) => {
    const item = document.createElement("div");
    item.className = "item-menu";
    item.innerHTML = `<span class="icono">${m.icono}</span> ${m.nombre} ${!m.listo ? '<span class="badge-proximo">Próximo</span>' : ""}`;
    item.onclick = () => { mostrarVista(m.vista); toggleSidebar(); };
    cont.appendChild(item);
  });
}

function mostrarVista(idVista) {
  document.querySelectorAll("main > section").forEach((s) => s.classList.add("oculto"));
  document.getElementById(idVista).classList.remove("oculto");
}

function renderGridModulos() {
  const grid = document.getElementById("gridModulos");
  grid.innerHTML = "";
  MODULOS.filter((m) => m.roles.includes(rolActual)).forEach((m) => {
    const card = document.createElement("div");
    card.className = "tarjeta-modulo" + (m.listo ? " clicable" : "");
    card.innerHTML = `
      <span class="codigo">${m.codigo}</span>
      <h3>${m.nombre}</h3>
      <p>${m.desc}</p>
      <span class="estado ${m.listo ? "listo" : "proximo"}">${m.listo ? "Disponible" : "Próximamente"}</span>
    `;
    if (m.listo) card.onclick = () => mostrarVista(m.vista);
    grid.appendChild(card);
  });
}
