// meticulai-firefly-swarm: catchable fireflies with a drawn glow (no bloom), from Fireflies by Meticulai.
//
//   rules.js    pure rules: Grip (how slowly a hand closed), TUNING, scoring, dusk, spawn schedule
//   flies.js    the catchable fireflies: wander, loose flock, blink, curiosity, startle, held, released
//   view.js     how they are drawn: hot core + inner glow + wide halo, plus a GPU swarm of distant ones
//   jar.js      a fake-glass jar on a stump that fills with light
//   look.js     the shared uniforms (dusk palette, haze, 20 fake local lights) and GLSL helpers
//   catcher.js  the catching game for any input that gives a screen point + openness per hand
//   pointer.js  a mouse / touch pointer as such a hand (hold = gentle close, quick click = snatch)
//   space.js    a play volume in front of a camera
export * from './rules.js';
export { Flies, COLORS, SPEED, SIZE } from './flies.js';
export { FireflyView } from './view.js';
export { Jar, JAR_H, JAR_R } from './jar.js';
export { createLook, setDusk, writeLights, GLSL_COMMON, MAX_LIGHTS, PALETTE } from './look.js';
export { FireflyCatcher } from './catcher.js';
export { PointerHand, POINTER_CLOSE_S, TAP_S, POINTER_OPEN_S } from './pointer.js';
export { createCameraSpace } from './space.js';
