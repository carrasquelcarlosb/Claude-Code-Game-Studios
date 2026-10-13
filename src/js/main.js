import * as THREE from 'three';
import { PS2Pipeline } from './ps2.js';
import { buildRoom } from './room.js';
import { CameraRig } from './camera-rig.js';
import { Ambience } from './audio.js';
import { CrtScreen } from './screen.js';
import { Shift } from './shift.js';
import { WorkOS } from './os.js';
import { Input } from './input.js';
import { placeholderApp } from './apps/placeholder.js';
import { createLedger } from './apps/ledger.js';
import { createMail } from './apps/mail.js';

/** Boots the game: loads tuning, builds the room and OS, runs the frame loop. */
async function main() {
  const [cfg, ledgerData, mailData] = await Promise.all(
    ['./data/tuning.json', './data/ledger.json', './data/mail.json'].map((u) => fetch(u).then((r) => r.json())),
  );
  const canvas = document.getElementById('view');
  const debug = document.getElementById('debug');
  const overlay = document.getElementById('start');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  const resize = () => renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  window.addEventListener('resize', resize);
  resize();

  const pipeline = new PS2Pipeline(renderer, cfg.render);
  const screen = new CrtScreen();
  const room = buildRoom(cfg, screen.texture);
  const rig = new CameraRig(cfg.camera, room.screenCenter);
  const audio = new Ambience(cfg.audio);
  const shift = new Shift(cfg.shift);
  const os = new WorkOS(cfg.os, screen, shift, {
    click: () => audio.mouseClick(),
    error: () => audio.errorChime(),
  });

  // The ledger keeps its state when its window is closed and reopened.
  let ledger = null;
  os.install({ id: 'ledger', title: 'Ledger.xls', icon: 'XL', color: '#9cc890',
    create: () => (ledger ||= createLedger(ledgerData, { shift, os, sfx: { error: () => audio.errorChime() } })) });
  let mail = null;
  os.install({
    id: 'mail', icon: '@', color: '#e8e0a0',
    get title() { return `Mail (${mail ? mail.unread() : mailData.messages.length})`; },
    create: () => (mail ||= createMail(mailData, { shift, os })),
  });
  os.install({ id: 'outreach', title: 'Outreach', icon: 'OP', color: '#d8a8a8',
    create: () => placeholderApp('Outreach Pro 3.1', ['Campaigns awaiting approval: 13', '', 'Module installing...']) });
  os.onReady = () => shift.start();

  shift.on('lapseEnd', ({ lapse, cost }) => {
    os.dialog({
      title: `Attention Lapse #${lapse}`, alert: true,
      lines: ['The productivity monitor logged an absence', `from your workstation. $${cost.toFixed(2)} has been deducted.`,
        'The shift clock does not wait for you.'],
    });
  });

  // Pointer lock gates play: clock in to lock, Esc pauses.
  let paused = true;
  const input = new Input(canvas, {
    cursor: (dx, dy) => os.moveCursor(dx * cfg.input.cursorSpeed, dy * cfg.input.cursorSpeed),
    look: (dx, dy) => rig.addLook(dx, dy),
    lookHold: (held) => { rig.holding = held; },
    click: (down) => os.click(down),
    key: (e) => { if (!e.repeat) audio.keyClack(); os.key(e); },
    lock: (locked) => {
      paused = !locked;
      overlay.style.display = locked ? 'none' : 'flex';
      overlay.textContent = 'PAUSED: CLICK TO RETURN TO WORK';
    },
  });
  overlay.addEventListener('click', () => { audio.start(); input.lock(); });

  // Fluorescent flicker: occasional bursts of rapid on/off.
  let flickerLeft = 0;
  const updateFlicker = (dt) => {
    if (flickerLeft <= 0 && Math.random() < cfg.lighting.flickerChancePerSecond * dt) {
      flickerLeft = 0.15 + Math.random() * 0.6;
    }
    let level = 1;
    if (flickerLeft > 0) {
      flickerLeft -= dt;
      level = Math.random() < 0.5 ? 0.05 : 0.8 + Math.random() * 0.4;
    }
    room.fluorescent.intensity = cfg.lighting.fluorescentIntensity * level;
    room.monitorLight.intensity = cfg.lighting.monitorIntensity * (0.95 + Math.random() * 0.05);
    audio.setBuzz(level < 0.5 ? 0.3 : 1 + (flickerLeft > 0 ? 1.5 : 0));
  };

  window.__debug = { rig, room, os, shift, setPaused: (p) => { paused = p; } }; // dev inspection hook

  const clock = new THREE.Clock();
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    rig.update(dt);
    updateFlicker(dt);
    if (!paused) {
      os.update(dt);
      shift.update(dt, rig.lookingAway);
    }
    os.draw();
    pipeline.uniforms.uGlitch.value = rig.lookingAway ? 0.15 + rig.awayAmount * 0.5 : 0;
    pipeline.render(room.scene, rig.camera, t);
    debug.textContent = `away: ${rig.lookingAway ? 'YES' : 'no'}  lapses: ${shift.lapses}  ` +
      `clock: ${shift.clockText()}  pay: ${shift.payText()}\nRMB hold = look around   Esc = pause`;
    requestAnimationFrame(frame);
  };
  frame();
}

main();
