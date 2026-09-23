import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* 👇 REEMPLAZAR CON TUS DATOS DE SUPABASE 👇 */
const SUPABASE_URL = "https://bcswujldqkkbtuznpxvb.supabase.co/rest/v1/";
const SUPABASE_KEY = "sb_publishable_BeZ68EJrIPer6aLVUOWXJQ_TgrffS8r";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
/* 👆 =================================== 👆 */

/* ─────────────────────────  Paleta y tipografía  ───────────────────────── */
const C = {
  ink: "#10302E",
  teal: "#1F6F63",
  tealSoft: "#3E9384",
  mint: "#DDEDE7",
  paper: "#F6F8F6",
  line: "#C9D8D2",
  amber: "#B9761A",
  clay: "#9E3629",
  muted: "#5E7370",
};
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Georgia, serif";

const ESPECIALIDADES_INICIALES = [
  "Clínica médica",
  "Cardiología",
  "Pediatría",
  "Traumatología",
  "Ginecología",
  "Oftalmología",
  "Kinesiología",
  "Laboratorio",
];

const DIAS = [
  { n: 1, corto: "Lun", largo: "lunes" },
  { n: 2, corto: "Mar", largo: "martes" },
  { n: 3, corto: "Mié", largo: "miércoles" },
  { n: 4, corto: "Jue", largo: "jueves" },
  { n: 5, corto: "Vie", largo: "viernes" },
  { n: 6, corto: "Sáb", largo: "sábado" },
];

const AGENDA_POR_DEFECTO = {
  dias: [1, 2, 3, 4, 5],
  bloques: [{ desde: "08:00", hasta: "12:00" }],
  duracion: 30,
};

const aMinutos = (h) => {
  const [a, b] = String(h).split(":").map(Number);
  return a * 60 + b;
};
const aHora = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function diaSemana(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const js = new Date(a, m - 1, d).getDay();
  return js === 0 ? 7 : js;
}

function horariosDeAgenda(agenda, fechaISO) {
  const ag = agenda || AGENDA_POR_DEFECTO;
  if (!fechaISO) return [];
  if (!ag.dias.includes(diaSemana(fechaISO))) return [];
  const paso = ag.duracion || 30;
  const salida = [];
  (ag.bloques || []).forEach((b) => {
    for (let m = aMinutos(b.desde); m + paso <= aMinutos(b.hasta); m += paso) salida.push(aHora(m));
  });
  return Array.from(new Set(salida)).sort();
}

function medicosDe(usuarios, especialidad) {
  return Object.entries(usuarios)
    .filter(([, u]) => u.cargo === "medico" && !u.baja)
    .filter(([, u]) => !especialidad || u.especialidad === especialidad)
    .map(([legajo, u]) => ({ legajo, ...u }));
}

function resumenAgenda(ag) {
  const a = ag || AGENDA_POR_DEFECTO;
  if (!a.dias.length || !a.bloques.length) return "Sin días de atención cargados";
  const dias = a.dias.slice().sort().map((n) => (DIAS.find((d) => d.n === n) || {}).corto).join(", ");
  const franjas = a.bloques.map((b) => `${b.desde} a ${b.hasta}`).join(" y ");
  return `${dias} · ${franjas} · turnos de ${a.duracion} min`;
}

/* ─────────────────────────  Roles y permisos  ───────────────────────── */
const CARGOS = {
  medico: "Profesional médico",
  administrativo: "Administrativo",
  admin_general: "Administrador general",
};

function permisos(u) {
  const general = u && u.cargo === "admin_general";
  const mesa = u && u.cargo === "administrativo";
  return {
    profesionales: general,
    administrativos: general,
    pacientes: general || mesa,
    especialidades: general,
    turnos: general || mesa,
    agendas: general || mesa,
    esAdmin: general || mesa,
  };
}

/* ─────────────────────────  Utilidades  ───────────────────────── */
const hoy = () => new Date().toISOString().slice(0, 10);

function fechaLarga(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  return f.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function detectarTipo(valor) {
  const v = String(valor).trim().toUpperCase();
  if (!v) return null;
  if (/[A-Z]/.test(v)) return "staff";
  if (/^\d{7,8}$/.test(v)) return "paciente";
  if (/^\d{1,6}$/.test(v)) return "staff";
  return null;
}

function comprimirImagen(file, maxLado = 1100, calidad = 0.62) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
      img.onload = () => {
        let { width: w, height: h } = img;
        const escala = Math.min(1, maxLado / Math.max(w, h));
        w = Math.round(w * escala);
        h = Math.round(h * escala);
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL("image/jpeg", calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

/* ─────────────────────────  Calendario .ics  ───────────────────────── */
function aFechaICS(fecha, hora, minutosExtra = 0) {
  const [a, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const f = new Date(a, m - 1, d, hh, mm + minutosExtra);
  const p = (n) => String(n).padStart(2, "0");
  return f.getFullYear() + p(f.getMonth() + 1) + p(f.getDate()) + "T" + p(f.getHours()) + p(f.getMinutes()) + "00";
}

function escaparICS(t = "") {
  return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function generarICS(turnos, nombreCal) {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mutual MEBNA//Agenda de turnos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparICS(nombreCal)}`,
    "X-WR-TIMEZONE:America/Argentina/Buenos_Aires",
  ];
  turnos.forEach((t) => {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@mebna`,
      `DTSTAMP:${aFechaICS(hoy(), "08:00")}Z`,
      `DTSTART:${aFechaICS(t.fecha, t.hora)}`,
      `DTEND:${aFechaICS(t.fecha, t.hora, 30)}`,
      `SUMMARY:${escaparICS(`${t.especialidad} · ${t.pacienteNombre}`)}`,
      `DESCRIPTION:${escaparICS(
        `Paciente: ${t.pacienteNombre} (DNI ${t.dni})\nProfesional: ${t.profesional}\nEstado: ${etiquetaEstado(t.estado)}\nMotivo: ${t.motivo || "-"}${t.devolucion ? `\nIndicaciones: ${t.devolucion}` : ""}`
      )}`,
      "LOCATION:Mutual MEBNA - Sede central",
      `STATUS:${t.estado === "cancelado" ? "CANCELLED" : "CONFIRMED"}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Recordatorio de turno MEBNA",
      "END:VALARM",
      "END:VEVENT"
    );
  });
  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n");
}

function descargarArchivo(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function generarCSV(turnos) {
  const cab = ["Fecha", "Hora", "Paciente", "DNI", "Especialidad", "Profesional", "Estado", "Motivo", "Indicaciones"];
  const filas = turnos.map((t) =>
    [t.fecha, t.hora, t.pacienteNombre, t.dni, t.especialidad, t.profesional, etiquetaEstado(t.estado), t.motivo || "", t.devolucion || ""]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(",")
  );
  return "\uFEFF" + [cab.join(","), ...filas].join("\n");
}

/* ─────────────────────────  Estados  ───────────────────────── */
const ESTADOS = {
  pendiente: { txt: "Esperando revisión", color: C.amber, fondo: "#FBEEDB" },
  confirmado: { txt: "Confirmado", color: C.teal, fondo: C.mint },
  observado: { txt: "Falta documentación", color: C.clay, fondo: "#F7E0DD" },
  atendido: { txt: "Atendido", color: C.muted, fondo: "#E8EDEB" },
  cancelado: { txt: "Cancelado", color: C.clay, fondo: "#F7E0DD" },
};
const etiquetaEstado = (e) => (ESTADOS[e] ? ESTADOS[e].txt : e);

function Estado({ e }) {
  const s = ESTADOS[e] || ESTADOS.pendiente;
  return (
    <span style={{ background: s.fondo, color: s.color, border: `1px solid ${s.color}33`, padding: "3px 10px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.txt}
    </span>
  );
}

/* ─────────────────────────  Piezas de UI  ───────────────────────── */
function Campo({ etiqueta, ayuda, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13.5, color: C.ink, fontWeight: 600, marginBottom: 6 }}>{etiqueta}</span>
      {children}
      {ayuda && <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 5 }}>{ayuda}</span>}
    </label>
  );
}

const estiloInput = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  fontSize: 15,
  fontFamily: SANS,
  background: "#fff",
  color: C.ink,
  outlineColor: C.tealSoft,
};

function Boton({ children, onClick, variante = "solido", disabled, tipo = "button", ancho }) {
  const base = {
    padding: "10px 18px",
    borderRadius: 8,
    fontSize: 14.5,
    fontWeight: 600,
    fontFamily: SANS,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    width: ancho ? "100%" : "auto",
  };
  const v =
    variante === "solido"
      ? { background: C.teal, color: "#fff", border: `1px solid ${C.teal}` }
      : variante === "borde"
      ? { background: "transparent", color: C.teal, border: `1px solid ${C.line}` }
      : { background: "transparent", color: C.clay, border: "1px solid transparent" };
  return (
    <button type={tipo} onClick={onClick} disabled={disabled} style={{ ...base, ...v }}>
      {children}
    </button>
  );
}

function Tarjeta({ children, style }) {
  return <div style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}

function Aviso({ tipo = "info", children }) {
  const col = tipo === "error" ? C.clay : tipo === "ok" ? C.teal : C.amber;
  const fondo = tipo === "error" ? "#F7E0DD" : tipo === "ok" ? C.mint : "#FBEEDB";
  return (
    <div style={{ background: fondo, color: col, border: `1px solid ${col}33`, padding: "10px 14px", borderRadius: 8, fontSize: 14, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Titulo({ titulo, bajada, derecha }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
      <div>
        <h1 style={{ fontFamily: SERIF, fontSize: 29, margin: "0 0 6px", lineHeight: 1.2 }}>{titulo}</h1>
        <p style={{ color: C.muted, fontSize: 14.5, margin: 0, maxWidth: 560, lineHeight: 1.5 }}>{bajada}</p>
      </div>
      {derecha}
    </div>
  );
}

function Pestanas({ opciones, activa, onCambio }) {
  return (
    <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${C.line}`, marginBottom: 20, flexWrap: "wrap" }}>
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => onCambio(o.id)}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${activa === o.id ? C.teal : "transparent"}`,
            color: activa === o.id ? C.ink : C.muted,
            fontWeight: 600,
            fontSize: 14.5,
            fontFamily: SANS,
            padding: "10px 14px",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          {o.txt}
        </button>
      ))}
    </div>
  );
}

function Confirmacion({ texto, detalle, onSi, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,48,46,0.82)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Tarjeta style={{ maxWidth: 420, width: "100%" }}>
        <h3 style={{ fontFamily: SERIF, fontSize: 21, margin: "0 0 8px" }}>{texto}</h3>
        {detalle && <p style={{ color: C.muted, fontSize: 14.5, lineHeight: 1.5, margin: "0 0 18px" }}>{detalle}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <Boton onClick={onSi}>Sí, confirmar</Boton>
          <Boton variante="borde" onClick={onNo}>Volver</Boton>
        </div>
      </Tarjeta>
    </div>
  );
}

/* ─────────────────────────  Carga de fotos  ───────────────────────── */
function CargaFoto({ etiqueta, ayuda, valor, onCambio }) {
  const ref = useRef(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const manejar = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError("");
    setCargando(true);
    try {
      const data = await comprimirImagen(file);
      onCambio(data);
    } catch (err) {
      setError("Ese archivo no se pudo leer. Sacá la foto de nuevo o elegí un JPG o PNG.");
    }
    setCargando(false);
    e.target.value = "";
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13.5, color: C.ink, fontWeight: 600, marginBottom: 6 }}>{etiqueta}</span>
      {valor ? (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", background: C.paper }}>
          <img src={valor} alt={etiqueta} style={{ width: "100%", maxHeight: 220, objectFit: "contain", display: "block" }} />
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: `1px solid ${C.line}` }}>
            <Boton variante="borde" onClick={() => ref.current && ref.current.click()}>Cambiar foto</Boton>
            <Boton variante="texto" onClick={() => onCambio(null)}>Quitar</Boton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current && ref.current.click()}
          style={{ width: "100%", padding: "22px 14px", border: `1.5px dashed ${C.line}`, borderRadius: 10, background: C.paper, color: C.teal, fontFamily: SANS, fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}
        >
          {cargando ? "Procesando la foto…" : "Sacar foto o elegir archivo"}
        </button>
      )}
      {ayuda && <span style={{ display: "block", fontSize: 12.5, color: C.muted, marginTop: 6 }}>{ayuda}</span>}
      {error && <span style={{ display: "block", fontSize: 12.5, color: C.clay, marginTop: 6 }}>{error}</span>}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={manejar} style={{ display: "none" }} />
    </div>
  );
}

function Visor({ src, titulo, onCerrar }) {
  if (!titulo) return null;
  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(16,48,46,0.82)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, width: "100%", background: "#fff", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
          <strong style={{ fontSize: 15, color: C.ink }}>{titulo}</strong>
          <Boton variante="borde" onClick={onCerrar}>Cerrar</Boton>
        </div>
        {src ? (
          <img src={src} alt={titulo} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", background: C.paper }} />
        ) : (
          <p style={{ padding: 40, textAlign: "center", color: C.muted, margin: 0 }}>Esta foto no está disponible.</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  App Principal ───────────────────────── */
export default function AgendaMEBNA() {
  const [cargandoApp, setCargandoApp] = useState(true);
  const [turnos, setTurnos] = useState([]);
  const [usuarios, setUsuarios] = useState({});
  const [especialidades, setEspecialidades] = useState(ESPECIALIDADES_INICIALES);
  const [sesion, setSesion] = useState(null);
  const [visor, setVisor] = useState(null);
  const [fallaStorage, setFallaStorage] = useState(false);

  // Carga inicial desde Supabase
  useEffect(() => {
    (async () => {
      try {
        // 1. Cargar Usuarios
        const { data: dataUsuarios } = await supabase.from('usuarios').select('*');
        if (dataUsuarios) {
          const mapUsr = {};
          dataUsuarios.forEach(u => mapUsr[u.id] = u);
          setUsuarios(mapUsr);
        }
        
        // 2. Cargar Especialidades
        const { data: dataEsp } = await supabase.from('especialidades').select('*');
        if (dataEsp && dataEsp.length > 0) setEspecialidades(dataEsp.map(e => e.nombre));
        
        // 3. Cargar Turnos
        const { data: dataTurnos } = await supabase.from('turnos').select('*');
        if (dataTurnos) setTurnos(dataTurnos);

      } catch (e) {
        console.error("Error cargando BD:", e);
        setFallaStorage(true);
      }
      setCargandoApp(false);
    })();
  }, []);

  // Adaptadores para guardar en Supabase 
  const guardarTurnos = useCallback(async (lista, turnoModificado = null, idBorrar = null) => {
    setTurnos(lista);
    try {
      if (idBorrar) {
        await supabase.from('turnos').delete().eq('id', idBorrar);
      } else if (turnoModificado) {
        await supabase.from('turnos').upsert(turnoModificado);
      }
      setFallaStorage(false);
    } catch (e) {
      setFallaStorage(true);
    }
  }, []);

  const guardarUsuarios = useCallback(async (mapa, usuarioModificado = null, idBorrar = null) => {
    setUsuarios(mapa);
    try {
      if (idBorrar) {
         await supabase.from('usuarios').delete().eq('id', idBorrar);
      } else if (usuarioModificado) {
         await supabase.from('usuarios').upsert(usuarioModificado);
      }
      setFallaStorage(false);
    } catch (e) {
      setFallaStorage(true);
    }
  }, []);

  const guardarEspecialidades = useCallback(async (lista, nombreAgregado = null, nombreBorrado = null) => {
    setEspecialidades(lista);
    try {
      if(nombreAgregado) await supabase.from('especialidades').insert({ nombre: nombreAgregado });
      if(nombreBorrado) await supabase.from('especialidades').delete().eq('nombre', nombreBorrado);
      setFallaStorage(false);
    } catch (e) {
      setFallaStorage(true);
    }
  }, []);

  if (cargandoApp) {
    return (
      <div style={{ fontFamily: SANS, background: C.paper, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
        Abriendo la agenda de MEBNA…
      </div>
    );
  }

  const comun = { turnos, guardarTurnos, usuarios, guardarUsuarios, especialidades, guardarEspecialidades, abrirVisor: setVisor };

  return (
    <div style={{ fontFamily: SANS, background: C.paper, minHeight: "100vh", color: C.ink }}>
      <Encabezado sesion={sesion} onSalir={() => setSesion(null)} />
      <main style={{ maxWidth: 940, margin: "0 auto", padding: "26px 18px 70px" }}>
        {fallaStorage && <Aviso tipo="error">No se pudieron guardar o sincronizar los últimos cambios. Revisá tu conexión de internet.</Aviso>}
        {!sesion ? (
          <Ingreso usuarios={usuarios} especialidades={especialidades} onIngresar={setSesion} onRegistrar={guardarUsuarios} />
        ) : sesion.rol === "paciente" ? (
          <PanelPaciente sesion={sesion} {...comun} />
        ) : (
          <PanelStaff sesion={sesion} {...comun} />
        )}
      </main>
      <Visor src={visor && visor.src} titulo={visor && visor.titulo} onCerrar={() => setVisor(null)} />
    </div>
  );
}

/* ─────────────────────────  Encabezado  ───────────────────────── */
function Encabezado({ sesion, onSalir }) {
  return (
    <header style={{ background: C.ink, color: "#fff", borderBottom: `3px solid ${C.tealSoft}` }}>
      <div style={{ maxWidth: 940, margin: "0 auto", padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ fontFamily: SERIF, fontSize: 25, letterSpacing: 0.5, fontWeight: 600 }}>MEBNA</span>
          <span style={{ fontSize: 13.5, color: C.mint }}>Agenda de turnos</span>
        </div>
        {sesion && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 13.5 }}>
            <span style={{ color: C.mint }}>
              {sesion.nombre} · {sesion.rol === "paciente" ? `DNI ${sesion.id}` : `${CARGOS[sesion.cargo] || "Personal"} · legajo ${sesion.id}`}
            </span>
            <button onClick={onSalir} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 8, padding: "6px 14px", fontSize: 13.5, fontFamily: SANS, cursor: "pointer" }}>
              Salir
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/* ─────────────────────────  Ingreso  ───────────────────────── */
function Ingreso({ usuarios, especialidades, onIngresar, onRegistrar }) {
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [alta, setAlta] = useState(null);
  const [nombre, setNombre] = useState("");
  const [especialidad, setEspecialidad] = useState(especialidades[0] || "");
  const [cargo, setCargo] = useState("medico");

  const tipoDetectado = detectarTipo(id);
  const hayAdmin = Object.values(usuarios).some((u) => u.cargo === "admin_general");

  const continuar = () => {
    const valor = id.trim().toUpperCase();
    const tipo = detectarTipo(valor);
    if (!tipo) return setError("Ingresá un DNI de 7 u 8 números, o tu número de legajo.");
    setError("");
    const existente = usuarios[valor];
    if (existente) {
      if (existente.baja) return setError("Este número está dado de baja. Comunicate con la administración de la mutual.");
      onIngresar({ id: valor, ...existente });
    } else {
      setAlta({ id: valor, rol: tipo === "paciente" ? "paciente" : "staff" });
    }
  };

  const confirmarAlta = async () => {
    if (nombre.trim().length < 3) return setError("Escribí tu nombre y apellido.");
    const nuevo =
      alta.rol === "paciente"
        ? { id: alta.id, rol: "paciente", nombre: nombre.trim() }
        : { id: alta.id, rol: "staff", nombre: nombre.trim(), cargo, especialidad: cargo === "medico" ? especialidad : null };
    await onRegistrar({ ...usuarios, [alta.id]: nuevo }, nuevo);
    onIngresar(nuevo);
  };

  if (alta) {
    return (
      <div style={{ maxWidth: 460, margin: "26px auto" }}>
        <Tarjeta>
          <h2 style={{ fontFamily: SERIF, fontSize: 24, margin: "0 0 6px" }}>Primera vez con este número</h2>
          <p style={{ color: C.muted, fontSize: 14.5, margin: "0 0 20px", lineHeight: 1.5 }}>
            {alta.rol === "paciente"
              ? `Vamos a crear tu ficha de afiliado con el DNI ${alta.id}.`
              : `Vamos a crear tu perfil de personal con el legajo ${alta.id}.`}
          </p>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Campo etiqueta="Nombre y apellido">
            <input style={estiloInput} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ana Beltrán" />
          </Campo>
          {alta.rol === "staff" && (
            <>
              <Campo
                etiqueta="Función"
                ayuda={hayAdmin ? "Las altas de personal las confirma la administración." : "Todavía no hay administrador general. El primero que se registre puede serlo."}
              >
                <select style={estiloInput} value={cargo} onChange={(e) => setCargo(e.target.value)}>
                  <option value="medico">Profesional médico</option>
                  <option value="administrativo">Administrativo</option>
                  {!hayAdmin && <option value="admin_general">Administrador general</option>}
                </select>
              </Campo>
              {cargo === "medico" && (
                <Campo etiqueta="Especialidad">
                  <select style={estiloInput} value={especialidad} onChange={(e) => setEspecialidad(e.target.value)}>
                    {especialidades.map((e) => <option key={e}>{e}</option>)}
                  </select>
                </Campo>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Boton onClick={confirmarAlta}>Crear y entrar</Boton>
            <Boton variante="borde" onClick={() => { setAlta(null); setError(""); }}>Volver</Boton>
          </div>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 460, margin: "26px auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, lineHeight: 1.2, margin: "0 0 10px" }}>Entrá con tu número</h1>
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.55, margin: 0 }}>
          Los afiliados ingresan con el DNI. El personal de la mutual, con el legajo.
        </p>
      </div>
      <Tarjeta>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo
          etiqueta="DNI o legajo"
          ayuda={
            tipoDetectado === "paciente"
              ? "Reconocido como DNI: entrás como afiliado."
              : tipoDetectado === "staff"
              ? "Reconocido como legajo: entrás como personal de la mutual."
              : "Ejemplos: 30124588 (DNI) o L-2204 (legajo)."
          }
        >
          <input style={estiloInput} value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && continuar()} placeholder="30124588" autoFocus />
        </Campo>
        <Boton ancho onClick={continuar}>Continuar</Boton>
      </Tarjeta>
    </div>
  );
}

/* ─────────────────────────  Panel del paciente  ───────────────────────── */
function PanelPaciente({ sesion, turnos, guardarTurnos, especialidades, usuarios, abrirVisor }) {
  const [vista, setVista] = useState("mis");
  const mios = turnos.filter((t) => t.dni === sesion.id).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  return (
    <>
      <Titulo titulo={`Hola, ${sesion.nombre.split(" ")[0]}`} bajada="Pedí un turno, adjuntá la orden médica y seguí la respuesta del profesional." />
      <Pestanas
        opciones={[{ id: "mis", txt: `Mis turnos (${mios.length})` }, { id: "nuevo", txt: "Pedir un turno" }]}
        activa={vista}
        onCambio={setVista}
      />
      {vista === "nuevo" ? (
        <FormularioTurno sesion={sesion} turnos={turnos} guardarTurnos={guardarTurnos} especialidades={especialidades} usuarios={usuarios} alTerminar={() => setVista("mis")} />
      ) : (
        <ListaPaciente turnos={mios} sesion={sesion} guardarTurnos={guardarTurnos} todos={turnos} abrirVisor={abrirVisor} irANuevo={() => setVista("nuevo")} />
      )}
    </>
  );
}

function FormularioTurno({ sesion, turnos, guardarTurnos, especialidades, usuarios, alTerminar }) {
  const [especialidad, setEspecialidad] = useState(especialidades[0] || "");
  const [legajoMedico, setLegajoMedico] = useState("");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [orden, setOrden] = useState(null);
  const [docDni, setDocDni] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const disponibles = medicosDe(usuarios, especialidad);
  const medico = disponibles.find((m) => m.legajo === legajoMedico) || null;
  const agenda = medico ? medico.agenda || AGENDA_POR_DEFECTO : null;

  const franjas = medico ? horariosDeAgenda(agenda, fecha) : [];
  const ocupados = turnos
    .filter((t) => t.fecha === fecha && t.legajoMedico === legajoMedico && t.estado !== "cancelado")
    .map((t) => t.hora);

  const diasQueAtiende = agenda
    ? agenda.dias.slice().sort().map((n) => (DIAS.find((d) => d.n === n) || {}).largo).join(", ")
    : "";

  const cambiarEsp = (v) => { setEspecialidad(v); setLegajoMedico(""); setFecha(""); setHora(""); };

  const enviar = async () => {
    if (!especialidad) return setError("No hay especialidades habilitadas. Escribile a la administración.");
    if (!medico) return setError("Elegí con qué profesional te querés atender.");
    if (!fecha) return setError("Elegí el día del turno.");
    if (fecha < hoy()) return setError("Esa fecha ya pasó. Elegí un día de hoy en adelante.");
    if (franjas.length === 0) return setError(`${medico.nombre} no atiende ese día. Atiende ${diasQueAtiende}.`);
    if (!hora) return setError("Elegí un horario disponible.");
    if (!docDni) return setError("Falta la foto del DNI. Es obligatoria para validar tu afiliación.");
    
    setError("");
    setEnviando(true);
    const idTurno = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    
    try {
      // Subir fotos a Supabase Storage (convertimos base64 a Blob)
      const subirFoto = async (b64, sufijo) => {
        if(!b64) return;
        const fetchRes = await fetch(b64);
        const blob = await fetchRes.blob();
        await supabase.storage.from('mebna_img').upload(`${idTurno}_${sufijo}.jpg`, blob, { contentType: 'image/jpeg' });
      };

      await subirFoto(docDni, "dni");
      await subirFoto(orden, "orden");

      const nuevo = {
        id: idTurno, dni: sesion.id, pacienteNombre: sesion.nombre, especialidad,
        profesional: medico.nombre, legajoMedico: medico.legajo,
        fecha, hora, motivo: motivo.trim(),
        estado: "pendiente", devolucion: "", tieneOrden: !!orden, creado: new Date().toISOString(),
      };
      
      await guardarTurnos([...turnos, nuevo], nuevo);
      setEnviando(false);
      alTerminar();
      
    } catch (e) {
      console.error(e);
      setEnviando(false);
      setError("Error subiendo las fotos a nuestros servidores. Intentá de nuevo.");
    }
  };

  return (
    <Tarjeta>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Campo etiqueta="Especialidad">
        <select style={estiloInput} value={especialidad} onChange={(e) => cambiarEsp(e.target.value)}>
          {especialidades.map((e) => <option key={e}>{e}</option>)}
        </select>
      </Campo>

      <Campo
        etiqueta="Profesional"
        ayuda={disponibles.length === 0 ? "Todavía no hay profesionales asignados a esta especialidad." : medico ? resumenAgenda(agenda) : "Cada profesional atiende días y horarios distintos."}
      >
        <select style={estiloInput} value={legajoMedico} onChange={(e) => { setLegajoMedico(e.target.value); setFecha(""); setHora(""); }}>
          <option value="">Elegir profesional</option>
          {disponibles.map((m) => <option key={m.legajo} value={m.legajo}>{m.nombre}</option>)}
        </select>
      </Campo>

      {medico && (
        <Campo etiqueta="Día" ayuda={`Atiende ${diasQueAtiende}.`}>
          <input type="date" min={hoy()} style={estiloInput} value={fecha} onChange={(e) => { setFecha(e.target.value); setHora(""); }} />
        </Campo>
      )}

      {medico && fecha && (
        franjas.length === 0 ? (
          <Aviso>{medico.nombre} no atiende ese día. Sus días son: {diasQueAtiende}.</Aviso>
        ) : (
          <Campo etiqueta="Horario" ayuda="Los horarios en gris ya están tomados.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
              {franjas.map((h) => {
                const tomado = ocupados.includes(h);
                const sel = hora === h;
                return (
                  <button key={h} type="button" disabled={tomado} onClick={() => setHora(h)}
                    style={{ padding: "9px 0", borderRadius: 8, border: `1px solid ${sel ? C.teal : C.line}`, background: tomado ? "#EDEFEE" : sel ? C.teal : "#fff", color: tomado ? "#9AA9A6" : sel ? "#fff" : C.ink, fontSize: 14, fontWeight: 600, fontFamily: SANS, cursor: tomado ? "not-allowed" : "pointer" }}>
                    {h}
                  </button>
                );
              })}
            </div>
          </Campo>
        )
      )}

      <Campo etiqueta="Motivo de la consulta" ayuda="Contale al profesional qué te pasa, en pocas palabras.">
        <textarea rows={3} style={{ ...estiloInput, resize: "vertical" }} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Dolor en la rodilla derecha desde hace dos semanas." />
      </Campo>
      <CargaFoto etiqueta="Foto del DNI" ayuda="Frente del documento, sobre una superficie lisa y con buena luz." valor={docDni} onCambio={setDocDni} />
      <CargaFoto etiqueta="Orden médica (si tenés)" ayuda="Sacá la foto de la orden completa, con el sello y la firma visibles." valor={orden} onCambio={setOrden} />
      <Boton onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Pedir el turno"}</Boton>
    </Tarjeta>
  );
}

function ListaPaciente({ turnos, sesion, guardarTurnos, todos, abrirVisor, irANuevo }) {
  const verFoto = async (t, cual, titulo) => {
    const fileName = `${t.id}_${cual === 'docDni' ? 'dni' : 'orden'}.jpg`;
    const { data, error } = await supabase.storage.from('mebna_img').createSignedUrl(fileName, 60); // 60 segundos
    if(data && !error) abrirVisor({ src: data.signedUrl, titulo });
    else abrirVisor({ src: null, titulo });
  };

  const cancelar = async (t) => {
    const obj = { ...t, estado: "cancelado" };
    await guardarTurnos(todos.map((x) => (x.id === t.id ? obj : x)), obj);
  };

  if (turnos.length === 0) {
    return (
      <Tarjeta style={{ textAlign: "center", padding: "44px 22px" }}>
        <p style={{ fontFamily: SERIF, fontSize: 21, margin: "0 0 8px" }}>Todavía no pediste ningún turno</p>
        <p style={{ color: C.muted, fontSize: 14.5, margin: "0 0 20px" }}>Elegí especialidad, día y horario, y adjuntá tu documentación.</p>
        <Boton onClick={irANuevo}>Pedir un turno</Boton>
      </Tarjeta>
    );
  }

  const activos = turnos.filter((t) => t.estado !== "cancelado");

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Boton variante="borde" disabled={activos.length === 0} onClick={() => descargarArchivo(generarICS(activos, `Turnos MEBNA - ${sesion.nombre}`), "turnos-mebna.ics", "text/calendar")}>
          Descargar calendario (.ics)
        </Boton>
        <Boton variante="borde" onClick={() => descargarArchivo(generarCSV(turnos), "turnos-mebna.csv", "text/csv")}>
          Descargar planilla (.csv)
        </Boton>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {turnos.map((t) => (
          <Tarjeta key={t.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 19 }}>{t.especialidad}</div>
                <div style={{ color: C.muted, fontSize: 14, marginTop: 3 }}>{fechaLarga(t.fecha)} · {t.hora} h · {t.profesional}</div>
              </div>
              <Estado e={t.estado} />
            </div>
            {t.motivo && <p style={{ fontSize: 14.5, color: C.ink, margin: "0 0 10px", lineHeight: 1.5 }}>{t.motivo}</p>}
            {t.devolucion && (
              <div style={{ background: C.mint, borderLeft: `3px solid ${C.teal}`, padding: "10px 14px", borderRadius: 6, fontSize: 14.5, lineHeight: 1.5, marginBottom: 10 }}>
                <strong style={{ display: "block", marginBottom: 3 }}>Respuesta del profesional</strong>
                {t.devolucion}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Boton variante="borde" onClick={() => verFoto(t, "docDni", "DNI cargado")}>Ver DNI</Boton>
              {t.tieneOrden && <Boton variante="borde" onClick={() => verFoto(t, "orden", "Orden médica")}>Ver orden</Boton>}
              {t.estado !== "cancelado" && t.estado !== "atendido" && <Boton variante="texto" onClick={() => cancelar(t)}>Cancelar turno</Boton>}
            </div>
          </Tarjeta>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────────  Panel del personal  ───────────────────────── */
function PanelStaff(props) {
  const { sesion } = props;
  const p = permisos(sesion);
  const [vista, setVista] = useState("turnos");

  const opciones = [{ id: "turnos", txt: "Turnos" }];
  if (p.pacientes || p.profesionales) opciones.push({ id: "personas", txt: "Personas" });
  if (p.agendas) opciones.push({ id: "agendas", txt: "Días y horarios" });
  if (p.especialidades) opciones.push({ id: "especialidades", txt: "Especialidades" });

  return (
    <>
      {opciones.length > 1 && <Pestanas opciones={opciones} activa={vista} onCambio={setVista} />}
      {vista === "turnos" && <VistaTurnos {...props} p={p} />}
      {vista === "personas" && <VistaPersonas {...props} p={p} />}
      {vista === "agendas" && <VistaAgendas {...props} />}
      {vista === "especialidades" && <VistaEspecialidades {...props} />}
    </>
  );
}

/* ── Turnos ── */
function VistaTurnos({ sesion, turnos, guardarTurnos, usuarios, especialidades, abrirVisor, p }) {
  const esMedico = sesion.cargo === "medico";
  const [filtroEsp, setFiltroEsp] = useState(esMedico && sesion.especialidad ? sesion.especialidad : "todas");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState(null); 
  const [aBorrar, setABorrar] = useState(null);

  const lista = turnos
    .filter((t) => (esMedico ? t.legajoMedico === sesion.id || !t.legajoMedico : true))
    .filter((t) => (filtroEsp === "todas" ? true : t.especialidad === filtroEsp))
    .filter((t) => (filtroEstado === "todos" ? true : t.estado === filtroEstado))
    .filter((t) => {
      const q = busqueda.trim().toLowerCase();
      return !q || t.pacienteNombre.toLowerCase().includes(q) || t.dni.includes(q);
    })
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const pendientes = turnos.filter((t) => t.estado === "pendiente").length;

  const verFoto = async (t, cual, titulo) => {
    const fileName = `${t.id}_${cual === 'docDni' ? 'dni' : 'orden'}.jpg`;
    const { data, error } = await supabase.storage.from('mebna_img').createSignedUrl(fileName, 60);
    abrirVisor({ src: data && !error ? data.signedUrl : null, titulo });
  };

  const resolver = async (t, estado) => {
    const obj = { ...t, estado, devolucion: texto.trim() || t.devolucion, profesional: esMedico ? sesion.nombre : t.profesional, revisadoPor: sesion.nombre };
    await guardarTurnos(
      turnos.map((x) => x.id === t.id ? obj : x),
      obj
    );
    setAbierto(null);
    setTexto("");
  };

  const eliminar = async (t) => {
    await guardarTurnos(turnos.filter((x) => x.id !== t.id), null, t.id);
    try { await supabase.storage.from('mebna_img').remove([`${t.id}_dni.jpg`, `${t.id}_orden.jpg`]); } catch (e) {}
    setABorrar(null);
  };

  if (editando) {
    return (
      <EditorTurno
        turno={editando}
        turnos={turnos}
        usuarios={usuarios}
        especialidades={especialidades}
        sesion={sesion}
        onGuardar={async (t) => {
          const existe = turnos.some((x) => x.id === t.id);
          await guardarTurnos(existe ? turnos.map((x) => (x.id === t.id ? t : x)) : [...turnos, t], t);
          setEditando(null);
        }}
        onCancelar={() => setEditando(null)}
      />
    );
  }

  return (
    <>
      <Titulo
        titulo={esMedico ? `Consultorio de ${sesion.nombre}` : p.esAdmin ? "Administración de turnos" : "Mesa de turnos"}
        bajada={pendientes > 0 ? `Hay ${pendientes} ${pendientes === 1 ? "turno esperando" : "turnos esperando"} revisión de documentación.` : "No quedan turnos sin revisar."}
        derecha={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {p.turnos && (
              <Boton onClick={() => setEditando({ id: "", dni: "", pacienteNombre: "", especialidad: especialidades[0] || "", profesional: "", legajoMedico: "", fecha: "", hora: "", motivo: "", estado: "confirmado", devolucion: "", tieneOrden: false })}>
                Crear turno
              </Boton>
            )}
            <Boton variante="borde" disabled={lista.length === 0} onClick={() => descargarArchivo(generarICS(lista.filter((t) => t.estado !== "cancelado"), `Agenda MEBNA - ${sesion.nombre}`), "agenda-mebna.ics", "text/calendar")}>
              Calendario (.ics)
            </Boton>
            <Boton variante="borde" disabled={lista.length === 0} onClick={() => descargarArchivo(generarCSV(lista), "agenda-mebna.csv", "text/csv")}>
              Planilla (.csv)
            </Boton>
          </div>
        }
      />

      <Tarjeta style={{ padding: 14, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <select style={estiloInput} value={filtroEsp} onChange={(e) => setFiltroEsp(e.target.value)}>
            <option value="todas">Todas las especialidades</option>
            {especialidades.map((e) => <option key={e}>{e}</option>)}
          </select>
          <select style={estiloInput} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="todos">Todos los estados</option>
            {Object.keys(ESTADOS).map((k) => <option key={k} value={k}>{ESTADOS[k].txt}</option>)}
          </select>
          <input style={estiloInput} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o DNI" />
        </div>
      </Tarjeta>

      {lista.length === 0 ? (
        <Tarjeta style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>No hay turnos que coincidan con estos filtros.</Tarjeta>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {lista.map((t) => (
            <Tarjeta key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontFamily: SERIF, fontSize: 19 }}>{t.pacienteNombre}</div>
                  <div style={{ color: C.muted, fontSize: 14, marginTop: 3 }}>DNI {t.dni} · {t.especialidad} · {t.profesional}</div>
                  <div style={{ color: C.ink, fontSize: 14, marginTop: 3 }}>{fechaLarga(t.fecha)} · {t.hora} h</div>
                </div>
                <Estado e={t.estado} />
              </div>
              {t.motivo && <p style={{ fontSize: 14.5, margin: "12px 0 0", lineHeight: 1.5 }}>{t.motivo}</p>}
              {t.devolucion && (
                <div style={{ background: C.paper, borderLeft: `3px solid ${C.line}`, padding: "9px 12px", borderRadius: 6, fontSize: 14, marginTop: 12, color: C.muted }}>
                  {t.devolucion} {t.revisadoPor && `— ${t.revisadoPor}`}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                <Boton variante="borde" onClick={() => verFoto(t, "docDni", `DNI de ${t.pacienteNombre}`)}>Ver DNI</Boton>
                <Boton variante="borde" onClick={() => verFoto(t, "orden", `Orden médica de ${t.pacienteNombre}`)} disabled={!t.tieneOrden}>
                  {t.tieneOrden ? "Ver orden médica" : "Sin orden adjunta"}
                </Boton>
                <Boton onClick={() => { setAbierto(abierto === t.id ? null : t.id); setTexto(""); }}>
                  {abierto === t.id ? "Cerrar revisión" : "Revisar"}
                </Boton>
                {p.turnos && <Boton variante="borde" onClick={() => setEditando(t)}>Editar</Boton>}
                {p.turnos && <Boton variante="texto" onClick={() => setABorrar(t)}>Eliminar</Boton>}
              </div>
              {abierto === t.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                  <Campo etiqueta="Indicaciones para el paciente" ayuda="Se muestra en la ficha del turno del afiliado.">
                    <textarea rows={3} style={{ ...estiloInput, resize: "vertical" }} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Traer estudios previos. La orden está vencida, pedir una nueva." />
                  </Campo>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Boton onClick={() => resolver(t, "confirmado")}>Confirmar turno</Boton>
                    <Boton variante="borde" onClick={() => resolver(t, "observado")}>Pedir documentación</Boton>
                    <Boton variante="borde" onClick={() => resolver(t, "atendido")}>Marcar atendido</Boton>
                    <Boton variante="texto" onClick={() => resolver(t, "cancelado")}>Cancelar turno</Boton>
                  </div>
                </div>
              )}
            </Tarjeta>
          ))}
        </div>
      )}

      {aBorrar && (
        <Confirmacion
          texto="Eliminar el turno"
          detalle={`Se borra el turno de ${aBorrar.pacienteNombre} del ${fechaLarga(aBorrar.fecha)} a las ${aBorrar.hora}, junto con las fotos adjuntas. No se puede deshacer.`}
          onSi={() => eliminar(aBorrar)}
          onNo={() => setABorrar(null)}
        />
      )}
    </>
  );
}

function EditorTurno({ turno, turnos, usuarios, especialidades, sesion, onGuardar, onCancelar }) {
  const esNuevo = !turno.id;
  const [f, setF] = useState(turno);
  const [error, setError] = useState("");

  const pacientes = Object.entries(usuarios).filter(([, u]) => u.rol === "paciente" && !u.baja);
  const medicos = medicosDe(usuarios, f.especialidad);
  const medico = medicos.find((m) => m.legajo === f.legajoMedico) || null;
  const agenda = medico ? medico.agenda || AGENDA_POR_DEFECTO : null;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const franjas = medico ? horariosDeAgenda(agenda, f.fecha) : [];
  const ocupados = turnos
    .filter((t) => t.id !== f.id && t.fecha === f.fecha && t.legajoMedico === f.legajoMedico && t.estado !== "cancelado")
    .map((t) => t.hora);

  const guardar = () => {
    if (!f.dni) return setError("Elegí el paciente del turno.");
    if (!f.legajoMedico) return setError("Elegí el profesional que lo va a atender.");
    if (!f.fecha) return setError("Elegí el día.");
    if (!f.hora) return setError("Elegí el horario.");
    setError("");
    const paciente = usuarios[f.dni];
    onGuardar({
      ...f,
      id: f.id || "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      pacienteNombre: paciente ? paciente.nombre : f.pacienteNombre,
      profesional: medico ? medico.nombre : f.profesional,
      creado: f.creado || new Date().toISOString(),
      modificadoPor: sesion.nombre,
    });
  };

  return (
    <>
      <Titulo titulo={esNuevo ? "Crear un turno" : "Editar el turno"} bajada={esNuevo ? "Para turnos que se piden por teléfono o en el mostrador." : `Turno de ${turno.pacienteNombre}.`} />
      <Tarjeta>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo etiqueta="Paciente" ayuda={pacientes.length === 0 ? "Todavía no hay afiliados cargados. Agregalos desde Personas." : null}>
          <select style={estiloInput} value={f.dni} onChange={(e) => set("dni", e.target.value)}>
            <option value="">Elegir paciente</option>
            {pacientes.map(([dni, u]) => <option key={dni} value={dni}>{u.nombre} — DNI {dni}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Especialidad">
          <select style={estiloInput} value={f.especialidad} onChange={(e) => { set("especialidad", e.target.value); set("legajoMedico", ""); set("hora", ""); }}>
            {especialidades.map((e) => <option key={e}>{e}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Profesional" ayuda={medico ? resumenAgenda(agenda) : medicos.length === 0 ? "No hay profesionales en esta especialidad." : null}>
          <select style={estiloInput} value={f.legajoMedico || ""} onChange={(e) => { set("legajoMedico", e.target.value); set("hora", ""); }}>
            <option value="">Elegir profesional</option>
            {medicos.map((m) => <option key={m.legajo} value={m.legajo}>{m.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Día">
          <input type="date" style={estiloInput} value={f.fecha} onChange={(e) => { set("fecha", e.target.value); set("hora", ""); }} />
        </Campo>
        {medico && f.fecha && (
          franjas.length === 0 ? (
            <Aviso>{medico.nombre} no atiende ese día según su agenda.</Aviso>
          ) : (
            <Campo etiqueta="Horario" ayuda="Los horarios en gris ya están ocupados con este profesional.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8 }}>
                {franjas.map((h) => {
                  const tomado = ocupados.includes(h);
                  const sel = f.hora === h;
                  return (
                    <button key={h} type="button" disabled={tomado} onClick={() => set("hora", h)}
                      style={{ padding: "9px 0", borderRadius: 8, border: `1px solid ${sel ? C.teal : C.line}`, background: tomado ? "#EDEFEE" : sel ? C.teal : "#fff", color: tomado ? "#9AA9A6" : sel ? "#fff" : C.ink, fontSize: 14, fontWeight: 600, fontFamily: SANS, cursor: tomado ? "not-allowed" : "pointer" }}>
                      {h}
                    </button>
                  );
                })}
              </div>
            </Campo>
          )
        )}
        <Campo etiqueta="Motivo de la consulta">
          <textarea rows={2} style={{ ...estiloInput, resize: "vertical" }} value={f.motivo} onChange={(e) => set("motivo", e.target.value)} />
        </Campo>
        <Campo etiqueta="Estado">
          <select style={estiloInput} value={f.estado} onChange={(e) => set("estado", e.target.value)}>
            {Object.keys(ESTADOS).map((k) => <option key={k} value={k}>{ESTADOS[k].txt}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Indicaciones para el paciente">
          <textarea rows={2} style={{ ...estiloInput, resize: "vertical" }} value={f.devolucion} onChange={(e) => set("devolucion", e.target.value)} />
        </Campo>
        <div style={{ display: "flex", gap: 10 }}>
          <Boton onClick={guardar}>{esNuevo ? "Crear turno" : "Guardar cambios"}</Boton>
          <Boton variante="borde" onClick={onCancelar}>Volver</Boton>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Personas ── */
function VistaPersonas({ sesion, usuarios, guardarUsuarios, turnos, guardarTurnos, especialidades, p }) {
  const [grupo, setGrupo] = useState(p.profesionales ? "medico" : "paciente");
  const [busqueda, setBusqueda] = useState("");
  const [alta, setAlta] = useState(null);
  const [aBorrar, setABorrar] = useState(null);

  const gruposDisponibles = [
    p.profesionales && { id: "medico", txt: "Profesionales" },
    p.administrativos && { id: "administrativo", txt: "Administrativos" },
    p.pacientes && { id: "paciente", txt: "Afiliados" },
  ].filter(Boolean);

  const filtrar = ([id, u]) => {
    const coincideGrupo =
      grupo === "paciente" ? u.rol === "paciente" : grupo === "medico" ? u.cargo === "medico" : u.cargo === "administrativo" || u.cargo === "admin_general";
    const q = busqueda.trim().toLowerCase();
    return coincideGrupo && (!q || u.nombre.toLowerCase().includes(q) || id.toLowerCase().includes(q));
  };

  const gente = Object.entries(usuarios).filter(filtrar).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre));

  const permiteEditar = (u) => {
    if (u.rol === "paciente") return p.pacientes;
    if (u.cargo === "medico") return p.profesionales;
    return p.administrativos;
  };

  const eliminar = async (id, u) => {
    const copia = { ...usuarios };
    delete copia[id];
    await guardarUsuarios(copia, null, id);
    if (u.rol === "paciente") {
      const suyos = turnos.filter((t) => t.dni === id);
      for (const t of suyos) {
        await guardarTurnos(turnos.filter((x) => x.id !== t.id), null, t.id);
        try { await supabase.storage.from('mebna_img').remove([`${t.id}_dni.jpg`, `${t.id}_orden.jpg`]); } catch (e) {}
      }
    }
    setABorrar(null);
  };

  if (alta) {
    return (
      <EditorPersona
        persona={alta}
        usuarios={usuarios}
        especialidades={especialidades}
        permisosActuales={p}
        onGuardar={async (id, datos) => {
          const obj = { id, ...datos };
          await guardarUsuarios({ ...usuarios, [id]: obj }, obj);
          if (datos.rol === "paciente") {
            const actualizados = turnos.map((t) => (t.dni === id ? { ...t, pacienteNombre: datos.nombre } : t));
            const aModificar = actualizados.filter((t) => t.dni === id);
            for(let t of aModificar) { await guardarTurnos(actualizados, t); }
          }
          setAlta(null);
        }}
        onCancelar={() => setAlta(null)}
      />
    );
  }

  return (
    <>
      <Titulo
        titulo="Personas de la mutual"
        bajada={
          p.profesionales
            ? "Alta y baja de profesionales, administrativos y afiliados."
            : "Como administrativo podés dar de alta y de baja afiliados. Las altas de personal las hace el administrador general."
        }
        derecha={<Boton onClick={() => setAlta({ nuevo: true, id: "", nombre: "", rol: grupo === "paciente" ? "paciente" : "staff", cargo: grupo === "paciente" ? null : grupo, especialidad: especialidades[0] || "" })}>Agregar persona</Boton>}
      />

      <Tarjeta style={{ padding: 14, marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <select style={estiloInput} value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {gruposDisponibles.map((g) => <option key={g.id} value={g.id}>{g.txt}</option>)}
          </select>
          <input style={estiloInput} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, DNI o legajo" />
        </div>
      </Tarjeta>

      {gente.length === 0 ? (
        <Tarjeta style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>No hay nadie cargado en esta lista todavía.</Tarjeta>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {gente.map(([id, u]) => (
            <Tarjeta key={id} style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 18 }}>
                  {u.nombre}
                  {u.baja && <span style={{ color: C.clay, fontSize: 13, fontFamily: SANS, marginLeft: 8 }}>dado de baja</span>}
                </div>
                <div style={{ color: C.muted, fontSize: 13.5, marginTop: 3 }}>
                  {u.rol === "paciente" ? `Afiliado · DNI ${id}` : `${CARGOS[u.cargo]} · legajo ${id}`}
                  {u.especialidad ? ` · ${u.especialidad}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Boton variante="borde" disabled={!permiteEditar(u)} onClick={() => setAlta({ nuevo: false, id, ...u })}>Editar</Boton>
                <Boton variante="texto" disabled={!permiteEditar(u) || id === sesion.id} onClick={() => setABorrar({ id, u })}>Quitar</Boton>
              </div>
            </Tarjeta>
          ))}
        </div>
      )}

      {aBorrar && (
        <Confirmacion
          texto={`Quitar a ${aBorrar.u.nombre}`}
          detalle={aBorrar.u.rol === "paciente" ? "También se borran sus turnos y las fotos que subió. No se puede deshacer." : "Pierde el acceso a la app. Los turnos que atendió quedan en el historial."}
          onSi={() => eliminar(aBorrar.id, aBorrar.u)}
          onNo={() => setABorrar(null)}
        />
      )}
    </>
  );
}

function EditorPersona({ persona, usuarios, especialidades, permisosActuales, onGuardar, onCancelar }) {
  const [id, setId] = useState(persona.id);
  const [nombre, setNombre] = useState(persona.nombre || "");
  const [cargo, setCargo] = useState(persona.rol === "paciente" ? "paciente" : persona.cargo || "medico");
  const [especialidad, setEspecialidad] = useState(persona.especialidad || especialidades[0] || "");
  const [baja, setBaja] = useState(!!persona.baja);
  const [error, setError] = useState("");

  const opcionesCargo = [
    permisosActuales.pacientes && { v: "paciente", t: "Afiliado (ingresa con DNI)" },
    permisosActuales.profesionales && { v: "medico", t: "Profesional médico" },
    permisosActuales.administrativos && { v: "administrativo", t: "Administrativo" },
    permisosActuales.administrativos && { v: "admin_general", t: "Administrador general" },
  ].filter(Boolean);

  const guardar = () => {
    const valor = id.trim().toUpperCase();
    if (nombre.trim().length < 3) return setError("Escribí nombre y apellido.");
    const tipo = detectarTipo(valor);
    if (!tipo) return setError("El número no es válido. Un DNI lleva 7 u 8 dígitos; un legajo puede tener letras.");
    if (cargo === "paciente" && tipo !== "paciente") return setError("Un afiliado tiene que ingresar con un DNI de 7 u 8 dígitos.");
    if (cargo !== "paciente" && tipo === "paciente") return setError("El personal usa legajo, no DNI. Probá con un formato como L-2204.");
    if (persona.nuevo && usuarios[valor]) return setError("Ese número ya está registrado en la mutual.");
    setError("");
    const datos =
      cargo === "paciente"
        ? { rol: "paciente", nombre: nombre.trim(), baja }
        : { rol: "staff", nombre: nombre.trim(), cargo, especialidad: cargo === "medico" ? especialidad : null, baja };
    onGuardar(valor, datos);
  };

  return (
    <>
      <Titulo titulo={persona.nuevo ? "Agregar una persona" : `Editar a ${persona.nombre}`} bajada="El número que cargues acá es con el que la persona entra a la app." />
      <Tarjeta style={{ maxWidth: 520 }}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo etiqueta="Rol">
          <select style={estiloInput} value={cargo} onChange={(e) => setCargo(e.target.value)} disabled={!persona.nuevo}>
            {opcionesCargo.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
          </select>
        </Campo>
        <Campo etiqueta={cargo === "paciente" ? "DNI" : "Legajo"} ayuda={persona.nuevo ? null : "El número de ingreso no se cambia. Si hace falta, dalo de baja y creá uno nuevo."}>
          <input style={estiloInput} value={id} onChange={(e) => setId(e.target.value)} disabled={!persona.nuevo} placeholder={cargo === "paciente" ? "30124588" : "L-2204"} />
        </Campo>
        <Campo etiqueta="Nombre y apellido">
          <input style={estiloInput} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        {cargo === "medico" && (
          <Campo etiqueta="Especialidad">
            <select style={estiloInput} value={especialidad} onChange={(e) => setEspecialidad(e.target.value)}>
              {especialidades.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Campo>
        )}
        <Campo etiqueta="Acceso" ayuda="Suspendido significa que el número existe pero no puede entrar.">
          <select style={estiloInput} value={baja ? "1" : "0"} onChange={(e) => setBaja(e.target.value === "1")}>
            <option value="0">Activo</option>
            <option value="1">Suspendido</option>
          </select>
        </Campo>
        <div style={{ display: "flex", gap: 10 }}>
          <Boton onClick={guardar}>{persona.nuevo ? "Agregar" : "Guardar cambios"}</Boton>
          <Boton variante="borde" onClick={onCancelar}>Volver</Boton>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Días y horarios por profesional ── */
function VistaAgendas({ usuarios, guardarUsuarios, turnos, especialidades }) {
  const [editando, setEditando] = useState(null);
  const medicos = medicosDe(usuarios).sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (editando) {
    return (
      <EditorAgenda
        medico={editando}
        turnos={turnos}
        onGuardar={async (agenda) => {
          const obj = { ...usuarios[editando.legajo], agenda };
          await guardarUsuarios({ ...usuarios, [editando.legajo]: obj }, obj);
          setEditando(null);
        }}
        onCancelar={() => setEditando(null)}
      />
    );
  }

  return (
    <>
      <Titulo
        titulo="Días y horarios de atención"
        bajada="Definí para cada profesional qué días atiende, en qué franjas y cuánto dura cada turno. Es lo que ven los afiliados al pedir turno."
      />
      {medicos.length === 0 ? (
        <Tarjeta style={{ textAlign: "center", padding: "40px 20px", color: C.muted }}>
          Todavía no hay profesionales cargados.
        </Tarjeta>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {medicos.map((m) => {
            const ag = m.agenda || AGENDA_POR_DEFECTO;
            const porSemana = ag.dias.length * horariosDeAgenda({ ...ag, dias: [1] }, "2026-01-05").length;
            return (
              <Tarjeta key={m.legajo} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: SERIF, fontSize: 18 }}>{m.nombre}</div>
                    <div style={{ color: C.muted, fontSize: 13.5, marginTop: 3 }}>
                      {m.especialidad || "Sin especialidad"} · legajo {m.legajo}
                      {!m.agenda && <span style={{ color: C.amber }}> · agenda sin configurar</span>}
                    </div>
                  </div>
                  <Boton variante="borde" onClick={() => setEditando(m)}>Editar agenda</Boton>
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DIAS.map((d) => {
                    const activo = ag.dias.includes(d.n);
                    return (
                      <span key={d.n} style={{ padding: "4px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, background: activo ? C.mint : "#F0F2F1", color: activo ? C.teal : "#A3B0AD", border: `1px solid ${activo ? C.teal + "33" : "transparent"}` }}>
                        {d.corto}
                      </span>
                    );
                  })}
                </div>
                <div style={{ color: C.ink, fontSize: 14, marginTop: 10 }}>
                  {ag.bloques.length === 0 ? "Sin franjas horarias cargadas" : ag.bloques.map((b) => `${b.desde} a ${b.hasta}`).join(" y ")} · turnos de {ag.duracion} min · {porSemana} turnos por semana
                </div>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </>
  );
}

function EditorAgenda({ medico, turnos, onGuardar, onCancelar }) {
  const inicial = medico.agenda || AGENDA_POR_DEFECTO;
  const [dias, setDias] = useState(inicial.dias);
  const [bloques, setBloques] = useState(inicial.bloques.map((b) => ({ ...b })));
  const [duracion, setDuracion] = useState(inicial.duracion);
  const [error, setError] = useState("");

  const agenda = { dias, bloques, duracion };
  const muestra = horariosDeAgenda({ ...agenda, dias: [1] }, "2026-01-05");

  const alternarDia = (n) => setDias((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort()));
  const cambiarBloque = (i, k, v) => setBloques((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));

  const enConflicto = turnos.filter((t) => {
    if (t.legajoMedico !== medico.legajo) return false;
    if (t.estado === "cancelado" || t.estado === "atendido") return false;
    if (t.fecha < hoy()) return false;
    return !horariosDeAgenda(agenda, t.fecha).includes(t.hora);
  });

  const guardar = () => {
    if (dias.length === 0) return setError("Marcá al menos un día de atención.");
    if (bloques.length === 0) return setError("Cargá al menos una franja horaria.");
    for (const b of bloques) {
      if (!b.desde || !b.hasta) return setError("Completá el desde y el hasta de cada franja.");
      if (aMinutos(b.hasta) - aMinutos(b.desde) < duracion) return setError("Hay una franja más corta que la duración de un turno.");
    }
    setError("");
    onGuardar(agenda);
  };

  return (
    <>
      <Titulo titulo={`Agenda de ${medico.nombre}`} bajada={`${medico.especialidad || "Sin especialidad"} · legajo ${medico.legajo}`} />
      <Tarjeta style={{ maxWidth: 560 }}>
        {error && <Aviso tipo="error">{error}</Aviso>}

        <Campo etiqueta="Días que atiende">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DIAS.map((d) => {
              const activo = dias.includes(d.n);
              return (
                <button key={d.n} type="button" onClick={() => alternarDia(d.n)}
                  style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${activo ? C.teal : C.line}`, background: activo ? C.teal : "#fff", color: activo ? "#fff" : C.ink, fontSize: 14, fontWeight: 600, fontFamily: SANS, cursor: "pointer" }}>
                  {d.corto}
                </button>
              );
            })}
          </div>
        </Campo>

        <Campo etiqueta="Franjas horarias" ayuda="Podés cargar más de una, por ejemplo mañana y tarde.">
          <div style={{ display: "grid", gap: 8 }}>
            {bloques.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="time" style={{ ...estiloInput, width: 130 }} value={b.desde} onChange={(e) => cambiarBloque(i, "desde", e.target.value)} />
                <span style={{ color: C.muted, fontSize: 14 }}>a</span>
                <input type="time" style={{ ...estiloInput, width: 130 }} value={b.hasta} onChange={(e) => cambiarBloque(i, "hasta", e.target.value)} />
                <Boton variante="texto" onClick={() => setBloques(bloques.filter((_, j) => j !== i))}>Quitar</Boton>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Boton variante="borde" onClick={() => setBloques([...bloques, { desde: "14:00", hasta: "18:00" }])}>Agregar franja</Boton>
          </div>
        </Campo>

        <Campo etiqueta="Duración de cada turno">
          <select style={estiloInput} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            {[10, 15, 20, 30, 40, 45, 60].map((n) => <option key={n} value={n}>{n} minutos</option>)}
          </select>
        </Campo>

        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Así queda cada día de atención</div>
          {muestra.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>Todavía no hay horarios para mostrar.</p>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {muestra.map((h) => (
                <span key={h} style={{ background: "#fff", border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 9px", fontSize: 13 }}>{h}</span>
              ))}
            </div>
          )}
          <div style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>
            {muestra.length} turnos por día · {muestra.length * dias.length} por semana
          </div>
        </div>

        {enConflicto.length > 0 && (
          <Aviso>
            {enConflicto.length === 1 ? "Hay 1 turno ya reservado" : `Hay ${enConflicto.length} turnos ya reservados`} que quedan fuera de esta agenda. No se borran, pero conviene reprogramarlos desde la pestaña Turnos.
          </Aviso>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <Boton onClick={guardar}>Guardar agenda</Boton>
          <Boton variante="borde" onClick={onCancelar}>Volver</Boton>
        </div>
      </Tarjeta>
    </>
  );
}

/* ── Especialidades ── */
function VistaEspecialidades({ especialidades, guardarEspecialidades, turnos, usuarios }) {
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [aBorrar, setABorrar] = useState(null);

  const enUso = (esp) => ({
    turnos: turnos.filter((t) => t.especialidad === esp && t.estado !== "cancelado" && t.estado !== "atendido").length,
    medicos: Object.values(usuarios).filter((u) => u.especialidad === esp && !u.baja).length,
  });

  const agregar = async () => {
    const v = nueva.trim();
    if (v.length < 3) return setError("Escribí el nombre completo de la especialidad.");
    if (especialidades.some((e) => e.toLowerCase() === v.toLowerCase())) return setError("Esa especialidad ya está en la lista.");
    setError("");
    setNueva("");
    await guardarEspecialidades([...especialidades, v].sort((a, b) => a.localeCompare(b)), v);
  };

  const quitar = async (esp) => {
    await guardarEspecialidades(especialidades.filter((e) => e !== esp), null, esp);
    setABorrar(null);
  };

  return (
    <>
      <Titulo titulo="Especialidades" bajada="Lo que figura acá es lo que pueden elegir los afiliados al pedir un turno." />
      <Tarjeta style={{ marginBottom: 18, maxWidth: 520 }}>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Campo etiqueta="Nueva especialidad">
          <input style={estiloInput} value={nueva} onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === "Enter" && agregar()} placeholder="Dermatología" />
        </Campo>
        <Boton onClick={agregar}>Agregar</Boton>
      </Tarjeta>

      <div style={{ display: "grid", gap: 10 }}>
        {especialidades.map((esp) => {
          const uso = enUso(esp);
          return (
            <Tarjeta key={esp} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: SERIF, fontSize: 18 }}>{esp}</div>
                <div style={{ color: C.muted, fontSize: 13.5, marginTop: 3 }}>
                  {uso.medicos} {uso.medicos === 1 ? "profesional" : "profesionales"} · {uso.turnos} {uso.turnos === 1 ? "turno abierto" : "turnos abiertos"}
                </div>
              </div>
              <Boton variante="texto" onClick={() => setABorrar({ esp, uso })}>Quitar</Boton>
            </Tarjeta>
          );
        })}
      </div>

      {aBorrar && (
        <Confirmacion
          texto={`Quitar ${aBorrar.esp}`}
          detalle={
            aBorrar.uso.turnos > 0
              ? `Hay ${aBorrar.uso.turnos} turnos abiertos en esta especialidad. Van a quedar en la agenda, pero nadie va a poder pedir turnos nuevos.`
              : "Deja de aparecer cuando los afiliados piden turno."
          }
          onSi={() => quitar(aBorrar.esp)}
          onNo={() => setABorrar(null)}
        />
      )}
    </>
  );
}
