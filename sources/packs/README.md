# Pack lists

One file per source whose assets come as downloadable packs (zips). Tools read these files; nobody has to crawl the
sites again to search them.

| File | Packs | Built from | Agent may download? |
|---|---|---|---|
| `kenney.json` | 217 | kenney.nl asset listing (14 pages) + each 3D, audio and texture pack page | No. The user downloads (see below). |
| `kaykit.json` | 17 | kaylousberg.com/game-assets + each pack page + the KayKit-Game-Assets GitHub org | Yes when `download` is set (GitHub zip); otherwise the user downloads from itch.io. |
| `quaternius.json` | 84 | quaternius.com home page + each pack page | No. Google Drive folders and itch.io pages need a person. |

Checked: 2026-11-14.

## Format

```json
{ "checked": "2026-11-14", "source": "kenney", "agent_fetch": "manual", "notes": "...",
  "packs": [{ "id": "mini-characters", "name": "Mini Characters", "url": "<pack page>",
    "download": "<direct zip url or null>", "download_page": "<where a person clicks Download>",
    "kinds": ["model", "animation"], "style": "lowpoly", "tags": ["character", "people"], "count": 40,
    "preview": "<image url or null>", "license": "CC0-1.0" }] }
```

Extra fields some files carry: `what` (one line from the pack page), `formats`, `series`, `category`, `github`,
`notes`, `released`, `page_license_label` (Quaternius: the licence word the pack page shows).

`count` is the number of models or files the pack page states (null when not read). `style` is a best guess from the
pack name and the site's categories: always look at the preview before trusting it.

## Licence notes

- **Kenney**: every pack is CC0 (the pack page and the `License.txt` in the zip say so).
- **KayKit**: every free pack page says "Free for personal and commercial use, no attribution required. (CC0
  Licensed)". EXTRA and SOURCE tiers on itch.io are paid and not listed here.
- **Quaternius**: 82 pack pages say CC0, the 2 newest say QAL. The site's licence page (Quaternius Asset License v1.0,
  updated 2026-08-28) says it covers assets from any site. Treat all of them as QAL: free in games, no credit needed,
  but never share the files on their own (asset packs, templates, public "models" folders).

## Downloads that need a person

When `download` is null, ask the user in plain words:

> Please open this page: `<download_page>`. Click Download (for itch.io, choose the free option: type 0 or click
> "No thanks, just take me to the downloads"). Then drag the zip into the game folder and tell me its name.

Then pass the zip to the asset tools with `--zip <path>`.

**Kenney is a special case.** kenney.nl's `robots.txt` blocks AI agents by name (`Claude-User`, `ChatGPT-User` and
others) and tells every robot to stay out of `/assets/` and `/downloads/`. So tools must not fetch pack pages or
download links from kenney.nl. The pack list here was read once on 2026-11-14 (about 85 requests, 1.5-2 s apart);
do not refresh it with a script.

## How to refresh (KayKit and Quaternius only)

Neither site has a `robots.txt` (both return 404 on 2026-11-14). Be gentle: one request every 2 seconds, a plain
User-Agent, no parallel requests.

- **KayKit**: fetch `https://kaylousberg.com/game-assets`. Each pack is an
  `<a href='https://kaylousberg.com/game-assets/<slug>' class='... project <Categories>'>` holding a
  `background-image:url("<preview>")` and `<div class='overlay'><Name></div>`. Fetch each pack page; the itch.io link
  is the `kaylousberg.itch.io/...` href, the licence line is "(CC0 Licensed)", the count is the first
  "<n>+ Low poly" / "contains <n>" number. GitHub copies: `gh api users/KayKit-Game-Assets/repos`.
- **Quaternius**: fetch `https://quaternius.com/`. Each pack is a `<div class="pack">` with
  `href="/packs/<slug>.html"`, `class="PackText"><Name>`, thumbnail `/assets/images/thumbnails/<slug>.jpg` and
  `class="viewtag tags">` tags. Each pack page shows `Models <n>`, a `Formats` list, `License CC0|QAL`, a release
  month, and a Google Drive or itch.io download link.
- **Kenney**: do not refresh automatically. If new packs matter, a person can look at https://kenney.nl/assets
  and add rows by hand (category, series, preview image URL from the page).

Write the new files with the same fields, update `checked`, and run
`node -e "JSON.parse(require('fs').readFileSync('sources/packs/<file>.json','utf8'))"`.
