# Freesound

Any specific real-world sound effect (footsteps, doors, impacts, ambience, UI clicks) and field recordings.

Site: https://freesound.org

## Licence

**mixed**

> Some sounds you cannot use commercially, and many of the sounds you need to credit the author.

Source: https://freesound.org/help/faq/ (checked 2026-11-14)

- Credit required: Yes. Credit line: `"{title}" by {author} ({url}), licensed under {license}`
- Commercial use OK: Yes (only for items whose own licence allows it; see gotchas)
- AI-generated content: No

## What is there

- Kinds: audio
- Styles: any
- Approx count: ~600,000
- Formats: wav, flac, ogg, mp3, aiff
- Access: api. free account + free API key (token) needed even for search; unauthenticated search returns 401 (tested 2026-11-14). Search and previews work with the token; original-file download needs OAuth2. Docs: https://freesound.org/docs/api/resources_apiv2.html

## How to search and download

- Get a key: the user signs in and applies at https://freesound.org/apiv2/apply ("Client secret/Api key" column). Store it as FREESOUND_API_KEY in .env (never commit it).
- Test (no key, should print 401):
```
curl -s -o /dev/null -w "%{http_code}" "https://freesound.org/apiv2/search/text/?query=jump"
```

- Search CC0 only, with the fields you need (key from env):
```
curl -s -G "https://freesound.org/apiv2/search/text/" \
  --data-urlencode "query=jump" \
  --data-urlencode 'filter=license:"Creative Commons 0"' \
  --data-urlencode "fields=id,name,username,license,url,previews,duration" \
  -H "Authorization: Token $FREESOUND_API_KEY"
```

- Download the `previews["preview-hq-ogg"]` URL of the chosen result. For the original wav/flac the user downloads by hand on the site (logged in) or you implement OAuth2.
- Without the API: on the site, search, then use the left-side "License" facet and pick "Creative Commons 0" (or "Attribution").

## Good for / not for

- Good for: Any specific real-world sound effect (footsteps, doors, impacts, ambience, UI clicks) and field recordings.
- Not for: Projects that cannot track per-sound licences; bulk scraping (use their Data Packs portal instead).

## Gotchas

- Licence is per sound: CC0, CC BY (Attribution) or CC BY-NC (Attribution NonCommercial). Always filter: NC sounds are not allowed in a commercial game.
- API filter for CC0 only: filter=license:"Creative Commons 0". Attribution sounds: filter=license:"Attribution". Never use "Attribution NonCommercial".
- CC BY sounds need a credit line per sound (title, author, link, licence). CC0 needs none, but crediting is polite.
- The API key belongs to the user: the user must create a free account and apply at https://freesound.org/apiv2/apply, then put the key in .env. The agent must never create accounts.
- Original files need OAuth2 (Download Sound is "OAuth2 required"); the token gives HQ previews (preview-hq-ogg ~192 kbps, preview-hq-mp3 ~128 kbps), which are fine for browser games.
- Record the sound id, author and licence in the credits file at download time; licences can differ between sounds in the same pack.
