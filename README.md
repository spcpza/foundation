# A foundation for tomorrow

The landing page of a family office. It names no one: the vision is the point.

**A living painting.** Thousands of brushstrokes are painted live in WebGL2, each laid along the current of the picture the way Van Gogh laid his. The page opens on a starry night: a swirling sky, haloed stars, a crescent moon and a cypress. Scrolling repaints the canvas stroke by stroke, outward from the sun, into a harvest at dawn: a great sun over blue hills, standing wheat and cut stubble, and many labourers at work. Reapers bend at the wheat, gleaners stoop, one man shoulders a sheaf, another kneels to bind one, and stooks stand in the field. The type nods to Michelangelo's Rome: Cinzel inscriptional capitals with Cormorant italic. Matthew 9:37 closes the page.

- `public/` is the whole site: plain HTML/CSS plus one ES module (`main.js`) with raw WebGL2 and no libraries. No build step, and no images in the painting. Preview: `npm run serve` → http://localhost:8787
- `main.js` contains:
  - **`SCENE` (GLSL):** `night(p, dir)` and `dawn(p, dir)` give, for any point, the colour and the direction a brush would travel there. `DET` is the brush size for that spot, smaller for people, stars and the cypress. Big brushes keep clear of people, and small brushes are depth-sorted on top. `person()` holds the four working poses; `F[]` places the labourers.
  - **Strokes:** three passes (underpainting, body, fine), laid on a jittered grid. The brush texture is generated: a loaded head, bristles and a dry tail.
  - **Motion:** a coherent "wind" drifts each stroke along its own direction. Scroll (0..1) drives `MIX`, which repaints night→dawn stroke by stroke, outward from the sun.
  - **Proof hook:** `window.__scene.renderAt(p)`.
- Reduced motion: the painting holds still and simply follows the scroll. No WebGL2: a painted-colour gradient behind the words.
- `tools/shots.mjs`: screenshots at scroll stops, phone and desktop (`npm i` first). `tools/og.mjs`: renders `public/og.jpg` and prints fps.
- Deploy: `npx wrangler deploy` (Workers static assets). Plain deploy goes to the workers.dev preview only; solichin.org needs the custom domain attached.
