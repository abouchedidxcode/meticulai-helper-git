# Dragon Aces

**What it is:** dragon dogfights for up to 10 players, with mouse-aim banking flight, fireballs, homing seekers and
team or free-for-all matches. Play: https://meticulai.com/games/dragon-aces/

## What worked

**The flight feel, and protecting it.** The creator's verdict on the core: "the way you control and move, and the speed
is right." That sentence became a standing rule for every later session: do not change the player's flight feel, speed
or controls. Through a full interface overhaul with five builders, five critics and four fixers, nobody touched it.

**Answering a real complaint with a design idea.** The creator found it "hard to ever really see the other dragons ... a
tiny dot then they are there then they are dead," and the lock-on boxes "very distracting." Their own suggestion: "a
magnifying glass type circle around them that follows them and you can actually see them." It was built as a real
second render: a small telescope view of just the dragons, blended over a blurred copy of the frame. Boxes were
removed. Alongside it, the match got smaller so fights happen in view: dragons drawn 1.4 times larger (hitboxes
scaled to match), rooms from 20 players to 10, bots filling to 6, the map radius from 2.2 km to 1.65 km, and bots that
stop jousting head-on. A bench tool measured encounters before and after.

**Persona critics.** The interface round used five critics, each with a different eye: a stand-in for the creator, a
AAA UI art director, a veteran dogfighter, a first-time player and a technical artist. Their findings were merged into
one decided list. It covered lens rules (no empty lens around a dragon hidden behind terrain, at most three lenses, a
red closing arc for a lock), threat cues when a bot aims at you ("ON YOUR SIX"), and much less neon.

## What didn't

**"It feels so much like a claude made game, something generic."** The creator's full note: "from the opening screen and
onwards ... The font is too generic, the screen seems quite busy." What changed:
- self-hosted fonts with character (a display serif and a clean UI face) instead of the usual defaults;
- crests, gold gradients and boxed cards removed;
- a filmed title flight that doubles as the breed picker, instead of dragons standing side by side;
- a calm HUD of thin rules that fades when nothing is happening;
- neon line rings replaced with mist and dust; bloom from 0.5 to 0.4; no pink damage tint.

**Opt-in features go unseen.** A new code-built dragon shipped behind a setting. The creator's reaction: "Dragon looks
the same?" It became the default. If a change is meant to be seen, make it the default and keep a switch to go back.

**Built without seeing it move.** The overhaul was done on a machine without a GPU. Its handover is blunt: "Nothing was
ever seen in motion or at real frame rate." The lens timing, the title flight and the audio were all unverified, and a
second critic round never ran. Seeker missiles that "never hit" were only found when the creator played.

## The lesson

Protect the feel the person loves, and fix what they actually complained about. Generic AI interfaces come from default
fonts, busy screens and decoration; the cure is specific: fonts with character, fewer elements, the game's own
materials, and critics who look for "generic."

## What your agent should copy

- [ ] When the person praises the feel, write it in `DECISIONS.md` as a rule no later round may break.
- [ ] Take the person's own design idea seriously and build it properly; it may be the game's best feature.
- [ ] If players can't see each other, change the scale (bigger, fewer, closer) before adding markers.
- [ ] Run persona critics, including one whose only job is spotting "generic AI-made."
- [ ] Make new visible features the default, with a setting to switch back.
- [ ] List everything unverified in `HANDOVER.md`, especially "never seen in motion."

Related: [feel](../playbook/feel.md), [picking a look](../playbook/picking-a-look.md).
