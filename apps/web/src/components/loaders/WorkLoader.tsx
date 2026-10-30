import React, { useEffect, useRef, useState } from 'react';
import './workLoader.css';

/**
 * Cargador con escenas del almacén: alguien cargando un camión, una carretilla
 * subiendo un palé, cajas que se apilan y una factura que sale de la impresora.
 * Una escena por carga: cada vez que aparece toca la siguiente a la de la
 * última vez, y no cambia mientras dura la carga. SVG + CSS (workLoader.css),
 * con los colores del tema.
 */

const Ground = () => <line className="kl-ground" x1="4" y1="72" x2="156" y2="72" />;

const Truck = () => (
  <>
    <Ground />
    {/* Camión: caja de carga abierta, cabina y ruedas */}
    <rect className="kl-stroke" x="96" y="30" width="40" height="34" rx="2" />
    <path className="kl-stroke" d="M136 42 h12 l6 9 v13 h-18 z" />
    <path className="kl-stroke" d="M139 45 h7 l3 5 h-10 z" />
    <circle className="kl-stroke" cx="106" cy="66" r="5" />
    <circle className="kl-stroke" cx="146" cy="66" r="5" />
    <rect x="118" y="50" width="12" height="12" rx="1" fill="var(--kl-soft)" />
    <g className="kl-loaded">
      <rect className="kl-box" x="102" y="50" width="12" height="12" rx="1" />
    </g>
    {/* Persona con la caja */}
    <g className="kl-walker">
      <circle className="kl-stroke" cx="22" cy="33" r="4" />
      <line className="kl-stroke" x1="22" y1="37" x2="22" y2="54" />
      <line className="kl-stroke kl-leg-a" x1="22" y1="54" x2="22" y2="70" />
      <line className="kl-stroke kl-leg-b" x1="22" y1="54" x2="22" y2="70" />
      <path className="kl-stroke" d="M22 42 l6 3" />
      <g className="kl-carried">
        <rect className="kl-box" x="27" y="39" width="12" height="12" rx="1" />
        <line className="kl-box-line" x1="33" y1="39" x2="33" y2="51" />
      </g>
    </g>
  </>
);

const Wheel = ({ cx }: { cx: number }) => (
  <g className="kl-wheel">
    <circle className="kl-stroke" cx={cx} cy="66" r="5" />
    <line className="kl-stroke" x1={cx} y1="62" x2={cx} y2="70" />
  </g>
);

const Forklift = () => (
  <>
    <Ground />
    <g className="kl-forklift">
      <path className="kl-stroke" d="M36 50 h26 v14 h-26 z" />
      <path className="kl-stroke" d="M42 50 v-16 h14 l4 16" />
      <line className="kl-stroke" x1="66" y1="26" x2="66" y2="64" />
      <Wheel cx={42} />
      <Wheel cx={58} />
      <g className="kl-fork">
        <path className="kl-stroke" d="M66 63 h18" />
        <rect x="68" y="59" width="16" height="3" rx="1" fill="var(--kl-soft)" />
        <rect className="kl-box" x="70" y="46" width="12" height="13" rx="1" />
        <line className="kl-box-line" x1="76" y1="46" x2="76" y2="59" />
      </g>
    </g>
  </>
);

const Stack = () => (
  <>
    <Ground />
    <rect x="58" y="66" width="44" height="5" rx="1" fill="var(--kl-soft)" />
    {[
      { x: 60, y: 51, cls: 'kl-drop' },
      { x: 82, y: 51, cls: 'kl-drop kl-drop-2' },
      { x: 71, y: 36, cls: 'kl-drop kl-drop-3' },
    ].map((b) => (
      <g key={`${b.x}-${b.y}`} className={b.cls}>
        <rect className="kl-box" x={b.x} y={b.y} width="18" height="15" rx="1" />
        <line className="kl-box-line" x1={b.x + 9} y1={b.y} x2={b.x + 9} y2={b.y + 15} />
      </g>
    ))}
  </>
);

const Receipt = () => (
  <>
    <rect className="kl-stroke" x="52" y="20" width="56" height="20" rx="3" />
    <line className="kl-stroke" x1="60" y1="40" x2="100" y2="40" />
    <circle className="kl-led" cx="100" cy="27" r="2" fill="var(--kl-accent)" />
    <g className="kl-paper">
      <rect
        x="62"
        y="40"
        width="36"
        height="34"
        rx="1"
        fill="var(--bg-card, #fff)"
        stroke="var(--kl-soft)"
      />
      <line className="kl-ground" x1="67" y1="48" x2="88" y2="48" />
      <line className="kl-ground" x1="67" y1="54" x2="92" y2="54" />
      <line className="kl-ground" x1="67" y1="60" x2="84" y2="60" />
      <line x1="76" y1="68" x2="93" y2="68" stroke="var(--kl-accent)" strokeWidth="2.5" />
    </g>
  </>
);

const SCENES = [Truck, Forklift, Stack, Receipt];

/**
 * Escena del próximo cargador: así se van alternando. Se guarda en
 * sessionStorage para que también cambie al recargar la página entera (si no,
 * el arranque sería siempre el camión).
 */
const STORAGE_KEY = 'keirost:loader-scene';
let nextScene = (() => {
  try {
    return Number(sessionStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
})();

function advanceScene() {
  nextScene = (nextScene % SCENES.length) + 1;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(nextScene));
  } catch {
    /* almacenamiento bloqueado: se alterna igual dentro de la sesión */
  }
}

export const WorkLoader: React.FC<{
  className?: string;
  /** Escena fija (0–3: camión, carretilla, cajas, factura), sin consumir el turno del cargador. */
  scene?: number;
}> = ({ className, scene: fixed }) => {
  // Leer en el inicializador y avanzar en un efecto con guarda: en modo estricto
  // React llama dos veces al inicializador y monta dos veces, y sin esto el
  // contador saltaba de dos en dos y solo se veían dos escenas.
  const [turn] = useState(() => nextScene % SCENES.length);
  const scene = fixed ?? turn;
  const advanced = useRef(false);
  useEffect(() => {
    if (fixed !== undefined || advanced.current) return;
    advanced.current = true;
    advanceScene();
  }, [fixed]);
  const Scene = SCENES[scene];
  return (
    <svg
      viewBox="0 0 160 80"
      width="160"
      height="80"
      aria-hidden="true"
      className={['kl', className].filter(Boolean).join(' ')}
    >
      <g className="kl-scene">
        <Scene />
      </g>
    </svg>
  );
};
