import * as THREE from 'three';

/**
 * Two extra views of the room, both of which can show the figure while the
 * player's own eyes cannot:
 *
 * - The reflection: when the CRT goes dark, its glass shows the room behind
 *   the player, mirrored and dim.
 * - The webcam: a grainy, low-frame-rate view from behind and above the
 *   player's chair, drawn into a 2D canvas the OS can show in a window.
 *
 * The figure is made visible only for these renders unless `figureInWorld`.
 */
export class Feeds {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {ReturnType<import('./room.js').buildRoom>} room
   * @param {ReturnType<import('./figure.js').createFigure>} figure
   * @param {THREE.Vector3} eye the player's eye position
   * @param {object} cfg tuning.json `feeds` block
   */
  constructor(renderer, room, figure, eye, cfg) {
    this.renderer = renderer;
    this.room = room;
    this.figure = figure;
    this.cfg = cfg;
    /** When true the figure is also visible to the player's own camera. */
    this.figureInWorld = false;

    // Mirror camera sits on the screen glass, looking back at the chair.
    this.mirrorCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 40);
    this.mirrorCam.position.copy(room.screenCenter).add(new THREE.Vector3(0, 0, 0.03));
    this.mirrorCam.lookAt(eye.clone().add(new THREE.Vector3(0, 0.05, 1)));
    this.mirrorTarget = new THREE.WebGLRenderTarget(cfg.reflectionSize[0], cfg.reflectionSize[1], {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.mirrorTarget.texture.wrapS = THREE.RepeatWrapping;
    this.mirrorTarget.texture.repeat.x = -1; // mirror image
    this.mirrorTarget.texture.offset.x = 1;
    this.reflectLeft = 0;
    this.screenMap = room.screenMesh.material.map;
    this.screenColor = room.screenMesh.material.color.clone();

    // Webcam: clipped to the top of the monitor, looking back at the chair
    // and the office behind it.
    this.camCam = new THREE.PerspectiveCamera(58, 4 / 3, 0.05, 40);
    this.camCam.position.set(...cfg.webcamPos);
    this.camCam.lookAt(new THREE.Vector3(...cfg.webcamLookAt));
    const [w, h] = cfg.webcamSize;
    this.camTarget = new THREE.WebGLRenderTarget(w, h);
    this.pixels = new Uint8Array(w * h * 4);
    /** The latest webcam frame, ready to draw into the OS. */
    this.webcamCanvas = document.createElement('canvas');
    this.webcamCanvas.width = w; this.webcamCanvas.height = h;
    this.webcamCtx = this.webcamCanvas.getContext('2d');
    this.webcamImage = this.webcamCtx.createImageData(w, h);
    this.webcamOn = false;
    this.webcamClock = 0;
    // Render targets hold linear light; encode to sRGB when copying out.
    this.toSrgb = new Uint8Array(256).map((_, i) => Math.round(255 * Math.pow(i / 255, 1 / 2.2)));
  }

  /**
   * Shows the room behind the player in the dark CRT glass for a while.
   * @param {number} seconds
   */
  reflect(seconds) {
    this.reflectLeft = Math.max(this.reflectLeft, seconds);
  }

  /** Renders the extra views due this frame and sets the figure for the main view. */
  update(dt) {
    const fig = this.figure, mat = this.room.screenMesh.material;
    const posed = !!fig.userData.pose;

    if (this.reflectLeft > 0) {
      this.reflectLeft -= dt;
      fig.visible = posed;
      // The glass itself must not be drawn into its own reflection (WebGL
      // feedback loop): the mirror camera sits too close for it to be culled.
      this.room.screenMesh.visible = false;
      this.renderer.setRenderTarget(this.mirrorTarget);
      this.renderer.render(this.room.scene, this.mirrorCam);
      this.room.screenMesh.visible = true;
      mat.map = this.mirrorTarget.texture;
      mat.color.setScalar(this.cfg.reflectionBrightness);
    } else if (mat.map !== this.screenMap) {
      mat.map = this.screenMap;
      mat.color.copy(this.screenColor);
    }

    if (this.webcamOn) {
      this.webcamClock -= dt;
      if (this.webcamClock <= 0) {
        this.webcamClock = 1 / this.cfg.webcamFps; // choppy on purpose
        fig.visible = posed;
        this.room.screenMesh.visible = false; // same feedback guard as the mirror
        this.renderer.setRenderTarget(this.camTarget);
        this.renderer.render(this.room.scene, this.camCam);
        this.room.screenMesh.visible = true;
        this.copyWebcam();
      }
    }

    this.renderer.setRenderTarget(null);
    fig.visible = posed && this.figureInWorld;
  }

  copyWebcam() {
    const [w, h] = this.cfg.webcamSize, px = this.pixels, out = this.webcamImage.data, lut = this.toSrgb;
    this.renderer.readRenderTargetPixels(this.camTarget, 0, 0, w, h, px);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4; // flip vertically
        const grain = (Math.random() - 0.5) * 22;
        // Desaturated, slightly green security-camera look.
        const l = lut[px[s]] * 0.3 + lut[px[s + 1]] * 0.59 + lut[px[s + 2]] * 0.11;
        out[d] = l * 0.85 + grain; out[d + 1] = l + grain; out[d + 2] = l * 0.8 + grain; out[d + 3] = 255;
      }
    }
    this.webcamCtx.putImageData(this.webcamImage, 0, 0);
  }
}
