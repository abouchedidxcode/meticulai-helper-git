# Kevin MacLeod / incompetech.com

Background music in any genre (orchestral, chiptune-ish, jazz, horror, comedy) when you can show a credits line.

Site: https://incompetech.com/music/royalty-free/music.html

## Licence

**CC-BY-4.0**

> No charge. Requires that you credit the music.

Source: https://incompetech.com/music/royalty-free/licenses/ (checked 2026-11-14)

- Credit required: Yes. Credit line: `"{title}" Kevin MacLeod (incompetech.com) / Licensed under Creative Commons: By Attribution 4.0 / https://creativecommons.org/licenses/by/4.0/`
- Commercial use OK: Yes
- AI-generated content: No

## What is there

- Kinds: music
- Styles: any
- Approx count: ~2,000
- Formats: mp3
- Access: site. no key, no account; one mp3 download link per track page; no API. Docs: https://incompetech.com/music/royalty-free/faq.html

## How to search and download

- Browse or filter by genre/feel at https://incompetech.com/music/royalty-free/music.html (search box and "Full Search" with feel, tempo, genre filters).
- Open a track page and use its download link (mp3). There is no API; download one track at a time, by hand or with one curl per chosen track.
- Convert to ogg if you want smaller files for the web (e.g. `ffmpeg -i in.mp3 -c:a libvorbis -q:a 4 out.ogg`).
- Add the three-line credit to the in-game credits screen.

## Good for / not for

- Good for: Background music in any genre (orchestral, chiptune-ish, jazz, horror, comedy) when you can show a credits line.
- Not for: Games with no credits screen; a unique sonic identity (these tracks are heard in thousands of videos).

## Gotchas

- Credit is mandatory and must be in the game itself; the FAQ says a "Credits" screen in the settings menu is the usual place.
- Use his exact three-line credit format (title + "Kevin MacLeod (incompetech.com)", licence name, licence URL).
- Very widely used: players and streamers will recognise many tracks.
- If the game will be streamed, the FAQ asks you to email him so he can whitelist the title (avoids Content ID noise).
- Paid Standard License exists only for cases where you cannot credit; you do not need it for a game with a credits screen.
