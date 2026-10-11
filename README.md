# A foundation for tomorrow

The landing page of a family office. It names no one: the vision is the point.

**A living painting: Michelangelo's figures in Van Gogh's hand.** Thousands of brushstrokes are painted live in WebGL2, each laid along the forms of a Sistine Chapel fresco beneath it. The night turns to day (Gen 1:5):

1. **Night: God makes the lights** (*The Creation of the Sun and Moon*, Gen 1:16). God is cut free of the plaster into a whole Starry Night: a swirling sky, small stars, far blue hills, a sleeping village with a church spire, and a cypress. The sun and moon are made whole discs.
2. **Day: *The Creation of Adam*.** The figures stand in a whole Provençal landscape: clouds, blue mountains, green fields with wheat and olive trees, cypresses at both edges, and grass with poppies. Adam's hill melts into the land. On tall screens the scene is turned so the two hands meet on the diagonal. Scrolling repaints the canvas stroke by stroke, outward from the gap between the two hands, into full daylight. *And God saw every thing that he had made, and, behold, it was very good* (Gen 1:31).

The page names no one. Frescoes: Michelangelo, Sistine Chapel ceiling, 1508–12, public domain via Wikimedia Commons (`src/`).

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
