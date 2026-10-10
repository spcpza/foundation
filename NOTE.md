# NOTE for Claude: solichin.org

Hi Claude. This is the first version of **solichin.org**, a small site Fred is making for his family, in honor of his father. Please read this before changing anything.

## What the site is

- One screen, designed for phones first (portrait).
- Background: a Creation of Adam landscape painted for first-person flight (Adam lower-left, God upper-right, valley behind the fingertip gap). Source: `src/creation-fpv.jpg`.
- The camera is a true POV / FPV drone: it flies a path close over the relief and looks toward where it's going (not an orbit pan), in a seamless ~20 s loop matched to the Socoloff references.
- Text: the headline **"a foundation for tomorrow"** decodes letter by letter (a scramble reveal). Then one smaller line fades in: *"We are a family office wanting to create a little good for the world, and to do that we put our faith in God."*
- Keep it minimal and elegant. No menus, no other content.

## References (do not lose these)

- https://x.com/socoloffalex/status/2108150104964452791 — Creation of Adam FPV (primary)
- https://x.com/socoloffalex/status/2108519572714209408 — Fallen Angel FPV sibling
- Frames + notes: `reference/socoloff/`, `REVERSE_ENGINEERING.md`
- REA toolkit for inspecting shipped sites/apps: https://github.com/morluto/rea

## How it works (files)

- `public/index.html`, `public/style.css`, `public/app.js`: page, text, scramble, and a light 2D camera fallback.
- `public/drone.js`: 3D POV drone (WebGL 1, no libraries). Relief mesh + inpainted far layer. Camera flies **positions** and looks along velocity. Additive fingertip glow + DOF.
  - `KEYS`: `u,v` position, `h` height, `roll`. Look from velocity. `LOOP` ≈ 20 s.
- `public/img/`: `painting-{small,full}`, `painting-3d`, `depth.webp`, `bg`.
- `tools/`: `build_images.py`, `depth.py`, `prep3d.py`, `proof3d.mjs`, …
- `?flat` / `?still` / `?t=12` / `?dbg` as before.

## Rules

- **Do not deploy** without Fred's yes.
- Do not change the words without Fred.
- Respect `prefers-reduced-motion` and Save-Data.
- New scene art is OK when it serves first-person POV; keep the family copy.

## Keep it light

- First load under ~600 KB (currently ~270 KB AVIF path).
- No libraries, fonts, or trackers.

## Ideal next step

Generate an AI image-to-video fly-through from `public/img/drone-start.jpg` (start = end frame) using the prompt below, drop into `public/video/flight.mp4`, set `VIDEO` in `app.js`. Needs Cloudflare AI credits or another I2V key.

Prompt:

"Vertical 9:16 cinematic first-person drone fly-through of this painting, seamless 20 second loop. Start on the wide shot of Adam (lower-left) and God (upper-right) over the mountain valley. Push in and skim past God's shoulder looking forward, glide down His arm, fly through the gap between the fingertips, continue along Adam's arm past his face, curve past his near side over the rocks, then pull back smoothly to the exact starting wide frame. Real 3D camera movement with strong parallax and shallow depth of field; figures keep their exact appearance; no cuts, no morphing, no text, no new people."
