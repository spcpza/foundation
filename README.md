# A foundation for tomorrow

The landing page of a family office. It names no one: the vision is the point.

**A living painting: Michelangelo's world, finished.** Two Sistine Chapel frescoes are grown past Michelangelo's frame into whole paintings, then repainted live in Van Gogh's brushwork, stroke by stroke. Night turns to day (Gen 1:5):

1. **Night: Ivan Aivazovsky, *Chaos. The Creation* (1841).** God appears as a figure of light breaking through the storm over the dark deep: "darkness was upon the face of the deep… Let there be light" (Gen 1:2–3). Phones see his canvas whole (glare edge cropped). Desktops see it widened by `tools/widen.py` (his canvas kept exactly; the storm and sea continued either side, colour-matched band by band) with the seams healed by `tools/seams.py`. The brush is calmer and finer at night, the fine work around God's light especially, and the ground beneath is his own soft painting.
2. **Day: *The Creation of Adam*, Michelangelo's own figures, untouched.** Scrolling repaints the canvas outward from the hands into the finished world. Adam lies on his hill, and below opens the Garden of Eden: a valley with a winding path, cypresses and leafy trees, and roses and wildflowers. *Beloved, I wish above all things that thou mayest prosper and be in health, even as thy soul prospereth* (3 John 1:2).

3. **The Last Supper: Leonardo da Vinci (1495–98).** Scrolling repaints the day outward from Christ into the upper room. *For I was an hungred, and ye gave me meat … I was sick, and ye visited me* (Matthew 25:35–36). The 17th-century doorway cut through the bottom of the wall is repainted (`tools/supper.py`: tablecloth, Christ's feet, the floor). Phones see the centre of the table, with the ceiling and floor continued by `tools/tallen.py`.

The figures are painted, not sprinkled: extra strokes are laid in proportion to each painting's detail. Named faces and hands (`dayFine` in `scene.json`) always get the finest brush. God's face in the day was repainted at full resolution (`tools/face.py`).

**How the frescoes were finished** (SDXL inpainting, run on this machine):
- `tools/whole.py` grows each fresco:
  - a painter's underpainting sketch, then a global pass at reduced strength
  - the old plaster is carried into the world's own colour
  - a band across the old frame is covered
  - a unifying pass, then his figures laid back exactly
  - the sun and moon completed from his own halves
- `tools/refine.py` melts the plaster around the figures into the sky.
- `tools/populate.py` blocks in trees and flowers on the land and lets the model paint them.

The brushwork has dynamics ("Beethoven, not Bach"): a wide spread of stroke sizes, great sweeps in the open sky, bent strokes with pressure, and broken colour. Faces and hands stay steady.

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
