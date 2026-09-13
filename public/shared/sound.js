'use strict';
/* Perfect Games — procedural game audio (WebAudio synthesis, no files).
   All sounds are synthesized: chips, cards, chimes, fanfares. */

const Snd = (() => {
  let ctx = null;
  let master = null;
  let enabled = true;
  let noiseBuf = null;

  function ac() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
        const len = ctx.sampleRate * 1.2;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function env(g, t, peak, dur, attack = 0.004) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function osc(type, freq, t, dur, vol, slideTo, dest) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    env(g, t, vol, dur);
    o.connect(g); g.connect(dest || master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, vol, filterType, freq, freqEnd, q, dest) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    env(g, t, vol, dur);
    src.connect(f); f.connect(g); g.connect(dest || master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  const snd = {
    unlock() { ac(); },
    _ac() { return ac(); },
    _enabled() { return enabled; },
    setEnabled(v) { enabled = v; },

    click() { if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime; osc('sine', 620, t, 0.06, 0.05, 420); },

    cardSelect() {
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 760, t, 0.08, 0.07, 520);
      noise(t, 0.05, 0.04, 'highpass', 4000);
    },

    cardPlay() { // swish of playing a card
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.18, 0.09, 'bandpass', 1800, 600, 2);
      osc('sine', 320, t, 0.1, 0.05, 180);
    },

    chipPlace() { // satisfying "thock"
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('sine', 165, t, 0.16, 0.5, 55);
      osc('triangle', 340, t, 0.06, 0.18, 160);
      noise(t, 0.03, 0.22, 'lowpass', 900, 200, 1);
      osc('sine', 88, t + 0.03, 0.22, 0.4, 40);
    },

    chipRemove() { // whoosh up
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.24, 0.16, 'bandpass', 500, 2400, 1.6);
      osc('sine', 220, t, 0.22, 0.08, 640);
    },

    deadSwap() { // paper shuffle
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.12, 0.1, 'bandpass', 2500, 900, 1.2);
      noise(t + 0.09, 0.1, 0.07, 'bandpass', 3000, 1200, 1.2);
      osc('sine', 480, t + 0.05, 0.06, 0.05, 620);
    },

    turnChime() { // your turn — pleasant two-note ding
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('sine', 660, t, 0.5, 0.12);
      osc('sine', 990, t, 0.55, 0.07);
      osc('sine', 1320, t + 0.02, 0.35, 0.04);
    },

    sequence() { // sparkle when a sequence completes
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => {
        osc('triangle', f, t + i * 0.07, 0.3, 0.09);
        osc('sine', f * 2, t + i * 0.07, 0.22, 0.03);
      });
    },

    win() { // triumphant fanfare
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((f, i) => osc('triangle', f, t + i * 0.11, 0.5, 0.12));
      // chord on top
      osc('triangle', 523, t + 0.55, 1.0, 0.1);
      osc('triangle', 659, t + 0.55, 1.0, 0.1);
      osc('triangle', 784, t + 0.55, 1.0, 0.1);
      osc('triangle', 1046, t + 0.55, 1.2, 0.12);
      noise(t + 0.55, 0.5, 0.05, 'highpass', 5000, 9000, 1);
    },

    lose() { // gentle downward
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      [660, 523, 415, 330].forEach((f, i) => osc('sine', f, t + i * 0.14, 0.35, 0.08));
    },

    chat() { // soft pop
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('sine', 880, t, 0.08, 0.06, 700);
    },

    error() {
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('square', 170, t, 0.14, 0.06, 120);
    },

    /* ---------- ludo sounds ---------- */
    roll() { // dice shake + thud
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.16, 0.1, 'bandpass', 900, 500, 1.5);
      for (let i = 0; i < 4; i++) noise(t + i * 0.045, 0.035, 0.06, 'bandpass', 1500 + i * 400, 800, 4);
      osc('sine', 120, t + 0.2, 0.12, 0.28, 60); // thud
    },
    tokenStep() { // small hop when a token moves
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 420, t, 0.07, 0.09, 620);
    },
    capture() { // pop + descending blip
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('square', 320, t, 0.1, 0.12, 160);
      noise(t, 0.08, 0.12, 'bandpass', 1200, 300, 2);
      osc('sine', 880, t + 0.05, 0.09, 0.08, 440);
    },
    tokenHome() { // little chime when a token arrives
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 660, t, 0.18, 0.1);
      osc('triangle', 990, t + 0.08, 0.25, 0.09);
    },
    rollExtra() { // you rolled a 6 — bright ding
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 784, t, 0.16, 0.1);
      osc('triangle', 1175, t + 0.06, 0.22, 0.08);
    },

    /* ---------- uno sounds ---------- */
    unoPlay() { // crisp card slap
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.14, 0.12, 'bandpass', 2200, 700, 1.6);
      osc('sine', 300, t, 0.09, 0.09, 190);
    },
    unoDraw() { // card slide
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      noise(t, 0.18, 0.1, 'bandpass', 1200, 2400, 1.4);
    },
    unoCall() { // UNO! fanfare blip
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 880, t, 0.14, 0.11);
      osc('triangle', 1320, t + 0.09, 0.2, 0.1);
    },
    unoPenalty() { // draw 2/4 thud
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('square', 180, t, 0.12, 0.09, 110);
      noise(t + 0.05, 0.08, 0.1, 'lowpass', 800, 300, 1);
    },

    /* ---------- tambola sounds ---------- */
    bingoCall() { // bright ding when a number is called
      if (!enabled) return; const c = ac(); if (!c) return; const t = c.currentTime;
      osc('triangle', 880, t, 0.16, 0.1);
      osc('triangle', 1318, t + 0.07, 0.2, 0.08);
      noise(t, 0.05, 0.03, 'highpass', 5000);
    },
  };

  return snd;
})();

/* ============================================================
 * Background music: REMOVED on request (keep board/UI sounds).
 * Snd.startMusic / stopMusic are kept as harmless no-ops so
 * every game client still works unchanged.
 * ============================================================ */
Snd.startMusic = function () { /* music removed */ };
Snd.stopMusic = function () { /* music removed */ };
