// Words for matching a game's design against the blocks catalogue: a small synonym table ("concepts"), stop words,
// and a tokeniser that turns text into stems + concepts. Used by tools/blocks/suggest.mjs and build-catalog.mjs.
import { stem, words } from '../../assets/lib/common.mjs';

/**
 * Concept -> words that mean roughly the same thing for choosing a block. A design word and a block word match when
 * they share a stem or a concept. Extend freely: keep each list to words a designer or a block author would write.
 */
export const CONCEPTS = {
  fly: ['fly', 'flying', 'flies', 'flight', 'glide', 'glider', 'gliding', 'soar', 'soaring', 'wing', 'wings', 'winged', 'plane', 'aeroplane', 'airplane', 'aircraft', 'kite', 'flap', 'flapping', 'airborne', 'thermal', 'thermals', 'dogfight', 'pilot', 'paraglider', 'hang'],
  ride: ['ride', 'riding', 'rider', 'riders', 'horse', 'horses', 'horseback', 'mount', 'mounted', 'gallop', 'galloping', 'steed', 'cavalry', 'saddle', 'canter', 'trot', 'mare', 'stallion', 'pony'],
  drive: ['drive', 'driving', 'driver', 'car', 'cars', 'vehicle', 'vehicles', 'kart', 'truck', 'bike', 'ebike', 'motorbike', 'motorcycle', 'wheel', 'wheels', 'tyre', 'tire', 'drift', 'drifting', 'road'],
  sail: ['sail', 'sails', 'sailing', 'boat', 'boats', 'ship', 'ships', 'yacht', 'sailboat', 'raft', 'canoe', 'land-yacht'],
  race: ['race', 'races', 'racing', 'racer', 'lap', 'laps', 'rival', 'rivals', 'finish', 'checkpoint', 'checkpoints'],
  shoot: ['shoot', 'shooting', 'shooter', 'shot', 'shots', 'bow', 'bows', 'arrow', 'arrows', 'archery', 'archer', 'archers', 'aim', 'aiming', 'aimed', 'ballistic', 'ballistics', 'quiver', 'crosshair', 'projectile', 'projectiles', 'bullet', 'bullets', 'gun', 'guns', 'cannon', 'cannons', 'target', 'targets', 'sniper', 'volley', 'nock'],
  throw: ['throw', 'throwing', 'thrown', 'toss', 'tossing', 'fling', 'flick', 'slingshot', 'catapult', 'lob', 'skip', 'skipping', 'launch', 'launcher', 'hurl'],
  crowd: ['crowd', 'crowds', 'army', 'armies', 'herd', 'herds', 'flock', 'flocks', 'flocking', 'swarm', 'swarms', 'horde', 'hordes', 'murmuration', 'starling', 'starlings', 'shoal', 'boids', 'formation', 'formations', 'battalion', 'spectators', 'townsfolk', 'npc', 'npcs', 'mob', 'pack', 'thousands', 'hundreds'],
  water: ['water', 'sea', 'seas', 'pond', 'ponds', 'river', 'rivers', 'ocean', 'oceans', 'lake', 'lakes', 'wave', 'waves', 'ripple', 'ripples', 'underwater', 'tide', 'tides', 'tidal', 'shore', 'beach', 'swim', 'swimming', 'koi', 'fish', 'surf', 'splash', 'deep', 'abyss'],
  sky: ['sky', 'skies', 'cloud', 'clouds', 'cloudy', 'sun', 'sunset', 'sunrise', 'dusk', 'dawn', 'atmosphere', 'atmospheric', 'haze', 'hazy', 'fog', 'foggy', 'mist', 'misty', 'stars', 'starry', 'moon', 'aurora', 'horizon'],
  weather: ['weather', 'rain', 'rainy', 'storm', 'storms', 'stormy', 'snow', 'snowy', 'wind', 'windy', 'gust', 'gusts', 'thunder', 'lightning', 'blizzard'],
  webcam: ['webcam', 'hand', 'hands', 'gesture', 'gestures', 'finger', 'fingers', 'palm', 'palms', 'pinch', 'mediapipe', 'face', 'facial', 'blink', 'blinking', 'pose', 'clap', 'clapping', 'wave-to-play', 'landmark', 'landmarks', 'tracking'],
  touch: ['touch', 'touchscreen', 'tap', 'taps', 'swipe', 'phone', 'phones', 'tablet', 'mobile', 'thumb'],
  music: ['music', 'musical', 'song', 'songs', 'soundtrack', 'score', 'melody', 'melodies', 'rhythm', 'beat', 'beats', 'chord', 'chords', 'synth', 'synthesiser', 'synthesizer', 'ambient', 'ambience', 'generative', 'tempo', 'harmony'],
  sound: ['sound', 'sounds', 'sfx', 'audio', 'footstep', 'footsteps', 'reverb', 'mixer', 'loud', 'hear', 'hearing', 'listen', 'echo', 'spatial'],
  pixel: ['pixel', 'pixels', 'pixelated', 'retro', 'ps1', 'psx', '8bit', '16bit', 'lowres', 'dither', 'dithered', 'dithering', 'crt', 'sprite', 'sprites', 'chunky', 'arcade', 'ascii', 'tile', 'tiles', 'tileset'],
  paint: ['ink', 'inked', 'paper', 'print', 'printed', 'riso', 'risograph', 'painted', 'painterly', 'paint', 'painting', 'watercolour', 'watercolor', 'gouache', 'oil', 'brush', 'brushstroke', 'sketch', 'sketchy', 'pencil', 'crayon', 'storybook', 'sumi', 'illustration', 'illustrated', 'cutout', 'papercut', 'papercraft', 'comic', 'halftone', 'handpainted', 'handdrawn', 'woodcut', 'quilt', 'patchwork', 'felt'],
  look: ['post', 'postprocessing', 'filter', 'toon', 'cel', 'outline', 'outlines', 'bloom', 'lens', 'grain', 'vignette', 'grade', 'grading', 'hdr', 'tonemapping', 'photoreal', 'photorealistic', 'realistic', 'film', 'noir', 'stylised', 'stylized'],
  miniature: ['miniature', 'miniatures', 'diorama', 'dioramas', 'tiltshift', 'tilt-shift', 'toy', 'toys', 'tabletop', 'macro', 'tiny', 'model-railway'],
  marble: ['marble', 'marbles', 'ball', 'balls', 'roll', 'rolling', 'sphere', 'pinball', 'bowling', 'golf', 'tilt', 'maze', 'labyrinth', 'billiards'],
  dig: ['dig', 'digging', 'sand', 'sandy', 'excavate', 'excavation', 'excavating', 'shovel', 'dune', 'dunes', 'soil', 'dirt', 'archaeology', 'fossil', 'fossils', 'buried', 'deform', 'deformation', 'terrain'],
  stealth: ['stealth', 'sneak', 'sneaking', 'detect', 'detection', 'detected', 'hide', 'hiding', 'hidden', 'stalker', 'stalk', 'stalking', 'hunt', 'hunted', 'hunting', 'monster', 'monsters', 'dread', 'horror', 'scary', 'creepy', 'chase', 'chased', 'unseen'],
  fight: ['fight', 'fighting', 'fighter', 'fighters', 'melee', 'combo', 'combos', 'punch', 'kick', 'sword', 'swords', 'duel', 'duels', 'boxing', 'brawl', 'brawler', 'attack', 'attacks', 'parry', 'combat', 'battle', 'battles', 'war', 'enemy', 'enemies'],
  dungeon: ['dungeon', 'dungeons', 'crypt', 'crypts', 'cave', 'caves', 'cavern', 'caverns', 'roguelike', 'roguelite', 'crawler', 'corridor', 'corridors'],
  city: ['city', 'cities', 'town', 'towns', 'street', 'streets', 'rooftop', 'rooftops', 'roof', 'roofs', 'building', 'buildings', 'skyline', 'village', 'mosque', 'gothic', 'architecture', 'facade', 'facades', 'manhattan', 'urban', 'tower', 'towers', 'house', 'houses'],
  nature: ['tree', 'trees', 'forest', 'forests', 'woods', 'leaf', 'leaves', 'foliage', 'grass', 'meadow', 'field', 'fields', 'flower', 'flowers', 'garden', 'plant', 'plants', 'steppe', 'valley', 'hills', 'mountain', 'mountains', 'dandelion', 'dandelions', 'moss'],
  destruction: ['destroy', 'destruction', 'destructible', 'break', 'breaking', 'breakable', 'broken', 'collapse', 'collapsing', 'demolish', 'demolition', 'topple', 'crumble', 'smash', 'smashing', 'rubble', 'debris', 'shatter', 'shattering', 'slice', 'cut', 'explode', 'explosion'],
  fire: ['fire', 'fires', 'flame', 'flames', 'burn', 'burning', 'bonfire', 'campfire', 'torch', 'torches', 'candle', 'candles', 'ember', 'embers', 'smoke'],
  magic: ['magic', 'magical', 'spell', 'spells', 'wizard', 'witch', 'mage', 'ability', 'abilities', 'elemental', 'vfx', 'sorcery', 'cast', 'casting'],
  space: ['space', 'planet', 'planets', 'asteroid', 'asteroids', 'starfighter', 'spaceship', 'orbit', 'orbital', 'galaxy', 'nebula', 'zero-g', 'astronaut', 'cosmic'],
  glow: ['lantern', 'lanterns', 'glow', 'glowing', 'firefly', 'fireflies', 'lamp', 'lamps', 'beam', 'beams', 'neon', 'wisp', 'wisps'],
  creature: ['creature', 'creatures', 'animal', 'animals', 'insect', 'insects', 'bug', 'bugs', 'mosquito', 'hornet', 'bee', 'bird', 'birds', 'beast', 'beasts'],
  character: ['character', 'characters', 'walk', 'walking', 'run', 'running', 'animation', 'animated', 'rig', 'rigged', 'ragdoll', 'skeleton', 'body', 'avatar', 'avatars', 'ik', 'locomotion'],
  replay: ['replay', 'replays', 'killcam', 'highlight', 'highlights', 'clip', 'clips', 'ghost', 'instant-replay', 'slowmo', 'slow-motion'],
  online: ['multiplayer', 'online', 'netcode', 'network', 'networked', 'server', 'servers', 'lobby', 'leaderboard', 'leaderboards', 'coop', 'co-op', 'versus', 'pvp', 'voice'],
  dice: ['dice', 'die', 'card', 'cards', 'poker', 'casino', 'chips', 'deck', 'bluff', 'boardgame'],
  physics: ['physics', 'physical', 'rigid', 'rapier', 'collision', 'collisions', 'collide', 'simulation', 'simulated', 'simulate', 'sim', 'verlet', 'rope', 'ropes', 'chain', 'chains', 'spring', 'springs', 'fluid', 'fluids', 'jelly', 'wobbly', 'floppy', 'gravity', 'momentum', 'bounce', 'bouncy', 'weight', 'heavy', 'inertia', 'tether'],
  procedural: ['procedural', 'procedurally', 'procgen', 'generate', 'generated', 'generator', 'generation', 'seed', 'seeded', 'sdf', 'voxel', 'voxels', 'kit', 'infinite', 'endless'],
  tuning: ['tuning', 'tune', 'tuned', 'tweak', 'tweaking', 'slider', 'sliders', 'debug', 'panel', 'playtest', 'playtesting', 'bot', 'bots', 'recorder', 'recording', 'test', 'tests', 'testing', 'profiler', 'harness', 'deterministic', 'devtool', 'dev'],
  performance: ['performance', 'fps', 'framerate', 'stutter', 'stutters', 'hitch', 'hitches', 'lag', 'laggy', 'smooth', 'smoothness', 'instancing', 'instanced', 'lod', 'impostor', 'impostors', 'retina', 'dpr', 'judder'],
  speed: ['speed', 'fast', 'faster', 'boost', 'rush', 'velocity', 'motion-blur', 'zoom', 'zooming', 'speedy', 'blur'],
  calm: ['calm', 'relaxing', 'relaxed', 'cozy', 'cosy', 'peaceful', 'gentle', 'meditative', 'zen', 'soothing', 'quiet', 'slow', 'drift', 'drifting', 'floating'],
  camera: ['camera', 'chase-cam', 'follow-camera', 'cinematic-camera', 'orbit-camera', 'third-person'],
};

/** Words too common to mean anything when matching a design against blocks. */
export const STOP = new Set(`a an the and or but if of to in on at by for as is are was were be been being it its this that these those
there here what which who whom how why when while where you your yours they them their he she his her we our us i me my
do does did done has have had not no yes so than too very just also then only own same both few more most much many
can will would should could must may might shall into onto over under from with without about after before again all any
some other such each every one two three four five six seven eight nine ten first second last next new old big small
little lot lots get gets got make makes made making use used uses using work works like likes feel feels felt feeling
look looks looking see seen sees thing things way ways time times moment moments good great best better bad really real
game games player players play plays playing played world level levels screen seconds second minute minutes hour hours
need needs want wants keep keeps start starts end ends going go goes went back front side top bottom left right
three js threejs webgl webgl2 webgpu browser scene code system systems block blocks demo satisfying because example
something someone anything nothing everything kind sort part parts whole same feel instead around through between
until once always never often still even well enough far near up down out off away together each
behind ahead across along alongside within full half long short high low wide narrow pick picks choose chooses line lines
put puts take takes give gives let lets try tries set sets show shows stay stays come comes leave leaves find finds
found open opens close spot spots notice place places point points piece pieces bit bits kind kinds lot sure whole
almost already another anyone because before being below above beside better biggest during either else ever every
here inside instead later least less maybe often onto perhaps quite rather since soon though thus toward towards upon
usually via whether yet art loop loops`.split(/\s+/).filter(Boolean));

const WORD_TO_CONCEPTS = new Map();
for (const [c, list] of Object.entries(CONCEPTS)) {
  for (const raw of list) {
    // only the listed words themselves: crude stems would join unrelated words ("kites" -> "kit")
    for (const w of [raw, raw.replace(/-/g, '')]) {
      if (!WORD_TO_CONCEPTS.has(w)) WORD_TO_CONCEPTS.set(w, new Set());
      WORD_TO_CONCEPTS.get(w).add(c);
    }
  }
}

/** Joins phrases that would otherwise split into misleading words ("hand-painted" is not about hands). */
function preprocess(s) {
  return String(s || '')
    .replace(/\bhand[- ](painted|drawn|made|crafted|tuned|written|placed|authored|built|coded|picked|held|off|over)\b/gi, 'hand$1')
    .replace(/\b(by|on the other|first) hand\b/gi, '')
    .replace(/\bslow[- ]motion\b/gi, 'slowmo')
    .replace(/\btilt[- ]shift\b/gi, 'tiltshift')
    .replace(/\bco-op\b/gi, 'coop')
    .replace(/\bzero[- ]g\b/gi, 'zerog')
    .replace(/\b8[- ]bit\b/gi, '8bit')
    .replace(/\b16[- ]bit\b/gi, '16bit')
    .replace(/\bthird[- ]person\b/gi, 'thirdperson')
    .replace(/\bfirst[- ]person\b/gi, 'firstperson')
    .replace(/\bdraw calls?\b/gi, 'drawcalls')
    .replace(/\bframe ?rate\b/gi, 'framerate')
    .replace(/\bdev[- ]?(panel|menu|tool)s?\b/gi, 'devtool');
}

/** Concepts a single word belongs to (empty set if none). */
export function conceptsOf(w) {
  return WORD_TO_CONCEPTS.get(w) || WORD_TO_CONCEPTS.get(stem(w)) || new Set();
}

/**
 * Text -> list of { word, stem, concepts } without stop words. Keys used for matching: the stem, plus "@concept"
 * for every concept the word belongs to.
 */
export function tokens(text) {
  const out = [];
  for (const w of words(preprocess(text))) {
    if (w.length < 3 && !/^(ik|ai|2d|3d)$/.test(w)) continue;
    if (/^\d+$/.test(w)) continue;
    if (STOP.has(w)) continue;
    const s = stem(w);
    if (STOP.has(s)) continue;
    out.push({ word: w, stem: s, concepts: conceptsOf(w) });
  }
  return out;
}

/** Text -> Set of match keys (stems and "@concept"). */
export function keySet(text) {
  const set = new Set();
  for (const t of tokens(Array.isArray(text) ? text.join(' . ') : text)) {
    set.add(t.stem);
    for (const c of t.concepts) set.add(`@${c}`);
  }
  return set;
}
