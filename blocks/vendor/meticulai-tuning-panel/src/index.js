// Meticulai tuning panel. See HOW-TO-USE.md.
//   tuning.js   the registry (no DOM): register controls, defaults, storage, A/B/C slots, presets, copy and paste
//   panel.js    the side panel that draws a registry (plain DOM, CSS inside, no imports)
//   starter.js  the drop-in for the kit starter's src/core/settings.js (same tuning.json, same save endpoint)
export { createTuning, parse, flatten, fit, SLOTS } from './tuning.js';
export { createPanel } from './panel.js';
export { createStarterSettings } from './starter.js';
