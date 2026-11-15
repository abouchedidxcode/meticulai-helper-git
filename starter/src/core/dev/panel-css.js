// The dev menu's styles (a string, added to the page when the menu loads, so a shipped game carries none of it).
// Restyle: the colours are the variables on the first rule (--gold is the accent, --bg the panel).
export const CSS = `
.devm, .devm-tab, .devm-note { --ink: #ecebe6; --soft: #b4b3ad; --faint: #7d7c77; --line: rgba(236, 235, 230, 0.09);
  --line2: rgba(236, 235, 230, 0.2); --gold: #f2b54a; --gold2: rgba(242, 181, 74, 0.16); --bg: rgba(18, 19, 24, 0.97);
  --solid: rgb(22, 23, 29); --field: rgba(255, 255, 255, 0.05);
  font: 400 13px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums; letter-spacing: 0; color: var(--ink); -webkit-font-smoothing: antialiased; text-align: left; }
.devm { position: fixed; top: 0; right: 0; bottom: 0; width: 400px; max-width: 100vw; z-index: 60; display: flex;
  flex-direction: column; background: var(--bg); border-left: 1px solid var(--line2); box-shadow: -16px 0 40px rgba(0,0,0,.35);
  transform: translateX(103%); visibility: hidden; transition: transform .18s ease-out, visibility 0s linear .18s, background .15s; user-select: none; touch-action: auto; }
.devm.open { transform: none; visibility: visible; transition: transform .18s ease-out, visibility 0s, background .15s; }
.devm.sizing { transition: none; }
.devm *, .devm *::before, .devm *::after { box-sizing: border-box; }
/* a game's own rules on short class names (.row, .stats, .empty...) must not bend the menu */
.devm :where(div, section, header, footer, p, span, i, h3, label, aside) { margin: 0; justify-content: normal; text-align: inherit; float: none; }
.devm [hidden] { display: none !important; }
.devm button, .devm input, .devm select, .devm textarea { font: inherit; color: inherit; letter-spacing: 0; }
.devm button { cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0; min-height: 24px; background: var(--field); border: 1px solid var(--line2); border-radius: 5px; padding: 2px 8px; transition: none; transform: none; white-space: nowrap; }
.devm button:hover:not(:disabled) { border-color: var(--soft); background: rgba(255, 255, 255, 0.09); }
.devm button:active:not(:disabled) { background: rgba(255, 255, 255, 0.14); transform: none; }
.devm button:disabled { opacity: .4; cursor: default; }
.devm button.on { background: var(--gold2); border-color: var(--gold); color: var(--gold); }
.devm button.quiet { background: none; border-color: transparent; color: var(--soft); padding: 2px 5px; }
.devm button.quiet:hover:not(:disabled) { color: var(--ink); border-color: var(--line2); background: var(--field); }
.devm button.quiet.on { color: var(--gold); border-color: var(--gold); background: var(--gold2); }
.devm button.warn { color: #ff9d80; border-color: #ff9d80; }
.devm kbd { font: 10px/1 ui-monospace, Menlo, monospace; color: var(--faint); margin-left: 6px; padding: 0; border: 0; background: none; min-width: 0; }
.devm .on kbd { color: inherit; opacity: .7; }
.devm .grip { position: absolute; left: -4px; top: 0; bottom: 0; width: 9px; cursor: ew-resize; z-index: 3; }
.devm .grip:hover, .devm.sizing .grip { background: linear-gradient(90deg, transparent 3px, var(--gold) 3px, var(--gold) 5px, transparent 5px); }
.devm header { flex: none; padding: 10px 12px 9px; border-bottom: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; transition: opacity .15s; }
.devm .top { display: flex; align-items: baseline; gap: 8px; }
.devm h3 { margin: 0; font-size: 13px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; flex: none; }
.devm .game { flex: 1; min-width: 0; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.devm .fps { flex: none; min-width: 48px; text-align: right; color: var(--gold); font-weight: 600; }
.devm .x { align-self: center; width: 24px; height: 24px; min-height: 0; padding: 0 0 2px; font-size: 16px; line-height: 1; }
.devm .nums { min-height: 31px; white-space: pre; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; line-height: 1.35; color: var(--soft); }
.devm .bar { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.devm .bar.tools > button { flex: 1; }
.devm .bar .gap { flex: 1; }
.devm .lab { color: var(--faint); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; margin-right: 2px; }
.devm .seg { display: inline-flex; }
.devm .seg button { border-radius: 0; margin-left: -1px; padding: 2px 7px; min-width: 26px; }
.devm .seg button:first-child { border-radius: 5px 0 0 5px; margin-left: 0; }
.devm .seg button:last-child { border-radius: 0 5px 5px 0; }
.devm .seg button.on { position: relative; z-index: 1; }
.devm .seg.speed button { font-size: 13px; padding: 2px 4px; }
.devm .find { flex-wrap: nowrap; margin-top: 2px; }
.devm .find input { flex: 1; min-width: 60px; height: 26px; padding: 0 8px; border: 1px solid var(--line2); border-radius: 5px; background: var(--field); outline: none; user-select: text; }
.devm .find input:focus { border-color: var(--gold); }
.devm .find input::placeholder { color: var(--faint); }
.devm .hits { color: var(--gold); font-size: 11.5px; white-space: nowrap; }
.devm .hits:empty { display: none; }
.devm .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: rgba(236,235,230,.25) transparent; container-type: inline-size; overflow-anchor: none; }
.devm .empty { padding: 16px 12px; color: var(--faint); }
.devm .empty:empty { display: none; }
.devm .presets { padding: 9px 12px 8px; border-bottom: 1px solid var(--line); }
.devm.filtering .presets { display: none; }
.devm .phead { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.devm .presets .now { flex: 1; text-align: right; color: var(--soft); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.devm .plist { display: flex; flex-wrap: wrap; gap: 5px; }
.devm .about { margin: 6px 0 0; color: var(--soft); font-size: 12px; line-height: 1.35; min-height: 32px; }
.devm .sec { border-bottom: 1px solid var(--line); }
.devm .sec > .hd { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: flex-start; gap: 7px; width: 100%; min-height: 30px; padding: 4px 12px;
  border: 0; border-radius: 0; background: var(--solid); text-align: left; font-weight: 650; letter-spacing: .04em; color: var(--soft); transition: opacity .15s; }
.devm .sec > .hd:hover:not(:disabled) { color: var(--ink); background: rgb(28, 29, 36); }
.devm .sec > .hd::before { content: ''; flex: none; width: 6px; height: 6px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); margin: 0 4px 3px 1px; transition: transform .12s; }
.devm .sec.folded:not(.found) > .hd::before { transform: rotate(-45deg); margin: 0 5px 0 0; }
.devm .sec.folded:not(.found) > .body { display: none; }
.devm .sec .t { overflow: hidden; text-overflow: ellipsis; }
.devm .sec .cnt { flex: 1; color: var(--faint); font-weight: 400; }
.devm .sec .chg { color: var(--gold); font-weight: 500; font-size: 12px; }
.devm .sec .rs { font-size: 11px; font-weight: 400; padding: 1px 6px; border: 1px solid var(--line2); border-radius: 4px; display: none; }
.devm .sec.has > .hd:hover .rs { display: inline; }
.devm .sec .rs:hover { border-color: var(--gold); color: var(--gold); }
.devm .sec.changed > .hd { color: var(--gold); }
.devm .sec.changed .body { background: rgba(242, 181, 74, 0.04); }
.devm .sec.nohit, .devm.filtering .sec.simple { display: none; }
.devm.simple .sec.group, .devm:not(.simple) .sec.simple { display: none; }
.devm.simple.filtering .sec.group:not(.nohit) { display: block; }
.devm .body { padding: 2px 0 5px; }
.devm .row { display: grid; grid-template-columns: 10px minmax(0, 1fr) minmax(96px, 31%) 56px 44px; gap: 0 6px; align-items: center; min-height: 27px; padding: 1px 12px 1px 8px; transition: opacity .15s; justify-content: normal; }
.devm .row:hover { background: rgba(255, 255, 255, .035); }
.devm .row.live { background: rgba(18, 19, 24, 0.9); box-shadow: 0 0 0 1px var(--line2); }
.devm .row .mk { width: 8px; height: 8px; min-height: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: default; }
.devm .row.changed .mk { background: var(--gold); cursor: pointer; }
.devm .row.changed .mk:hover { background: #ffe1a3; }
.devm .row .name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.2; padding: 2px 0; color: var(--soft); }
.devm .row .name i { font-style: normal; color: var(--faint); margin-right: 6px; }
.devm .row:hover .name { color: var(--ink); }
.devm .row.changed .name { color: var(--gold); }
.devm .row.bool { cursor: pointer; }
.devm .row .ctl { grid-column: 3 / 5; display: flex; align-items: center; gap: 6px; min-width: 0; }
.devm .row.num .ctl { grid-column: 3; }
.devm .track { position: relative; flex: 1; min-width: 0; height: 22px; display: flex; align-items: center; }
.devm input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 22px; margin: 0; padding: 0; background: transparent; outline: none; cursor: ew-resize; --p: 0; --fill: #c9c8c2;
  background-image: linear-gradient(var(--fill), var(--fill)), linear-gradient(var(--line2), var(--line2));
  background-size: calc(6px + (100% - 12px) * var(--p)) 3px, 100% 3px; background-position: 0 50%, 0 50%; background-repeat: no-repeat; }
.devm .row.changed input[type=range] { --fill: var(--gold); }
.devm input[type=range]::-webkit-slider-runnable-track { height: 22px; background: transparent; }
.devm input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; margin-top: 5px; border: 0; border-radius: 50%; background: var(--fill); box-shadow: 0 0 0 2px rgb(22, 23, 29); }
.devm input[type=range]:hover::-webkit-slider-thumb, .devm .row.live input[type=range]::-webkit-slider-thumb { background: #fff; }
.devm input[type=range]::-moz-range-track { height: 22px; background: transparent; }
.devm input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--fill); box-shadow: 0 0 0 2px rgb(22, 23, 29); }
.devm .track .tick { --d: 0; position: absolute; top: 3px; bottom: 3px; left: calc(6px + (100% - 12px) * var(--d)); width: 2px; margin-left: -1px; background: var(--ink); opacity: 0; pointer-events: none; border-radius: 1px; }
.devm .row.changed .tick { opacity: .75; }
.devm .val { width: 100%; height: 22px; padding: 0 5px; border: 1px solid var(--line); border-radius: 4px; background: var(--field); outline: none; text-align: right; user-select: text; }
.devm .val:focus { border-color: var(--gold); background: rgba(0, 0, 0, .35); }
.devm .val.hex { text-align: left; flex: 1; min-width: 0; }
.devm .row.changed .val { color: var(--gold); }
.devm .row.beyond .val { color: #ff9d80; font-style: italic; }
.devm .def { display: block; min-height: 0; text-align: right; color: var(--faint); font-size: 11px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0; border: 0; background: none; cursor: default; }
.devm .def:hover:not(:disabled) { background: none; }
.devm .row.changed .def { color: var(--gold); text-decoration: underline dotted; cursor: pointer; }
.devm .row.color .def { justify-self: end; width: 16px; height: 16px; border-radius: 4px; background: var(--c, transparent); border: 1px solid var(--line2); opacity: .55; }
.devm .row.color .def:hover:not(:disabled) { background: var(--c, transparent); }
.devm .row.color.changed .def { opacity: 1; border-color: var(--gold); }
.devm .row select, .devm .vibe select { width: 100%; min-width: 0; height: 22px; background: rgb(30, 31, 38); border: 1px solid var(--line2); border-radius: 4px; cursor: pointer; }
.devm .row .seg { display: flex; width: 100%; }
.devm .row .seg button { flex: 1; min-height: 22px; padding: 1px 4px; font-size: 12px; overflow: hidden; }
.devm .sw { -webkit-appearance: none; appearance: none; position: relative; width: 30px; height: 16px; margin: 0; border: 1px solid var(--line2); border-radius: 8px; background: var(--field); cursor: pointer; outline: none; transition: background .12s, border-color .12s; }
.devm .sw::after { content: ''; position: absolute; left: 2px; top: 2px; width: 10px; height: 10px; border-radius: 50%; background: var(--soft); transition: transform .12s, background .12s; }
.devm .sw:checked { background: var(--gold2); border-color: var(--gold); }
.devm .sw:checked::after { transform: translateX(14px); background: var(--gold); }
.devm .row input[type=color] { flex: none; width: 30px; height: 22px; padding: 0; border: 1px solid var(--line2); border-radius: 4px; background: none; cursor: pointer; }
.devm .row input[type=color]::-webkit-color-swatch-wrapper { padding: 2px; }
.devm .row input[type=color]::-webkit-color-swatch { border: 0; border-radius: 2px; }
.devm .row.readout .ctl { grid-column: 3 / 6; justify-content: flex-end; text-align: right; color: var(--ink); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.devm .row.fns { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 5px; padding: 5px 12px 5px 24px; min-height: 0; }
.devm .row.fns:hover { background: none; }
.devm .row.custom { display: block; padding: 5px 12px 6px 24px; }
.devm .row.custom:hover { background: none; }
.devm .vibe .vrow { display: flex; align-items: center; gap: 5px; }
.devm .vibe .vrow .name { flex: none; width: 44px; padding: 0; }
.devm .vibe .vrow button { flex: none; min-width: 26px; padding: 2px 6px; }
.devm .vibe .vrow select { flex: 1; height: 24px; }
.devm .vibe .chips { display: flex; gap: 3px; margin: 6px 0 0 49px; min-height: 12px; }
.devm .vibe .chips i { flex: 1; max-width: 34px; height: 12px; border-radius: 3px; border: 1px solid var(--line2); }
.devm .vibe .vline { margin: 5px 0 0 49px; color: var(--soft); font-size: 12px; line-height: 1.35; min-height: 32px; }
.devm footer { flex: none; border-top: 1px solid var(--line); padding: 8px 12px 9px; display: flex; flex-direction: column; gap: 6px; transition: opacity .15s; }
.devm footer .bar { flex-wrap: nowrap; }
.devm footer .count { flex: 1; min-width: 0; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.devm footer .count.some { color: var(--gold); }
.devm .slots { display: inline-flex; align-items: center; gap: 4px; }
.devm .slots button { min-width: 26px; padding: 2px 6px; }
.devm .slots button.full { border-color: var(--soft); }
.devm .slots button.cur { background: var(--gold2); border-color: var(--gold); color: var(--gold); }
.devm .slots.arm button:not(.arm) { border-style: dashed; border-color: var(--gold); }
.devm .primary { background: var(--gold2); border-color: var(--gold); color: var(--gold); font-weight: 600; }
.devm .msg { min-height: 17px; color: var(--soft); font-size: 12px; line-height: 1.35; user-select: text; }
.devm .paste textarea { width: 100%; height: 92px; resize: vertical; padding: 6px; border: 1px solid var(--line2); border-radius: 5px;
  background: rgba(0,0,0,.3); font: 11.5px/1.35 ui-monospace, Menlo, monospace; user-select: text; outline: none; margin-bottom: 6px; }
@container (max-width: 372px) {
  .devm .row { grid-template-columns: 10px minmax(0, 1fr) minmax(84px, 30%) 52px; }
  .devm .row .def { display: none; }
  .devm .row .ctl { grid-column: 3 / 5; }
  .devm .row.readout .ctl { grid-column: 3 / 5; }
}
/* while a slider is dragged everything but its own row fades away: the picture is judged, not the menu */
.devm.peek { background: transparent; border-left-color: transparent; box-shadow: none; }
.devm.peek header, .devm.peek footer, .devm.peek .hd, .devm.peek .presets, .devm.peek .row:not(.live) { opacity: 0; }
.devm.peek .sec { border-color: transparent; }
.devm.peek .sec.changed .body { background: none; }
.devm-tab { position: fixed; right: 0; top: 42%; z-index: 59; margin: 0; padding: 9px 6px; border: 1px solid var(--line2); border-right: 0;
  border-radius: 6px 0 0 6px; background: rgba(18, 19, 24, 0.82); color: var(--soft); cursor: pointer; writing-mode: vertical-rl;
  letter-spacing: .08em; font-size: 12px; opacity: .8; display: block; transition: none; }
.devm-tab:hover { opacity: 1; color: var(--gold); border-color: var(--gold); }
.devm-tab.busy { color: var(--gold); border-color: rgba(242, 181, 74, .6); opacity: 1; }
.devm-tab[hidden] { display: none; }
.devm-note { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 61; max-width: 92vw; padding: 7px 14px; border-radius: 6px;
  background: rgba(18, 19, 24, 0.88); color: var(--ink); white-space: pre-wrap; text-align: center; pointer-events: none; opacity: 0; transition: opacity .3s; }
.devm-note.show { opacity: 1; }
/* the game's own test buttons and error line move out from under the open menu */
body.devm-open .test-bar { right: calc(var(--devm-w, 400px) + 12px); max-width: calc((100vw - var(--devm-w, 400px)) * 0.6); }
body.devm-open .error-banner { right: var(--devm-w, 400px); }
body.devm-open .devm-note { left: calc((100vw - var(--devm-w, 400px)) / 2); max-width: calc(92vw - var(--devm-w, 400px)); }
/* No HUD: everything on top of the picture goes, except the menu itself, the note box and error messages */
body.devm-nohud > :not(canvas):not(.devm):not(.devm-tab):not(.devm-note):not(.note-box):not(.flash):not(.error-banner) { visibility: hidden !important; }
body.devm-fly .game-canvas { cursor: grab; }
`;
