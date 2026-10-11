# A foundation for tomorrow

The landing page of a family office. It names no one: the vision is the point.

**A living painting.** Thousands of brushstrokes are painted live in WebGL2, each laid along the current of the picture the way Van Gogh laid his. Both pictures show *a foundation for tomorrow*, drawn from Revelation:

1. **Night: the foundations are laid.** A swirling starry sky with seven stars (Rev 1:20) and a cypress. The bright and morning star (Rev 22:16) stands low over the city's foundations, three courses of the twelve jewel stones (Rev 21:19-20) laid in the dark earth and catching its light.
2. **Morning: the city that hath foundations (Heb 11:10).** Scrolling repaints the canvas stroke by stroke, outward from the light, into the holy city built on those same stones:
   - a wall and towers of gold like clear glass, and three gates of pearl (Rev 21:18-21)
   - no sun, for the city is the light (21:23), with an emerald bow round about (4:3)
   - the river of life flowing out to us, and trees of life on both banks bearing twelve fruits (22:1-2)
   - the nations in white robes with palms, walking toward it (7:9; 21:24)

The page names no one. The type nods to Michelangelo's Rome: Cinzel inscriptional capitals with Cormorant italic.

- `public/` is the whole site: plain HTML/CSS plus one ES module (`main.js`) with raw WebGL2 and no libraries. No build step, and no images in the painting. Preview: `npm run serve` → http://localhost:8787
- `main.js` contains:
  - **`SCENE` (GLSL):** `night(p, dir)` and `dawn(p, dir)` give, for any point, the colour and the direction a brush would travel there. `DET` is the brush size for that spot, smaller for people, stars and the cypress. Big brushes keep clear of people, and small brushes are depth-sorted on top. `foundation()` is shared by both pictures, so the stones stay in place while they are repainted. `pilgrim()` draws one robed figure, and `P[]` places them.
  - **Strokes:** three passes (underpainting, body, fine), laid on a jittered grid. The brush texture is generated: a loaded head, bristles and a dry tail.
  - **Motion:** a coherent "wind" drifts each stroke along its own direction. Scroll (0..1) drives `MIX`, which repaints night→dawn stroke by stroke, outward from the sun.
  - **Proof hook:** `window.__scene.renderAt(p)`.
- Reduced motion: the painting holds still and simply follows the scroll. No WebGL2: a painted-colour gradient behind the words.
- `tools/shots.mjs`: screenshots at scroll stops, phone and desktop (`npm i` first). `tools/og.mjs`: renders `public/og.jpg` and prints fps.
- Deploy: `npx wrangler deploy` (Workers static assets). Plain deploy goes to the workers.dev preview only; solichin.org needs the custom domain attached.
