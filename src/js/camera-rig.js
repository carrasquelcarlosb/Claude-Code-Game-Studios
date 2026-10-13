import * as THREE from 'three';

/**
 * Seated first-person camera. At rest it stares at the monitor. While the look
 * button is held, mouse movement turns the head (smoothed); on release the view
 * eases back to the screen. Reports whether the player is looking away.
 */
export class CameraRig {
  /**
   * @param {object} cfg tuning.json `camera` block
   * @param {THREE.Vector3} target world point the camera rests on (screen centre)
   */
  constructor(cfg, target) {
    this.cfg = cfg;
    this.camera = new THREE.PerspectiveCamera(cfg.workFov, 4 / 3, 0.05, 60);
    this.camera.position.set(0, cfg.eyeHeight, 0);
    this.camera.rotation.order = 'YXZ';

    const d = target.clone().sub(this.camera.position);
    this.restYaw = Math.atan2(-d.x, -d.z);
    this.restPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    // Offsets from the rest pose: where the head is, and where it is heading.
    this.yaw = 0; this.pitch = 0;
    this.targetYaw = 0; this.targetPitch = 0;
    /** Whether the look button is currently held. */
    this.holding = false;
    /** True while the view is far enough off the monitor to be penalised. */
    this.lookingAway = false;
    /** 0..1 how far the view is from the monitor, for effects. */
    this.awayAmount = 0;
  }

  /**
   * Applies raw mouse movement to the head target while looking.
   * @param {number} dx horizontal movement in pixels
   * @param {number} dy vertical movement in pixels
   */
  addLook(dx, dy) {
    const k = this.cfg.lookSensitivity;
    const maxYaw = THREE.MathUtils.degToRad(this.cfg.maxYawDeg);
    const maxPitch = THREE.MathUtils.degToRad(this.cfg.maxPitchDeg);
    this.targetYaw = THREE.MathUtils.clamp(this.targetYaw - dx * k, -maxYaw, maxYaw);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * k, -maxPitch, maxPitch);
  }

  /**
   * Advances easing and updates look-away state.
   * @param {number} dt seconds since last frame
   */
  update(dt) {
    if (!this.holding) {
      const r = 1 - Math.exp(-this.cfg.returnSpeed * dt);
      this.targetYaw -= this.targetYaw * r;
      this.targetPitch -= this.targetPitch * r;
    }
    const s = 1 - Math.exp(-this.cfg.lookSmoothing * dt);
    this.yaw += (this.targetYaw - this.yaw) * s;
    this.pitch += (this.targetPitch - this.pitch) * s;
    this.camera.rotation.set(this.restPitch + this.pitch, this.restYaw + this.yaw, 0);

    const offDeg = THREE.MathUtils.radToDeg(Math.hypot(this.yaw, this.pitch));
    this.lookingAway = offDeg > this.cfg.lookAwayThresholdDeg;
    this.awayAmount = THREE.MathUtils.clamp(offDeg / 120, 0, 1);

    const fovT = THREE.MathUtils.smoothstep(offDeg, 0, this.cfg.lookAwayThresholdDeg);
    this.camera.fov = THREE.MathUtils.lerp(this.cfg.workFov, this.cfg.lookFov, fovT);
    this.camera.updateProjectionMatrix();
  }
}
