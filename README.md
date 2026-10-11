# solichin.org

The landing page of the Solichin family office: **A foundation for tomorrow.**

**A living painting.** Thousands of brushstrokes are painted live in WebGL2, each laid along the current of the picture the way Van Gogh laid his. The page opens on a starry night: a swirling sky, haloed stars, a crescent moon and a cypress. Scrolling repaints the canvas stroke by stroke, outward from the sun, into the Sower's dawn: a great sun over ripe wheat, violet and orange furrows, and the sower striding toward the light. The type nods to Michelangelo's Rome: Cinzel inscriptional capitals with Cormorant italic. Galatians 6:9 closes the page.

- `public/` is the whole site: plain HTML/CSS plus one ES module (`main.js`) with raw WebGL2 and no libraries. No build step, and no images in the painting. Preview: `npm run serve` → http://localhost:8787
- `main.js` contains:
  - **`SCENE` (GLSL):** `night(p, dir)` and `dawn(p, dir)` give, for any point, the colour and the direction a brush would travel there. `DET` is the brush size for that spot, smaller for the sower, stars and cypress.
  - **Strokes:** three passes (underpainting, body, fine), laid on a jittered grid. The brush texture is generated: a loaded head, bristles and a dry tail.
  - **Motion:** a coherent "wind" drifts each stroke along its own direction. Scroll (0..1) drives `MIX`, which repaints night→dawn stroke by stroke, outward from the sun.
  - **Proof hook:** `window.__scene.renderAt(p)`.
- Reduced motion: the painting holds still and simply follows the scroll. No WebGL2: a painted-colour gradient behind the words.
- `tools/shots.mjs`: screenshots at scroll stops, phone and desktop (`npm i` first). `tools/og.mjs`: renders `public/og.jpg` and prints fps.
- Deploy: `npx wrangler deploy` (Workers static assets). Plain deploy goes to the workers.dev preview only; solichin.org needs the custom domain attached.
