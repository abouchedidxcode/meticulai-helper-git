# jsfxr (sfxr.me)

Retro blips: jump, coin, laser, hit, explosion, power-up, UI clicks, made in seconds.

Site: https://sfxr.me

## Licence

**output: yours, unrestricted commercial use (tool: Unlicense)**

> Unrestricted commercial use.

Source: https://sfxr.me/ (checked 2026-11-14)

- Credit required: No. Credit line: `No credit required. Optional: "Sound effects made with jsfxr (sfxr.me)"`
- Commercial use OK: Yes
- AI-generated content: No

## What is there

- Kinds: audio
- Styles: pixel, cartoon
- Approx count: not stated
- Formats: wav, json
- Access: site. browser tool, no account for the free tier; npm package "jsfxr" can also generate sounds at runtime from saved parameters. Docs: https://github.com/chr15m/jsfxr

## How to search and download

- Open https://sfxr.me, click a preset (Pickup/Coin, Laser/Shoot, Explosion, Powerup, Hit/Hurt, Jump, Blip/Select), tweak sliders, press play.
- Download the wav, and "Save As" the json settings next to it.
- In code: `npm i jsfxr`, then `sfxr.play(sound)` or `sfxr.toAudio(json)` (see the GitHub README).

## Good for / not for

- Good for: Retro blips: jump, coin, laser, hit, explosion, power-up, UI clicks, made in seconds.
- Not for: Realistic sounds, music.

## Gotchas

- Free tier exports wav and the settings as json; mp3/ogg export and zip packs are a paid "Pro" option (not needed: convert wav with ffmpeg).
- Keep the json parameters in the repo so a sound can be tweaked later, or play them at runtime with the jsfxr library (Unlicense).
- Sounds are generated from random seeds: tell the user to audition several and keep the best.
