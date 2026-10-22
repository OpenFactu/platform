import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Preserve hook state while replaying effects, as development Fast Refresh does.
function hooks() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let refresh = false;
  const changed = (a, b) => !a || a.length !== b.length || a.some((v, i) => v !== b[i]);
  return {
    useRef(value) {
      const i = cursor++;
      return (slots[i] ??= { current: value });
    },
    useState(value) {
      const i = cursor++;
      slots[i] ??= { value };
      return [
        slots[i].value,
        (next) => {
          slots[i].value = next;
        },
      ];
    },
    useCallback(fn) {
      cursor++;
      return fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (refresh || changed(slots[i]?.deps, deps))
        pending.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
    },
    render(fn, replay = false) {
      cursor = 0;
      refresh = replay;
      pending = [];
      const result = fn();
      pending.forEach((run) => run());
      refresh = false;
      return result;
    },
    dispose() {
      slots.forEach((slot) => slot?.cleanup?.());
    },
  };
}
class Audio {
  static notes = 0;
  static latest;
  state = 'suspended';
  currentTime = 0;
  destination = {};
  constructor() {
    Audio.latest = this;
  }
  async resume() {
    this.state = 'running';
    this.onstatechange?.();
  }
  async suspend() {
    this.state = 'suspended';
    this.onstatechange?.();
  }
  async close() {
    this.state = 'closed';
    this.onstatechange?.();
  }
  createOscillator() {
    return {
      frequency: {},
      connect() {},
      disconnect() {},
      start() {
        Audio.notes++;
      },
      stop() {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {},
    };
  }
}
const source = readFileSync(
  new URL('../src/modules/hr/hooks/useKioskSound.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const hookRuntime = hooks();
globalThis.__kioskSoundTestHooks = hookRuntime;
globalThis.AudioContext = Audio;
const code = outputText.replace(
  /import\s*\{([^}]+)\}\s*from ['"]react['"];?/,
  'const {$1} = globalThis.__kioskSoundTestHooks;',
);
const { useKioskSound } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

test('recognition sounds once, and a refreshed or suspended context cannot show sound as active', async () => {
  let identity;
  let feedback;
  const render = (replay = false) =>
    hookRuntime.render(() => useKioskSound(true, identity, feedback), replay);
  let sound = render();
  await sound.toggle();
  sound = render();
  assert.equal(sound.enabled, true);
  identity = 'recognition-1';
  const before = Audio.notes;
  render();
  render();
  assert.equal(Audio.notes, before + 1, 'one sound per identity, not per poll');
  feedback = { ok: false, message: 'Tarjeta no reconocida.', eventId: 'failed-reading' };
  const beforeError = Audio.notes;
  render();
  render();
  assert.equal(Audio.notes, beforeError + 2, 'an error plays once despite repeated polling');
  feedback = { ok: true, message: 'Fichaje registrado.' };
  render();
  assert.equal(Audio.notes, beforeError + 4, 'a confirmed punch has its own feedback');
  render(true);
  sound = render();
  assert.equal(
    sound.enabled,
    false,
    'effect cleanup closes audio and must reset the visible enabled state',
  );
  await sound.toggle();
  sound = render();
  assert.equal(sound.enabled, true);
  await Audio.latest.suspend();
  sound = render();
  assert.equal(sound.enabled, false, 'browser suspension must be reflected in the control');
  await sound.testSound();
  sound = render();
  assert.equal(sound.enabled, true, 'the test button restores suspended audio');
  hookRuntime.dispose();
});
