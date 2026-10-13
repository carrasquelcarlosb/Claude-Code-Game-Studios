import * as THREE from 'three';

/**
 * PS2-era rendering helpers: vertex snapping on materials and a low-res
 * post pass that quantizes color with ordered dithering.
 */

/**
 * Patches a material so its projected vertices snap to a coarse screen grid,
 * producing the wobbly geometry of early-2000s hardware.
 * @param {THREE.Material} material
 * @param {number[]} snap grid resolution [x, y] in clip space
 * @returns {THREE.Material} the same material, for chaining
 */
export function ps2ify(material, snap) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = { value: new THREE.Vector2(snap[0], snap[1]) };
    shader.vertexShader = 'uniform vec2 uSnap;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 snapped = gl_Position;
      snapped.xyz /= snapped.w;
      snapped.xy = floor(snapped.xy * uSnap) / uSnap;
      snapped.xyz *= snapped.w;
      gl_Position = snapped;`
    );
  };
  return material;
}

/**
 * Builds a canvas-generated texture with nearest filtering and no mipmaps.
 * @param {number} w texture width in pixels
 * @param {number} h texture height in pixels
 * @param {(ctx: CanvasRenderingContext2D, w: number, h: number) => void} paint
 * @returns {THREE.CanvasTexture}
 */
export function makeTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Low-resolution render target plus a full-screen pass that upscales with
 * nearest filtering, quantizes color and applies a glitch amount.
 */
export class PS2Pipeline {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{width:number,height:number,colorLevels:number,ditherStrength:number}} cfg
   */
  constructor(renderer, cfg) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(cfg.width, cfg.height, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.uniforms = {
      tScene: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(cfg.width, cfg.height) },
      uLevels: { value: cfg.colorLevels },
      uDither: { value: cfg.ditherStrength },
      uGlitch: { value: 0 },
      uExposure: { value: 1 },
      uTime: { value: 0 },
    };
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tScene; uniform vec2 uRes; uniform float uLevels, uDither, uGlitch, uTime, uExposure;
        varying vec2 vUv;
        float bayer(vec2 p){
          int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
          int i = x + y * 4;
          float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
          for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
          return 0.0;
        }
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // Glitch: horizontal line tearing that scales with uGlitch.
          float row = floor(uv.y * uRes.y);
          float tear = step(1.0 - uGlitch * 0.35, hash(row + floor(uTime * 12.0)));
          uv.x += tear * (hash(row * 3.1 + uTime) - 0.5) * 0.08 * uGlitch;
          vec2 px = floor(uv * uRes);
          vec3 col = texture2D(tScene, (px + 0.5) / uRes).rgb;
          col.r = mix(col.r, texture2D(tScene, (px + vec2(uGlitch * 3.0, 0.0) + 0.5) / uRes).r, uGlitch);
          col = pow(max(col * uExposure, 0.0), vec3(1.0 / 2.2)); // target is linear; encode for display
          col += bayer(px) * uDither / uLevels;
          col = floor(col * uLevels + 0.5) / uLevels;
          gl_FragColor = vec4(col, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  }

  /**
   * Renders the scene at low resolution, then the post pass to the canvas.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {number} time seconds since start
   */
  render(scene, camera, time) {
    this.uniforms.uTime.value = time;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
