# Reverse engineering the reference drone shot

Goal: understand what the reference *actually is*, before building more WebGL.

Sources:
- `reference/frames/ref-01s.jpg` … `ref-20s.jpg` (20 s cinematic reference)
- NOTE.md second-by-second description
- `reference/fpv-preview/` + C#1 loop (our earlier WebGL attempt on Fred's painting)
- YouTube FPV freestyle short (feel of locked-forward flight — different clip)

---

## 1. What the reference camera is doing

Not a pan. Not a zoom on a flat image. A camera moving **through a volumetric scene**.

| Time | Camera | What proves it is 3D |
|------|--------|----------------------|
| 0–1 s | Wide, static, everything sharp | Establishing shot of a landscape *with* figures in it |
| 1–5 s | Fast push + rise toward God; God fills FG | Mountains lag (parallax). BG goes soft (DOF) |
| 5–9 s | Curves around God's shoulder, glides along the arm | We see **God in profile / OTS** — a side of him the frontal fresco does not contain as a texture |
| 9–13 s | Past the hands, **behind Adam** | Adam's **back** fills the frame — novel surface, not in the source painting |
| 13–18 s | Pull back, swing to the front | Re-reveal of the whole scene |
| 18–20 s | Settle on the same wide frame | Seamless loop |

Feel words that matter: *orbit, behind, OTS, shallow focus, near rushes / far crawls*.

---

## 2. Scene structure of the reference (inferred)

The reference is **not** “Fred’s painting extruded.” It behaves like a **reimagined 3D set**:

1. **Environment volume** — rocks, valley, mountains, sky with distance (atmospheric haze). The camera can go *into* that space.
2. **Body volumes** — God and Adam have fronts *and* backs. Orbiting reveals new silhouette, not stretched edge pixels.
3. **Gap you can fly through** — space between the fingers is empty air in front of distant landscape, not a painted seam on one plane.
4. **Lens** — real shallow DOF that racks as the subject changes; FOV wide enough that near limbs smear past the lens.

Likely production technique for the reference frames: **AI image-to-video / novel-view video** (or a full CG scene), not a realtime depth mesh of one still.

---

## 3. Why our WebGL attempts keep reading as “2D / pan”

| Approach | What it can do | What it can never do |
|----------|----------------|----------------------|
| 2D pan/zoom (`app.js`) | Slide/scale the painting | Any parallax, any orbit |
| Single depth relief (`drone.js`) | Mild parallax while looking mostly at the front | Clean OTS / behind / under — edges **smear** (no back texture) |
| Cardboard layers | Stronger parallax between cutouts | Orbit around a body; always reads as sliding flats (“pan with depth”) |
| Starry Night redraw + depth | Clearer near/mid/far *from the front* | Still a front-only painting; same orbit failure |

The failure mode is not “wrong KEYS.” It is **missing geometry and missing novel views**.

Evidence from our own FPV proof of Fred’s painting / starry relief: through-light and under-Adam shots tear into taffy stretch. That is exactly what a single extruded image does when the camera leaves the frontal cone.

---

## 4. Minimum representation that can match the reference *live*

To match the reference’s *orbit / behind Adam / OTS God* beats in realtime:

- **Full 3D proxies** for the bodies (or Gaussian/NeRF/novel-view model), **or**
- **Pre-rendered video** of a true fly-through (AI or CG), played as the hero.

A depth map of one painting is insufficient. Layers are insufficient.

This environment has **no GPU image-to-3D model**. So the live-WebGL path to “same as reference” is blocked here unless we bring in an external mesh/video.

---

## 5. What the repo already anticipated

`public/app.js`:

```js
// Future: set to e.g. '/video/flight.mp4' once the AI fly-through exists.
var VIDEO = null;
```

NOTE.md already has a ready image-to-video prompt (portrait as start **and** end frame).

So the intended end state was always: **generate the drone shot as video**, drop it into `VIDEO`, keep the painting as poster / reduced-motion fallback. The WebGL relief was a prototype stand-in — not a path to the reference’s behind-Adam orbit.

---

## 6. Verdict

**The reference drone shot is a camera path through a volumetric (or novel-view) scene.**  
**Our painting+depth WebGL is a frontal relief.**  
Those are different media. Tuning keys / FOV / Starry Night style cannot bridge that gap.

Next correct step (pick one):

1. **Generate the fly-through video** (Kling / Runway / Luma / etc.) from Fred’s painting using the NOTE prompt → set `VIDEO` in `app.js`.
2. **Obtain a real 3D asset** (Meshy / Tripo / Blender / scan) of the scene → load mesh in WebGL and fly the path.
3. **Accept relief** as a lighter approximation and stop chasing behind-Adam shots.

Do **not** build more layer stacks hoping they become a drone shot — that stays a pan with parallax.
