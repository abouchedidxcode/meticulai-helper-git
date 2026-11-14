// The vertex shader for full-screen simulation passes (a FullScreenQuad covers the target exactly).
export const FULLSCREEN_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
