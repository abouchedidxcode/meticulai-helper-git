# Test fixtures for the vibes tools

Three made-up vibes for testing `tools/vibes/*.mjs`. They are not real vibes (the real ones live in `vibes/`), and
their "mood pictures" are just copies of the island starter's preview.

Use them with `--from`:

    node tools/vibes/list.mjs --from tools/vibes/fixtures
    node tools/vibes/apply.mjs fixture-paper-toy --from tools/vibes/fixtures --dir .starters-work/_looks
    node tools/vibes/render.mjs --from tools/vibes/fixtures
    node tools/vibes/build-gallery.mjs --from tools/vibes/fixtures
    node tools/vibes/open.mjs --from tools/vibes/fixtures --no-open

`render.mjs` and `build-gallery.mjs` write their results into this folder when run this way
(`in-kit-*.jpg`, `catalog.json`, `GALLERY.md`, `gallery.html`); those files are safe to delete.
