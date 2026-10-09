# NOTE for Claude: solichin.org

Hi Claude. This is the first version of **solichin.org**, a small site Fred is making for his family, in honor of his father. Please read this before changing anything.

## What the site is

- One screen, designed for phones first (portrait).
- Background: Fred's portrait painting of the Creation of Adam (God above, the two fingers almost touching with light between them, Adam below, a lake and mountains behind).
- The camera flies through the painting like an FPV drone, in a seamless 32 s loop.
- Text: the headline **"a foundation for tomorrow"** decodes letter by letter (a scramble reveal). Then one smaller line fades in: *"We are a family office wanting to create a little good for the world, and to do that we put our faith in God."*
- Keep it minimal and elegant. No menus, no other content.

## How it works (files)

- `public/index.html`, `public/style.css`, `public/app.js`: page, text, scramble, and a light 2D camera (pan and zoom). The 2D camera is the fallback and runs right away under the blurred placeholder.
- `public/drone.js`: the 3D FPV drone. Plain WebGL 1, no libraries, ~18 KB. The painting becomes a relief: a dense mesh pushed out by a depth map (Depth Anything V2), plus an inpainted far layer behind it. Where a near thing (a hand, an arm) passes in front of a far thing, the relief is cut along the real outline, so you see background in the gap rather than a smear. A perspective camera flies a closed spline on the FPV path (wide → OTS God → through the light → OTS Adam → low past the lake → cherubs → wide), with dolly, altitude changes and bank. Additive fingertip glow + cheap DOF. The 3D canvas cross-fades over the 2D layer when it is ready.
  - `KEYS` near the top of `drone.js` is the path. Each key is the point looked at (`u`,`v` from 0 to 1 on the painting), distance `d`, and where the drone sits around that point (`yaw`, `pitch`, `roll` in degrees). `DZ` is how deep the relief is. `LOOP` is seconds per loop (32).
  - Phone preview reference (from the temporary C hosting): `reference/fpv-preview/` (waypoint stills). Do not look "through" the relief from behind — the mesh stretches.
- `public/img/`: `painting-{small,full}` (2D layer, AVIF/WebP/JPG), `painting-3d` (2x upscaled with Real-ESRGAN, 2304x4096), `depth.webp` (red channel = depth of the relief, green = depth of the far layer), `bg` (inpainted far layer).
- `tools/`: `build_images.py` (2D variants, placeholder, og image), `upscale.py` (Real-ESRGAN x2), `depth.py` (Depth Anything V2 Large), `prep3d.py` (depth, far layer, 3D texture), `proof3d.mjs` / `shot.mjs` / `desk.mjs` (headless screenshots, bytes, fps, the loop video).
- `src/portrait-crop.jpg` is the painting. `src/depth16.png` is the raw depth (16-bit).
- `?flat` uses only the 2D camera. `?t=12` freezes the 3D camera at 12 s. `?still` shows the still frame. `?dbg` shows the depth check in false colors.

## Rules

- **Do not deploy.** `wrangler.toml` is ready for Cloudflare Workers static assets, but only deploy when Fred says yes.
- Do not change the words without Fred.
- Respect `prefers-reduced-motion` and Save-Data: these get the still painting and no 3D. Without WebGL, the 2D pan keeps running. Keep these paths working.

## Keep it light on cheap phones

- First load on a phone is about 440 KB in total (HTML, CSS, JS, the 2D painting, and the 3D textures with depth). Keep it under 600 KB.
- AVIF first, then WebP, then JPG. The 3D JPG fallback is smaller (1536 px wide) on purpose.
- The device pixel ratio is capped at 2. If the median frame takes more than 22 ms over 60 frames, the render resolution steps down (to 1x at most). The loop pauses when the tab is hidden.
- The relief mesh is about 186k vertices (every 2nd texel of a 576x1024 depth grid). The far layer is about 47k. If a phone struggles, raise the step in `buildMesh` before you touch anything else.
- No libraries, fonts or trackers. Fonts are system fonts.
- The fps in `proof/report-3d.json` was measured with SwiftShader, which renders on the CPU, so it is a worst case. It is **not** a phone measurement. Please check on a real mid-range Android in Chrome with a 4x CPU throttle in remote devtools, and on an iPhone in Safari.

## Known rough spots (please improve)

- Far-layer inpaint is multi-pass Telea+NS with a landscape seed (see `tools/prep3d.py`). LaMa would still look better at strong angles if you can run it.
- Fingertip glow is an additive billboard in `drone.js` (`GLOW`) so depth tears no longer snuff the light. Tune `GLOW.u/v/size` if the painting shifts.
- Cheap shallow DOF is a 5-tap blur in the fragment shader, focused on the look-at distance (WebGL1 cannot mipmap these NPOT textures). It auto-disables if frames stay over ~28 ms. A half-res blur FBO would be sharper if a mid-range phone still holds 60 fps.
- Texture wrap is clamp (not mirror). Keys stay inset; if you see a flat edge colour, pull that key further inside the frame.
- Extreme look-backs (from Adam's side staring back through God's face) stretch the 2.5D mesh. Prefer OTS and skim passes over true through-and-look-back.

## What the drone shot looks like (reference: 20 s X video, stills in reference/frames/)

The reference is NOT a flat pan or zoom. It is a real 3D camera flying through the scene: the figures turn as the camera moves around them, near things slide past fast and far mountains barely move (parallax), and focus shifts like a real lens.

Second by second:
- 0-1 s: Still wide shot of the whole scene, everything sharp.
- 1-5 s: Fast push in, sliding right and rising toward God. God's face and shoulder fill the foreground and move fast against the slow mountains behind. Background goes soft (shallow focus).
- 5-9 s: Camera curves around God's shoulder and keeps gliding forward along the reaching arm. Focus moves from God to the two hands, then to Adam's face. Smooth medium speed.
- 9-13 s: Camera passes the hands and circles around behind Adam's back. His back fills the foreground; the valley behind is blurred.
- 13-18 s: Fast pull back, swinging around to the front, revealing the whole scene again. Speeds up with smooth easing.
- 18-20 s: Settles into exactly the starting wide shot, everything sharp again, so the loop is seamless.

Feel: cinematic, seamless loop, 3D orbit, strong parallax, shallow depth of field, sweeping, photographic.

## Fred's FPV version (vertical, for phones) — current `KEYS`

9:16 portrait, first-person feel (you are the drone), 32 s seamless loop:
wide hover → push to God's face → OTS down His arm → through the light between the fingers → past the spark along Adam's arm → OTS Adam's face → sweep low under Adam past the lake → rise back toward the light → cherubs → pull out to the same wide hover.

Stills that defined this pass lived temporarily at https://github.com/spcpza/C/pull/1 (`preview/foundation-fpv/`); copies of the stills are in `reference/fpv-preview/`.

Ready-to-paste image-to-video prompt (use the portrait painting as the start AND end frame):

"Vertical 9:16 cinematic drone fly-through of this painting, seamless loop, 10 seconds. Start close on God's face. Glide down along His arm to the glowing light where the two fingers almost touch, slow down there. Continue along Adam's raised arm to his face, then sweep low and around beneath Adam, skimming the rocks with the lake and mountains sliding past in the background. Rise back up toward the light, then climb through the cherubs and arc over the top to return to God's face, ending on exactly the first frame. Real 3D camera movement with strong parallax: near figures and clouds pass close to the lens while far mountains move slowly; figures keep their exact appearance; shallow depth of field with gentle focus shifts; smooth, eased, no cuts, no morphing, no new people, no text."
