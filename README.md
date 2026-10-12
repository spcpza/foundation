# A foundation for tomorrow

The landing page of a family office. It names no one: the vision is the point.

**A living painting: Michelangelo's world, finished.** Two Sistine Chapel frescoes are grown past Michelangelo's frame into whole paintings, then repainted live in Van Gogh's brushwork, stroke by stroke. Night turns to day (Gen 1:5):

1. **Night: God makes the lights** (*The Creation of the Sun and Moon*, Gen 1:16). The heavens are grown out in clouds, with the sun and moon whole, and graded to night. God stays lit.
2. **Day: *The Creation of Adam*.** Scrolling repaints the canvas outward from the hands into the whole scene: sky and clouds, Adam's hillside running to the ground, distant blue mountains. *And God saw every thing that he had made, and, behold, it was very good* (Gen 1:31).

**Growing the frescoes** (`tools/whole.py`, SDXL inpainting run locally):
- one global pass, so the composition is coherent
- one unifying pass over the new area plus a band across the old frame edge, so no frame line survives
- Michelangelo's figures and inner plaster laid back exactly
- the sun and moon completed from his own halves

Sources: `src/` (public domain, Wikimedia Commons). Results: `src/grown/`.

- `public/` is the whole site: plain HTML/CSS plus one ES module (`main.js`) with raw WebGL2 and no libraries. No build step. Preview: `npm run serve` → http://localhost:8787
- `tools/flow.py <src> <name> <maxw>` prepares a fresco: `public/img/<name>.webp`, plus `<name>-flow.webp`. The flow map holds the stroke direction (structure tensor), coherence, the bare-plaster mask (pale areas connected to the edge) and detail (which sets brush size).
- `main.js` contains:
  - **`night()` / `dawn()` (GLSL):** grade each fresco and swap its plaster for a painted world (`starry()` / `sunlit()`).
  - **`place()`:** positions each figure layer (anchor, rotation, width). `night()`, `dawn()`, `earth()` and `earthPaint()` complete the world around the figures.
  - **Strokes:** three passes, with the brush size taken from detail, so faces and hands stay readable. Small brushes are depth-sorted on top. Scroll drives `MIX`, the repaint outward from `LC` (the hands).
  - **Proof hooks:** `window.__scene.renderAt(p)`, or `?p=0.9` in the URL to hold the scroll at 90%.
  - **Phones** (narrow screens) get a smaller brush (×0.6) and about 2.7× the strokes, so faces stay readable at iPhone size.
- Reduced motion: the painting holds still and simply follows the scroll. No WebGL2: a painted-colour gradient behind the words.
- `tools/viewports.mjs`: night and day at seven screen shapes (iPhone SE to ultra-wide); `?p=` holds the scroll.
- `tools/shots.mjs`: screenshots at scroll stops, phone and desktop (`npm i` first). `tools/og.mjs`: renders `public/og.jpg` and prints fps.
- Deploy: `npx wrangler deploy` (Workers static assets). Plain deploy goes to the workers.dev preview only; solichin.org needs the custom domain attached.
