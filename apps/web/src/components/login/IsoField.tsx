import React, { useEffect, useRef } from 'react';

/**
 * Campo isométrico animado para el panel izquierdo del Login.
 *
 * Dibuja una rejilla de cubos en perspectiva isométrica. Cada cubo tiene un
 * ciclo independiente de "construcción → idle → desvanecido" de forma
 * escalonada, creando la sensación de un sistema vivo (pipelines, stock,
 * operaciones fluyendo). Implementado en canvas para mantener el coste bajo.
 */
export const IsoField: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let width = 0;
    let height = 0;
    const tileW = 48; // ancho proyectado
    const tileH = 28; // alto proyectado (2:1 aprox para iso)

    interface Cube {
      gx: number;
      gy: number;
      phase: number; // 0..1
      speed: number; // fracción de fase por frame
      hue: 'teal' | 'blue' | 'violet';
    }
    let cubes: Cube[] = [];

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Genera una rejilla que cubra toda la pantalla en proyección iso
      const cols = Math.ceil(width / tileW) + 6;
      const rows = Math.ceil(height / tileH) + 10;
      cubes = [];
      for (let gy = -rows; gy < rows; gy++) {
        for (let gx = -cols; gx < cols; gx++) {
          // Mucha densidad se vuelve ruidosa — filtrar
          if ((gx + gy) % 2 !== 0) continue;
          if (Math.random() > 0.42) continue;
          const r = Math.random();
          cubes.push({
            gx,
            gy,
            phase: Math.random(),
            speed: 0.0012 + Math.random() * 0.0018,
            hue: r < 0.7 ? 'teal' : r < 0.9 ? 'blue' : 'violet',
          });
        }
      }
    };

    rebuild();
    const onResize = () => rebuild();
    window.addEventListener('resize', onResize);

    // Proyecta coordenadas de rejilla (gx, gy) a pantalla.
    // Origen: centro-superior del canvas.
    const project = (gx: number, gy: number) => {
      const cx = width * 0.5;
      const cy = height * 0.15;
      const x = cx + (gx - gy) * (tileW / 2);
      const y = cy + (gx + gy) * (tileH / 2);
      return { x, y };
    };

    const COLORS: Record<Cube['hue'], { top: string; left: string; right: string; edge: string }> =
      {
        teal: {
          top: 'rgba(45,184,176,0.55)',
          left: 'rgba(10,110,99,0.65)',
          right: 'rgba(13,148,136,0.75)',
          edge: 'rgba(94,234,212,0.85)',
        },
        blue: {
          top: 'rgba(96,165,250,0.45)',
          left: 'rgba(30,64,175,0.6)',
          right: 'rgba(59,130,246,0.7)',
          edge: 'rgba(147,197,253,0.75)',
        },
        violet: {
          top: 'rgba(167,139,250,0.4)',
          left: 'rgba(91,33,182,0.55)',
          right: 'rgba(139,92,246,0.65)',
          edge: 'rgba(196,181,253,0.7)',
        },
      };

    const drawCube = (cx: number, cy: number, h: number, alpha: number, hue: Cube['hue']) => {
      const half = tileW / 2;
      const quarter = tileH / 2;
      const c = COLORS[hue];

      // cara superior (rombo)
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h);
      ctx.lineTo(cx + half, cy - h + quarter);
      ctx.lineTo(cx, cy - h + tileH);
      ctx.lineTo(cx - half, cy - h + quarter);
      ctx.closePath();
      ctx.fillStyle = c.top;
      ctx.fill();

      // cara izquierda
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - h + quarter);
      ctx.lineTo(cx - half, cy + quarter);
      ctx.lineTo(cx, cy + tileH);
      ctx.lineTo(cx, cy - h + tileH);
      ctx.closePath();
      ctx.fillStyle = c.left;
      ctx.fill();

      // cara derecha
      ctx.beginPath();
      ctx.moveTo(cx + half, cy - h + quarter);
      ctx.lineTo(cx + half, cy + quarter);
      ctx.lineTo(cx, cy + tileH);
      ctx.lineTo(cx, cy - h + tileH);
      ctx.closePath();
      ctx.fillStyle = c.right;
      ctx.fill();

      // arista superior (brillo)
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy - h + quarter);
      ctx.lineTo(cx, cy - h);
      ctx.lineTo(cx + half, cy - h + quarter);
      ctx.stroke();
    };

    // Ordena cubos por profundidad para pintar de atrás hacia adelante
    const sortByDepth = (a: Cube, b: Cube) => a.gx + a.gy - (b.gx + b.gy);

    let raf = 0;
    let last = performance.now();
    const render = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;

      ctx.clearRect(0, 0, width, height);

      cubes.sort(sortByDepth);
      for (const cube of cubes) {
        cube.phase += cube.speed * dt;
        if (cube.phase > 1) cube.phase -= 1;

        // envelope: 0..0.35 crece · 0.35..0.65 idle · 0.65..1 decrece
        let amp = 0;
        if (cube.phase < 0.35) amp = cube.phase / 0.35;
        else if (cube.phase < 0.65) amp = 1;
        else amp = 1 - (cube.phase - 0.65) / 0.35;

        if (amp <= 0.02) continue;

        const { x, y } = project(cube.gx, cube.gy);
        if (x < -80 || x > width + 80 || y < -80 || y > height + 120) continue;

        const h = amp * 22; // altura máx ~22px
        const alpha = amp * 0.9;
        drawCube(x, y, h, alpha, cube.hue);
      }

      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    />
  );
};
