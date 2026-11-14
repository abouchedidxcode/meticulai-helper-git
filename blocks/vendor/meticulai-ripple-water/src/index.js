// meticulai-ripple-water: interactive water. A GPU wave simulation you can touch, drag through and drop things in,
// and a surface that refracts, glints and throws caustics from the live ripples.
// From the game Koi by Meticulai (meticulai.com). MIT licence. See HOW-TO-USE.md.
export { Ripples, SIM_QUALITY, RECT_SHORE, MAX_DROPS, MAX_BODIES, gridFor, waveSpeed } from './ripples.js';
export { createWaterMaterial, createWindTexture, WATER_LIGHT, NORMAL_K, MAX_SPLASHES, MAX_TOUCHES } from './water-material.js';
export { UnderPass, applyUnderwater, UNDERWATER_DEFAULTS } from './underwater.js';
export { GLSL_NOISE, GLSL_CAUSTICS, GLSL_SIM } from './glsl.js';
export { pondShore } from './pond-shape.js';
