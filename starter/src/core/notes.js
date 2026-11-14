// The in-game note box: the player presses N, writes what they felt, and it lands in
// playtest-notes/NOTES.md (with a screenshot and the game state) for the agent to read.
// Only works on the dev server (`npm run dev`); in a shipped build N does nothing.
//
// The agent reads new notes with: node tools/play/notes.mjs

const PROMPTS = [
  'What was fun?',
  'What was confusing?',
  'Where did you stop, and why?',
  'Anything that felt wrong?',
];

const MAX_SHOT_WIDTH = 1280;

// Shrink a big frame (retina screens) so notes stay small on disk.
function shrink(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_SHOT_WIDTH) return resolve(dataUrl);
      const c = document.createElement('canvas');
      c.width = MAX_SHOT_WIDTH;
      c.height = Math.round((img.height * MAX_SHOT_WIDTH) / img.width);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// loop: to pause the game while writing. capture/getState: from main.js.
export function installNotes({ enabled, loop, capture, getState }) {
  if (!enabled) return { open() {}, enabled: false };

  const box = document.createElement('div');
  box.className = 'note-box';
  box.hidden = true;
  box.innerHTML = `
    <form class="card">
      <h2>Leave a note for your agent</h2>
      <ul>${PROMPTS.map((p) => `<li>${p}</li>`).join('')}</ul>
      <textarea rows="6" maxlength="5000" placeholder="Write anything. Short is fine."></textarea>
      <div class="row">
        <button type="submit" class="primary">Send</button>
        <button type="button" class="cancel">Cancel (Esc)</button>
      </div>
      <p class="note-status" aria-live="polite"></p>
    </form>`;
  document.body.appendChild(box);

  const form = box.querySelector('form');
  const text = box.querySelector('textarea');
  const status = box.querySelector('.note-status');
  let shot = null;
  let state = null;
  let wasPaused = false;

  function open() {
    if (!box.hidden) return;
    // Take the picture before the box covers anything.
    try {
      shot = capture();
    } catch {
      shot = null;
    }
    state = getState();
    wasPaused = loop.paused;
    loop.pause();
    status.textContent = '';
    box.hidden = false;
    text.focus();
  }

  function close() {
    box.hidden = true;
    text.blur();
    if (!wasPaused) loop.resume();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!text.value.trim()) {
      status.textContent = 'Write something first.';
      return;
    }
    status.textContent = 'Saving...';
    try {
      const res = await fetch('/__helper/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: text.value.trim(),
          screenshot: shot ? await shrink(shot) : null,
          state,
          url: location.href,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text.value = '';
      status.textContent = 'Saved. Your agent will read this.';
      setTimeout(close, 1200);
    } catch (err) {
      status.textContent = `Could not save the note (${err.message}). Is the game running from the dev server?`;
    }
  });
  box.querySelector('.cancel').addEventListener('click', close);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyN' || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'number'))) return;
    e.preventDefault(); // so the "n" doesn't land in the text box
    open();
  });

  return { open, close, enabled: true };
}
