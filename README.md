# solichin.org

The landing page of the Solichin family office: **a foundation for tomorrow**.

One light in the dark. Scrolling opens the darkness around it until the two hands from Fred's painting are seen, then the words light up as you read, then the verse.

- `public/` is the whole site, plain HTML/CSS/JS with no build step. Preview: `npm run serve` → http://localhost:8787
- `public/app.js`: the reveal (one transform + one gradient per frame, only while scrolling) and the word-by-word statement. `LIGHT` = where the light sits in each crop.
- `tools/crops.py <painting.jpg>`: rebuilds the wide (desktop) and tall (phone) crops around the light and `og.jpg`. Prints the `LIGHT` values.
- `tools/shots.mjs`: screenshots at 8 scroll stops, phone + desktop (`npm i` first).
- Reduced motion: the picture is shown open and all words lit, no animation.
- Deploy: `npx wrangler deploy` (Workers static assets). **Not deployed — only on Fred's yes.**
