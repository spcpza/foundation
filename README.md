# solichin.org

The landing page of the Solichin family office: **A foundation for tomorrow.**

**The Cornerstone.** A gold cornerstone floats alone in the dark. As you scroll, ivory stones fall into place around it, course by course, until a foundation stands, and the light turns from night to dawn. Isaiah 28:16: *"a precious corner stone, a sure foundation."*

- `public/` is the whole site: plain HTML/CSS plus one ES module (`main.js`) using three.js from jsdelivr. No build step. Preview: `npm run serve` → http://localhost:8787
- `main.js` contains:
  - **Words:** split into spans; one fixed "slide" is active per screen of scroll (`.panel.active`).
  - **Scene:** spotlight pool, softbox studio env (what the gold reflects), procedural limestone texture, 4 courses in running bond (`W`, `Z`, `COURSES`).
  - **Motion:** `KEYS` is the camera path over scroll (0..1). Each stone's fall time is spread over 0.10–0.70. The dawn light runs over 0.35–1. Phones stand back (`reach`), and `setViewOffset` lifts the subject above the words.
  - **Proof hook:** `window.__scene.renderAt(p)`.
- Reduced motion: no damping, drift or grain; words shown as-is. No WebGL: a still warm glow behind the words.
- `tools/shots.mjs`: screenshots at scroll stops, phone and desktop (`npm i` first). `tools/og.mjs`: renders `public/og.jpg` and prints fps.
- Deploy: `npx wrangler deploy` (Workers static assets). Plain deploy goes to the workers.dev preview only; solichin.org needs the custom domain attached.
