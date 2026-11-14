# Polyfork

Low-poly props, buildings, vehicles, animals and rigged characters in themed kits that share one palette and real-world scale; a quick agent-friendly API with sizes in metres.

- Site: https://polyfork.dev
- Licence: **CC-BY-4.0 (free mesh files) or Polyfork licence**. Credit required: **no**. Commercial games: **yes**. AI-generated: **yes**.
- What: model, animation; styles: lowpoly; about 3326 items; formats: glb, mjs, fbx, usdz, obj.
- Can an agent fetch it? **api** (api = use the API; direct = fetch single files by URL; allowed = small polite fetches; manual = the user downloads by hand).
- Checked: 2026-11-14 (licensing page read and live API test 2026-11-14).

## Licence

> The mesh files of the free low poly models are yours under CC BY 4.0 or under the Polyfork licence, whichever suits you. ... The Polyfork licence: no credit at all, but no redistributing the files themselves.

Source: https://polyfork.dev/licensing

## Credit line

Not required, but kind and cheap. Suggested line for `my-game/CREDITS.md`:

```
"{title}" by Polyfork ({url}), CC BY 4.0
```

## How to search and download

```bash
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://polyfork.dev/api/assets?q=barrel&per_page=5"
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://polyfork.dev/api/assets/barrel-8d63c4"          # one asset: size, palette, licence, URLs
curl -s -H "User-Agent: meticulai-helper-git/1.0" "https://polyfork.dev/api/assets/barrel-8d63c4/matching" # assets from the same kit / palette / scale
curl -s -H "User-Agent: meticulai-helper-git/1.0" -o barrel.glb "https://polyfork.dev/cdn/barrel-8d63c4.glb"
```
- Filters: `q`, `kit`, `class` (prop, building, vehicle, character, animal, terrain...), `max_triangles`, `ik`, `sort`, `page`, `per_page` (max 100).
- Every row: `size_m` (metres), `triangles`, `kit`, `thumbnail`, `download.glb`. Use the `/cdn/` URL (robots.txt disallows `/dl/`).
- For agents: `https://polyfork.dev/llms.txt` and `https://polyfork.dev/prompt.txt`.

## Good for / not for

- Good for: Low-poly props, buildings, vehicles, animals and rigged characters in themed kits that share one palette and real-world scale; a quick agent-friendly API with sizes in metres.
- Not for: Hand-made or realistic looks; training or building any asset generator (forbidden by its licence).

## Gotchas

- Pick one of two licences per use: (a) Polyfork licence: no credit, but the files may not be re-shared outside your game; (b) CC BY 4.0 (free mesh files only): credit "<Model> by Polyfork (<page url>), CC BY 4.0" and you may re-share. Inside a shipped game either works; in a public repo use CC BY and credit.
- The .mjs source modules and HD editions are never CC BY: do not re-share them. HD editions need a paid plan.
- Made with code by an AI-driven "factory" (site footer: "AI-native 3D assets made with code").
- Send a User-Agent that names the tool, fetch one model when needed (not the catalogue in bulk), back off on HTTP 429. robots.txt disallows /dl/: use the /cdn/ URLs from the API.
- Characters share a Mixamo-named skeleton; Idle/Walk/Run clips are Quaternius UAL (CC0).
