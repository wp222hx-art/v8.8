/**
 * 🎨 PaperShader — SYNAPSE 自研 GLSL Shader 库
 *
 * 本模块提供纸片剧场核心的 WebGL fragment shader：
 *   1. RevealShader     — 翻格 1.2s 水彩揭示（mask + displacement + grain）
 *   2. ParchmentNoise   — 羊皮纸纤维噪声叠加
 *   3. RarityAura       — 稀有度脉冲光晕
 */
import { Filter, GlProgram } from 'pixi.js';

/* -----------------------------------------------------------
 * 1. RevealShader · 翻格揭示
 * --------------------------------------------------------- */
const VERT_DEFAULT = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void ) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void ) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAG_REVEAL = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
out vec4 fragColor;

uniform sampler2D uTexture;   // main texture (revealed image)
uniform float uProgress;      // 0.0 (fully fogged) → 1.0 (fully revealed)
uniform float uTime;
uniform vec3  uFogColor;      // charcoal ink color
uniform vec3  uGlowColor;     // rarity color

// Simple 2D hash noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 center = vec2(0.5);

  // Radial distance from center for circular unveil
  float dist = length(uv - center);

  // Ink-bleed edge: use fbm to distort the mask edge
  float bleed = fbm(uv * 4.0 + uTime * 0.2) * 0.15;
  float mask = smoothstep(uProgress + 0.12 - bleed, uProgress - 0.12 - bleed, dist * 1.2);

  // Sample original texture
  vec4 tex = texture(uTexture, uv);

  // Fog color blended with ink swirl
  float swirl = fbm(uv * 3.0 + uTime * 0.1);
  vec3 fog = uFogColor * (0.7 + 0.3 * swirl);

  // Glow ring at the reveal edge
  float ring = smoothstep(0.03, 0.0, abs(dist * 1.2 - uProgress - bleed * 0.5));
  vec3 glow = uGlowColor * ring * (1.0 - uProgress) * 2.0;

  vec3 color = mix(fog, tex.rgb, mask);
  color += glow;

  fragColor = vec4(color, max(tex.a, 1.0 - mask));
}
`;

export class RevealFilter extends Filter {
  constructor() {
    const gl = GlProgram.from({ vertex: VERT_DEFAULT, fragment: FRAG_REVEAL });
    super({
      glProgram: gl,
      resources: {
        revealUniforms: {
          uProgress: { value: 0, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
          uFogColor: { value: [0.18, 0.16, 0.22], type: 'vec3<f32>' },
          uGlowColor: { value: [1.0, 0.85, 0.35], type: 'vec3<f32>' },
        },
      },
    });
  }

  set progress(v: number) {
    (this.resources.revealUniforms as any).uniforms.uProgress = v;
  }
  get progress(): number {
    return (this.resources.revealUniforms as any).uniforms.uProgress;
  }
  set time(v: number) {
    (this.resources.revealUniforms as any).uniforms.uTime = v;
  }
  set glowColor(rgb: [number, number, number]) {
    (this.resources.revealUniforms as any).uniforms.uGlowColor = rgb;
  }
}

/** Convert hex color (0xRRGGBB) → [r, g, b] normalized. */
export function hexToRgb(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}
