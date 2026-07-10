// Beep de feedback (éxito/error) al escanear. Interfaz CONGELADA (§3 del plan).
// Port EXACTO del WebAudio de test2.md (generarBeep). AudioContext singleton
// lazy con resume (los navegadores lo crean "suspended" hasta el primer gesto
// del usuario). Guard `typeof window` para poder importar este módulo desde
// código que también corre server-side sin romper el build.
let _ctx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!_ctx) _ctx = new Ctx();
  return _ctx;
}

export function beep(tipo) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (tipo === 'success') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  } else {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  }

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
}
