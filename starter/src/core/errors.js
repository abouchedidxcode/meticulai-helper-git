// Collects every runtime error into one array (window.__game.errors), so tools and tests
// can check "no errors" without reading the browser console.
// Sources: window errors, unhandled promise rejections, console.error (three.js reports shader
// failures there), WebGL context loss, and gl.getError() checked about once a second.
// With ?test=1 a red banner shows the latest error on screen.

const MAX_ERRORS = 50;

export const errors = [];

let banner = null;

function addError(message) {
  const text = String(message).slice(0, 500);
  if (errors.length >= MAX_ERRORS) return;
  if (errors.includes(text)) return; // the same error every frame counts once
  errors.push(text);
  if (banner) {
    banner.hidden = false;
    banner.textContent = `${errors.length} error${errors.length > 1 ? 's' : ''}: ${text}`;
  }
}

export function reportError(message) {
  addError(message);
}

export function installErrorCatcher({ showBanner = false } = {}) {
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '';
    addError(`${e.message || 'Error'}${where}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    addError(`Unhandled promise: ${e.reason?.message ?? e.reason}`);
  });

  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    addError(`console.error: ${args.map((a) => (a?.message ?? String(a))).join(' ')}`);
  };

  if (showBanner) {
    banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.hidden = true;
    document.body.appendChild(banner);
  }
}

// Call from the render loop. Checks the GL error flag every `every` frames (reading it
// forces the GPU to sync, so not every frame).
export function watchWebGL(renderer, every = 60) {
  const gl = renderer.getContext();
  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    addError('WebGL context lost');
  });
  const names = {
    [gl.INVALID_ENUM]: 'INVALID_ENUM',
    [gl.INVALID_VALUE]: 'INVALID_VALUE',
    [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
    [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
    [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
  };
  let count = 0;
  return function checkGL() {
    if (++count % every !== 0) return;
    const code = gl.getError();
    if (code !== gl.NO_ERROR && code !== gl.CONTEXT_LOST_WEBGL) {
      addError(`WebGL error ${names[code] ?? code}`);
    }
  };
}
