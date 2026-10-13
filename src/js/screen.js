import * as THREE from 'three';

/**
 * The CRT's display surface: a 320x240 canvas shown as a texture on the
 * monitor. The OS draws into `ctx`; `present()` adds scanlines and uploads.
 */
export class CrtScreen {
  constructor() {
    /** Screen width in OS pixels. */
    this.width = 320;
    /** Screen height in OS pixels. */
    this.height = 240;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  /** Applies scanlines and marks the texture for upload. */
  present() {
    const c = this.ctx;
    c.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = 0; y < this.height; y += 2) c.fillRect(0, y, this.width, 1);
    this.texture.needsUpdate = true;
  }
}
