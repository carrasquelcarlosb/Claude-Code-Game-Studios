import * as THREE from 'three';
import { PS2Pipeline } from './ps2.js';
import { buildRoom } from './room.js';
import { CameraRig } from './camera-rig.js';
import { Ambience } from './audio.js';
import { CrtScreen } from './screen.js';
import { Shift, starString } from './shift.js';
import { WorkOS } from './os.js';
import { Input } from './input.js';
import { createOutreach } from './apps/outreach.js';
import { createLedger } from './apps/ledger.js';
import { createMail } from './apps/mail.js';
import { Dread } from './dread.js';
import { Finale } from './finale.js';
import { Atmosphere } from './atmosphere.js';
import { AmbientEvents } from './ambient-events.js';
import { createFigure } from './figure.js';
import { Feeds } from './feeds.js';
import { Haunt } from './haunt.js';

const DATA_FILES = ['tuning', 'ledger', 'mail', 'outreach', 'finale', 'ui', 'ambience', 'haunt'];

/** Boots the game: loads data, builds the room and OS, runs the frame loop. */
async function main() {
  const [cfg, ledgerData, mailData, outreachData, finaleData, uiData, ambienceData, hauntData] = await Promise.all(
    DATA_FILES.map((f) => fetch(`./data/${f}.json`).then((r) => r.json())),
  );
  const canvas = document.getElementById('view');
  const overlay = document.getElementById('start');
  const debug = document.getElementById('debug');
  // Dev tools (overlay and window.__debug) only with ?debug in the URL.
  const DEBUG = new URLSearchParams(location.search).has('debug');
  if (DEBUG) debug.style.display = 'block';

  // Which round this is. Only kept in this browser; nothing leaves the machine.
  const ROUND_KEY = 'round13.round';
  let round = 13;
  try { round = Math.max(13, Number(localStorage.getItem(ROUND_KEY)) || 13); } catch { /* storage blocked */ }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  const resize = () => renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  window.addEventListener('resize', resize);
  resize();

  // --- World and systems ----------------------------------------------------
  const pipeline = new PS2Pipeline(renderer, cfg.render);
  const screen = new CrtScreen();
  const room = buildRoom(cfg, screen.texture, round - 1);
  const rig = new CameraRig(cfg.camera, room.screenCenter);
  // The figure lives in the room but is only drawn into the reflection and
  // the webcam feed, until the end.
  const figure = createFigure(cfg.render.vertexSnap);
  room.scene.add(figure);
  const feeds = new Feeds(renderer, room, figure, rig.camera.position, cfg.feeds);
  const audio = new Ambience(cfg.audio);
  const shift = new Shift(cfg.shift);
  const atmosphere = new Atmosphere(cfg.atmosphere, cfg.lighting, room);
  const ambient = new AmbientEvents(ambienceData, audio);
  const os = new WorkOS(cfg.os, screen, shift, {
    click: () => audio.mouseClick(),
    error: () => audio.errorChime(),
  });
  const dread = new Dread({ audio, os, lights: atmosphere, feeds, figure });
  const finale = new Finale(finaleData, {
    os, shift, audio, round, lights: atmosphere, rig, feeds, figure, dread,
    onEnd: (sum) => showEndCard(sum),
  });
  const onDread = (stage, repeats = 0) => dread.trigger(stage, repeats);
  const haunt = new Haunt(hauntData, { room, audio, os, round });

  // --- Task apps ------------------------------------------------------------
  // The round is complete once every task app reports done.
  const done = new Set();
  const markDone = (id) => () => {
    done.add(id);
    if (done.size === 3) finale.start('complete');
  };

  // Apps keep their state when their window is closed and reopened.
  let ledger = null, mail = null, outreach = null;
  os.install({ id: 'ledger', title: 'Ledger.xls', icon: 'XL', color: '#9cc890',
    create: () => (ledger ||= createLedger(ledgerData, {
      shift, os, sfx: { error: () => audio.errorChime() }, onComplete: markDone('ledger'), onError: onDread,
    })) });
  os.install({
    id: 'mail', icon: '@', color: '#e8e0a0',
    get title() { return `Mail (${mail ? mail.unread() : mailData.messages.length})`; },
    create: () => (mail ||= createMail(mailData, { shift, os, onComplete: markDone('mail'), onDread })),
  });
  os.install({ id: 'outreach', title: 'Outreach', icon: 'OP', color: '#d8a8a8',
    create: () => (outreach ||= createOutreach(outreachData, {
      shift, os, onComplete: markDone('outreach'), onError: onDread,
    })) });

  // The previous operator's sticky note tracks tonight's progress.
  os.note = { ...uiData.note, signoff: uiData.note.signoff.replace('{prevRound}', round - 1) };
  os.principles = uiData.principles;
  os.todo = () => [
    { label: 'Ledger.xls', done: ledger ? ledger.progress() : 0, of: 13 },
    { label: 'Mail', done: mail ? mail.progress() : 0, of: 13 },
    { label: 'Outreach', done: outreach ? outreach.progress() : 0, of: 13 },
  ];
  os.round = round;
  os.onReady = () => shift.start();

  // --- Shift events ---------------------------------------------------------
  shift.on('timeout', () => finale.start('timeout'));
  shift.on('rated', ({ by, stars, delta }) => os.toast(
    `${by} rated you ${starString(stars)}  ${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}`, delta >= 0));
  shift.on('lapseEnd', ({ lapse, cost }) => {
    haunt.onLapseEnd();
    os.dialog({
      title: `Attention Lapse #${lapse}`, alert: true,
      lines: ['The productivity monitor logged an absence', `from your workstation. Rating ★ -${cost.toFixed(2)}.`,
        'Everyone can see it.'],
    });
  });

  // --- Input, pause and end card ---------------------------------------------
  // Pointer lock gates play: clock in to lock, Esc pauses.
  let paused = true;
  let ended = false;
  const input = new Input(canvas, {
    cursor: (dx, dy) => os.moveCursor(dx * cfg.input.cursorSpeed, dy * cfg.input.cursorSpeed),
    look: (dx, dy) => rig.addLook(dx, dy),
    lookHold: (held) => { rig.holding = held; },
    click: (down) => os.click(down),
    key: (e) => {
      // Debug soundboard: letter keys audition each sting (no app uses letters).
      const board = { k: 'knock', c: 'chairCreak', f: 'footsteps', t: 'typing' };
      if (DEBUG && board[e.key]) return dread.trigger({ sound: board[e.key] }, 0);
      if (DEBUG && e.key === 'p') return audio.phone([0.5, 0.8, 3.4]);
      if (!e.repeat) { audio.keyClack(); if (shift.running) haunt.onKey(shift.progress); }
      os.key(e);
    },
    lock: (locked) => {
      if (ended) return;
      paused = !locked;
      overlay.style.display = locked ? 'none' : 'flex';
      overlay.querySelector('.go').textContent = 'PAUSED: CLICK TO RETURN TO WORK';
    },
  });
  overlay.addEventListener('click', () => {
    if (ended) {
      try { localStorage.setItem(ROUND_KEY, String(round + 1)); } catch { /* storage blocked */ }
      location.reload();
      return;
    }
    audio.start();
    input.lock();
  });

  /** Replaces the play view with the end-of-round card. */
  const showEndCard = (sum) => {
    ended = true;
    ambient.stopAll();
    if (document.pointerLockElement) document.exitPointerLock();
    const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => ({ round, nextRound: round + 1 })[k]);
    overlay.innerHTML = '';
    const lines = [
      [fill(finaleData.endCard[sum.outcome]), 'font-size:22px;color:#c8e8d8;margin-bottom:18px'],
      [`Tasks completed: ${sum.tasks} / 39`], [`Final rating: ${sum.rating}`],
      [`Times you looked away: ${sum.lapses}`], [`Time remaining: ${sum.left}`],
      [fill(finaleData.endCard.continue), 'margin-top:26px;color:#7a9a8c'],
    ];
    for (const [text, style] of lines) {
      const p = document.createElement('div');
      p.textContent = text;
      p.style.cssText = `margin:4px 0;${style || ''}`;
      overlay.appendChild(p);
    }
    overlay.style.display = 'flex';
  };

  if (DEBUG) window.__debug = { rig, room, os, shift, dread, finale, atmosphere, ambient, feeds, figure, haunt, setPaused: (p) => { paused = p; } };

  // --- Frame loop -------------------------------------------------------------
  const clock = new THREE.Clock();
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    rig.update(dt);
    dread.update(dt);
    audio.setListenerYaw(rig.restYaw + rig.yaw);
    if (!paused) {
      os.update(dt);
      finale.update(dt);
      shift.update(dt, rig.lookingAway);
      if (shift.running) {
        ambient.update(shift.progress * cfg.shift.durationSec, rig.lookingAway);
        haunt.update(shift.progress, rig.lookingAway);
      }
    }
    // Mood: bright and sterile at clock-in, draining with time and rating.
    // The office is as gloomy as the worse of time, rating, and how far the dark has come.
    const gloom = finale.active ? 1
      : Math.max(atmosphere.gloomFor(shift.progress, shift.rating, cfg.shift.startingRating), haunt.darkness);
    audio.setBuzz(atmosphere.update(dt, gloom));
    pipeline.uniforms.uExposure.value = atmosphere.exposure;
    audio.setTension(shift.progress, shift.running && shift.remaining < 60);
    os.draw();
    pipeline.uniforms.uGlitch.value = (rig.lookingAway && !finale.active ? 0.15 + rig.awayAmount * 0.5 : 0)
      + dread.glitch + finale.glitch;
    feeds.update(dt);
    pipeline.render(room.scene, rig.camera, t);
    if (DEBUG) debug.textContent = `away: ${rig.lookingAway ? 'YES' : 'no'}  lapses: ${shift.lapses}  ` +
      `clock: ${shift.clockText()}  rating: ${shift.ratingText()}  gloom: ${atmosphere.gloom.toFixed(2)}\n` +
      'RMB hold = look around   Esc = pause   sounds: k knock  c creak  f steps  t typing  p phone';
    requestAnimationFrame(frame);
  };
  frame();
}

main();
