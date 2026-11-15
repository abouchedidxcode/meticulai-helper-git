#!/usr/bin/env node
// Put a look (a drawing style from looks/) on the game, or take it off again.
import { getArgs } from '../lib/args.mjs';
import { HelperError, nextStep, runTool, say, warn } from '../lib/log.mjs';
import { gameDir, readHelper } from '../lib/paths.mjs';
import { applyLook, flatSupport, gameIsFlat, listUpgrades } from './lib.mjs';

const HELP = `
node tools/looks/apply.mjs <id> [--set name=value ...]
node tools/looks/apply.mjs none

Puts a look on your game: it writes my-game/src/look/index.js (the look), adds the block the look is built on if
it needs one, and notes the look in helper.json. The game's own code and its colours (palette.json) stay as they
are. "none" puts the plain look file back. See the looks with  node tools/looks/list.mjs.

  --set name=value   start with a different value for one of the look's options (repeat --set for more);
                     you can also change them while playing: press \` in the game
  --options '{...}'  the same, as JSON (used by the vibes tool)
  --dir <path>       the game folder (default my-game/)

If you had edited src/look/index.js yourself, your version is kept in my-game/.helper/ first.
`;

await runTool(async () => {
  // --set can repeat, which parseArgs' simple form does not allow: pull them out first
  const argv = process.argv.slice(2);
  const sets = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--set' && argv[i + 1] != null) { sets.push(argv[i + 1]); argv.splice(i, 2); i--; }
    else if (argv[i].startsWith('--set=')) { sets.push(argv[i].slice(6)); argv.splice(i, 1); i--; }
  }
  const { values: a, positionals } = getArgs({ options: { type: 'string' } }, HELP, argv);
  const id = positionals[0];
  if (!id) throw new HelperError("you didn't say which look.", 'See them with  node tools/looks/list.mjs, then  node tools/looks/apply.mjs <id>  (or  none  to take the look off).');
  const dir = gameDir(a.dir);
  readHelper(dir);
  let options = {};
  if (a.options) {
    try { options = JSON.parse(a.options); } catch (e) { throw new HelperError(`--options is not valid JSON (${e.message}).`, 'Example:  --options \'{"dotSize": 7}\''); }
  }
  for (const s of sets) {
    const m = /^([^=]+)=(.*)$/.exec(s);
    if (!m) throw new HelperError(`I couldn't read --set ${s}.`, 'Write it as  --set name=value , for example  --set dotSize=7');
    options[m[1].trim()] = m[2].trim();
  }
  const { look } = await applyLook(dir, id, { options });
  if (look.id !== 'none') {
    const flat = flatSupport(look);
    if (flat.works !== true && gameIsFlat(dir)) {
      warn(`this game uses a flat (orthographic) camera, and the ${look.name} look ${flat.works === false ? 'does not work with one' : 'only partly works with one'}: ${flat.note}`);
    }
    if (look.note) say(`  note  ${look.note}`);
    const up = listUpgrades().filter((u) => u.lite === look.id);
    for (const u of up) {
      if (u.block === look.block) say(`  note  This look uses part of the block ${u.block}. Built into the game, the block also gives ${u.gives}.`);
      else say(`  note  This is the light version. The block ${u.block} gives ${u.gives}; it needs the game built for it.`);
    }
    say(`  Colours still come from palette.json. To tune the look while playing, press \` in the game and open "Look".`);
  }
  nextStep('run  node tools/serve.mjs --check  and look at the game. If it is not right, try another look or  node tools/looks/apply.mjs none.');
  return 0;
});
