# solichin.org (prototype, not deployed)

A one-screen family site, made for phones first: an FPV drone flies through Fred's painting while "a foundation for tomorrow" decodes on top of it. Read `NOTE.md` first.

- `public/` is the whole site. Preview it with `python3 -m http.server 8787 -d public`.
- 3D FPV drone: `public/drone.js` (WebGL 1, no libraries, 32 s loop). The 2D pan in `app.js` is the fallback. Reduced motion and Save-Data get a still frame.
- FPV still reference: `reference/fpv-preview/` (from the temporary C phone preview).
- URL flags: `?flat` (2D only), `?t=12` (freeze at 12 s), `?still`, `?dbg` (depth check colors).
- Swap the painting:
  1. `.venv/bin/python tools/build_images.py src/<painting>.jpg` builds the 2D variants, placeholder and og image.
  2. `.venv/bin/python tools/depth.py src/<painting>.jpg src/depth.npy` runs Depth Anything V2 Large on the CPU.
  3. `.venv/bin/python tools/upscale.py src/<painting>.jpg src/<painting>-x2.png` runs Real-ESRGAN x2. It needs `tools/models/RealESRGAN_x2plus.pth`.
  4. `.venv/bin/python tools/prep3d.py src/<painting>.jpg src/depth16.png src/<painting>-x2.png` builds the depth, far layer and 3D texture.
  5. Retune `KEYS` in `drone.js`.
- Python deps: `opencv-python-headless pillow numpy torch transformers spandrel`. Node: `npm i` (puppeteer, for proof only).
- Proof: `node tools/proof3d.mjs` gives bytes, fps, waypoint shots, the desktop view and the fallbacks. Add `FRAMES=1` for the full-loop frames. `node tools/shot.mjs 0 8 16` takes quick shots.
- `wrangler.toml` is ready for Workers static assets. Do not deploy without Fred's yes.
