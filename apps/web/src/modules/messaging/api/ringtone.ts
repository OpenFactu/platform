/**
 * El timbre de una llamada entrante, generado con Web Audio: dos tonos, dos
 * segundos sonando y dos en silencio, sin ficheros que descargar.
 *
 * El navegador puede bloquear el sonido si aún no se ha tocado la página: en ese
 * caso queda el aviso en pantalla.
 */
const FREQUENCIES = [440, 480];
const ON_SECONDS = 2;
const CYCLE_SECONDS = 4;
const VOLUME = 0.12;
/** Cuánto programar por adelantado: de sobra para los 45 s que suena. */
const CYCLES = 15;

export function startRingtone(): () => void {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return () => undefined;
  }
  void context.resume().catch(() => undefined);

  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(context.destination);
  const start = context.currentTime + 0.05;
  for (let i = 0; i < CYCLES; i++) {
    const at = start + i * CYCLE_SECONDS;
    gain.gain.setValueAtTime(VOLUME, at);
    gain.gain.setValueAtTime(0, at + ON_SECONDS);
  }
  const oscillators = FREQUENCIES.map((frequency) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(start);
    return oscillator;
  });

  return () => {
    oscillators.forEach((o) => o.stop());
    void context.close().catch(() => undefined);
  };
}
