# Free things your game can use

This folder lists free, openly licensed material that a browser game can use, even a game you sell: 3D models,
textures, skies, sprites, sounds, music, fonts, icons, and code libraries. Every entry was checked on the creator's
own site on **2026-11-14**. Licences change: if an entry is old, read the licence page again before relying on it.

For agents and for people. Agents: read this page, then `catalog.json`. People: the short version is the "ladder"
and the "never use" list below.

## What is here

| File | What |
|---|---|
| `catalog.json` | `sources`: 54 libraries of assets (licence, credit, formats, how to fetch). `tools`: 22 free or cheap apps to make or remix assets. `avoid`: 16 places and licences never to use, with the reason. |
| `<id>.md` | One page per source: the licence sentence quoted from the site, the credit line, how to search and download (with a tested example), good for / not for, gotchas. |
| `packs/*.json` | Pack lists for Kenney (217), KayKit (17) and Quaternius (84): name, kinds, style, tags, count, preview, licence, download. See `packs/README.md`. |
| `libraries.json` | 61 code libraries (physics, pathfinding, particles, post-processing, audio, UI, 2D engines, asset tools, generators): licence, size, whether they fit the starter (three.js, WebGL2). |

The asset tools read these files: `node tools/assets/find.mjs "<words>"` searches the live APIs and these lists
together.

## The ladder: where each thing in the game comes from

For every item in `my-game/ASSETS.md`, go down this ladder and stop at the first step that fits the game:

1. **A block** (`blocks/catalog.json`): ready-made effects and systems you edit like code.
2. **A CC0 asset**: free, no credit needed. Poly Haven, ambientCG, Kenney, KayKit, Polyfork (pick the no-credit
   licence), Quaternius (QAL: same freedom inside a game), and the CC0 parts of the other sources.
3. **A credit-required asset** (CC BY, OFL with notice, and similar): fine, but write the credit line in
   `my-game/CREDITS.md` and show it in the game's credits screen.
4. **Make it in code**: procedural geometry, shaders, sfxr/ZzFX sounds, BeepBox music, a library from
   `libraries.json`.
5. **Generate it with fal** (costs money; only with the user's yes, within `falCapUSD`).

Before pulling anything, **pick one or two style families** (for example "Kenney low-poly + Poly Haven skies" or
"KayKit + KayKit characters"). Mixing families looks cheap. Look at every candidate before it goes in.

### Good first places to look

| Need | Look here first |
|---|---|
| Sky and lighting | Poly Haven HDRIs (1k-2k), Kenney skyboxes (stylized) |
| Ground, walls, rock, wood | ambientCG, Poly Haven textures; stylized: 3DTextures.me, Kenney textures |
| Low-poly world kits | Kenney 3D, KayKit, Quaternius, Polyfork (API with sizes in metres) |
| Realistic props | Poly Haven models, Amazon Berkeley Objects (heavy), Smithsonian CC0 scans |
| Characters and animation | KayKit Adventurers + Character Animations, Quaternius (Universal Animation Library), Polyfork characters, Kenney Mini Characters, Mixamo (user downloads), 100Avatars (CC BY) |
| 2D sprites and tilesets | Kenney 2D, 0x72 DungeonTileset II, Pixel Frog, GrafxKid, itch.io CC0 listing |
| Sound effects | Kenney audio packs, sfxr.me / ZzFX (make your own), Freesound CC0 (free key), Sonniss GDC bundles |
| Music | BeepBox / JummBox (make your own), incompetech (CC BY, credit), ccMixter / FMA filtered for commercial use |
| Fonts | Google Fonts, Fontsource (OFL), League of Moveable Type |
| Icons | game-icons.net (CC BY 3.0, credit), Lucide, Tabler, Phosphor, Material Symbols, Iconify (one API for all sets) |
| Shaders | CC0 Shaders (port to three.js), libraries in `libraries.json`; never Shadertoy without an explicit licence |

## Can the agent download it itself?

Each source has `agent_fetch`:

- `api`: use the documented API (Poly Haven, ambientCG, Polyfork, Sketchfab search, Google Fonts, Iconify...).
  Send a User-Agent that names the tool. One request at a time. Fetch what you need, not the whole catalogue.
- `direct`: fetch single files by URL (GitHub raw files, Hugging Face `resolve/` links, the ABO S3 bucket).
  Never clone or download a whole multi-GB dataset.
- `allowed`: small, polite fetches of public pages are fine.
- `local`: a generator; nothing to download.
- `manual`: **the user downloads by hand.** The site needs a login, shows a bot check, or asks AI agents not to
  fetch it. Kenney and OpenGameArt both block AI agents by name in their `robots.txt`; ShareTextures' licence
  forbids automated downloads. Give the user the exact page link and one-line click instructions, then work with the
  file they drop in.

Never get around a login, a bot check or a `robots.txt` rule.

## Licence cheat-sheet

| Licence | Use in a game you sell? | Credit? | Watch out |
|---|---|---|---|
| **CC0** (public domain) | Yes | No (kind to give) | Trademarks and real people are still not free. |
| **CC BY** 3.0 / 4.0 | Yes | **Yes**: title, author, licence, link; say if you changed it | Keep the credit line with the file and in the game. |
| **OGA-BY** (OpenGameArt) | Yes | Yes | Like CC BY, without the "no DRM" clause. |
| **CC BY-SA** ("share-alike") | Yes, carefully | Yes | Changed versions must use the same licence. Fine for a sprite you use as is; risky when it is mixed into your own art. Prefer CC0/CC BY. |
| **GPL** (for art) | Risky | Yes | Copyleft; unclear for games. Avoid for assets. |
| **NC** (NonCommercial) | **No** | - | A game with a price, ads, tips or sponsors is commercial. |
| **ND** (NoDerivatives) | **No** (in practice) | - | Resizing, recolouring or cutting a loop can count as a change. |
| **OFL** (fonts) | Yes | Keep the licence file | You may embed the font in the game. Do not sell the font on its own. A changed font must get a new name. |
| **MIT / ISC / BSD / Apache-2.0 / zlib** (code, icons) | Yes | Keep the copyright notice (a `LICENSES` or credits file) | Apache-2.0 also asks you to keep any NOTICE file. |
| **Custom licences** (Quaternius QAL, Polyfork, ShareTextures, CMU mocap, NASA) | Read the source's page | Varies | Most say "use in your game, but do not share the files on their own". Never put such files in a public asset pack or template. |

"Royalty free" and "free download" are not licences. If you cannot find a written licence, do not use it.

## Never use (and why)

Full list with quotes: `avoid` in `catalog.json`.

- **Anything marked NC or ND**, on any site (Sketchfab, Freesound, FMA, ccMixter, itch.io, OpenGameArt). Also
  Sketchfab "Editorial", "Standard" and "Free Standard" models.
- **Shadertoy** code with no licence in its header: the default is CC BY-NC-SA 3.0 (no commercial use).
- **LYGIA** shader library: Prosperity licence (non-commercial; commercial only as a 30-day trial) unless you hold
  the Patron licence.
- **BBC Sound Effects**: personal, educational and research use only.
- **Tabletop Audio**: CC BY-NC-ND.
- **Pixabay and Mixkit** (kit policy): their own licences, not Creative Commons, with limits on sharing the raw files.
- **Fab, Unity Asset Store, TurboSquid, Free3D, CGTrader, Envato "free" files**: account-gated store licences; some
  require that players cannot extract the model, which a browser game cannot promise.
- **"No copyright" music channels**: no written licence, Content ID claims later.
- **Ready Player Me** (shut down January 2026) and **FreePD** (closed): sources gone; re-uploads cannot be trusted.
- **Other people's characters, logos and game names**, even when a model of them is uploaded under CC0 or CC BY.
- **NASA logos** (the "meatball" and "worm") on models, and anything implying NASA endorses the game.

## How to credit

`node tools/assets/get.mjs` appends a credit line to `my-game/CREDITS.md` when it brings a file in. When you add
something by hand, add the line yourself. One line per asset, using the source's `credit_template`, for example:

```
"Barrel" by Polyfork (https://polyfork.dev/asset/barrel-8d63c4), CC BY 4.0
"Forest Nature Pack" by Kay Lousberg (KayKit, https://kaylousberg.com), CC0 (credit optional)
"Sneaky Snitch" Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/
```

Show `CREDITS.md` in the game (a Credits screen or the itch.io page). Crediting CC0 creators is not required but
costs nothing and is good manners. If you changed an asset (recoloured, cut, remixed), add "(modified)".

## Keeping this current

Every file has `checked: "2026-11-14"`. To recheck a source: open its `license_url`, compare with `license_quote`,
update both and the date. Pack lists: see `packs/README.md` (Kenney must not be re-read by a script). Library stars
and last-push dates: `gh api repos/<owner>/<repo>`.
