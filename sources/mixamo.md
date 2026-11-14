# Mixamo (Adobe)

Auto-rigging a humanoid and adding walk/run/jump/attack/idle animations for a 3D browser game.

Site: https://www.mixamo.com

## Licence

**LicenseRef-Adobe-Mixamo**

> You can use both characters and animations royalty free for personal, commercial, and non-profit projects

Source: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html (checked 2026-11-14)

- Credit required: No. Credit line: `No credit required.`
- Commercial use OK: Yes
- AI-generated content: No

## What is there

- Kinds: animation, model
- Styles: realistic, stylized
- Approx count: not stated
- Formats: fbx, dae
- Access: site. free, but needs an Adobe account login; no public API; user downloads by hand. Docs: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html

## How to search and download

- User signs in at https://www.mixamo.com, uploads a T-pose FBX/OBJ (or picks a Mixamo character), runs the auto-rigger.
- User picks animations, downloads FBX (first one "with skin", the rest "without skin"), drops them into a project folder.
- Agent then converts to glb in Blender (headless script) and wires the clips in three.js AnimationMixer.

## Good for / not for

- Good for: Auto-rigging a humanoid and adding walk/run/jump/attack/idle animations for a 3D browser game.
- Not for: Non-humanoid characters (biped humanoids only); redistributing animation files as an asset pack.

## Gotchas

- Needs an Adobe account. The agent cannot log in or download for the user: the user uploads/downloads by hand and puts the FBX files in the project.
- Royalty-free in commercial games, no credit, but raw character/animation files must not be redistributed on their own (no "animation pack" or template that ships the raw files as the product).
- Export FBX, then convert to glb in Blender (merge animations into one file, check scale and root motion).
- Licence page blocks scripted fetching; the quote was confirmed through Adobe's help page text in search results on 2026-11-14.
