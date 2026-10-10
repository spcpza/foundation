# Reverse engineering the reference drone shot

## Sources (canonical)

Alex Socoloff (@socoloffalex) X posts — **these are the references**:

1. https://x.com/socoloffalex/status/2108150104964452791 — Creation of Adam FPV fly-through (~20 s, 4K)
2. https://x.com/socoloffalex/status/2108519572714209408 — Fallen Angel / sky angels FPV sibling (~20 s, 4K)

Local copies + 1 fps frames: `reference/socoloff/` (large `.mp4` files are gitignored; re-download from the media URLs in the API if needed).

REA (https://github.com/morluto/rea) was used to inspect a similar shipped pattern on byanat.ai: hero is a **Cloudinary `<video>`** with mobile/tablet/desktop sources, muted / loop / autoplay / playsInline — not a live WebGL relief.

---

## What the Creation reference camera is doing (verified)

True **first-person / FPV**: the camera banks and looks along its flight path (not locked look-at / orbit).

| Time | Camera | Proof of 3D |
|------|--------|-------------|
| 0–1 s | Wide establishing, both figures + valley | Full scene settle |
| ~3–5 s | Push in, close-pass God's shoulder | Extreme DOF; mountains lag (parallax) |
| ~7–8 s | Bank through the fingertip gap | Occupies Z-space between hands |
| ~9 s | Looks down Adam's arm to his face | Near hand rushes past |
| ~12–13 s | Curves past / behind Adam | **Novel back of head/shoulder** |
| ~15–17 s | Rapid pull-back to front | Re-reveal |
| ~18–20 s | Settles on exact start frame | Seamless loop |

Feel: continuous take, swooping accel/decel, shallow DOF, near surfaces graze the lens, far mountains crawl.

The Fallen Angel sibling adds surreal macro (hands → tearful eye → fly into iris reflection) — same FPV language, different loop gag.

---

## Why painting + depth WebGL cannot fully match

| Need | WebGL relief | Reference |
|------|--------------|-----------|
| Behind Adam / novel backs | Missing texture → stretch | Real novel views |
| Through-gap air volume | Approx with edge tear + far layer | True empty space |
| Macro skin / iris loop | Not applicable | Video / CG |

**Correct end state for parity:** pre-rendered AI/CG fly-through video → set `VIDEO` in `app.js` (same pattern as Byanat / PRODUX heroes). Live WebGL is the lightweight first-person stand-in until that video exists.

Cloudflare AI Gateway balance is currently $0 (Vidu / image-to-video blocked). Min top-up ~$10 or BYOK.

---

## Current site approach

- New portrait Creation landscape painted for depth (Adam LL, God UR, flyable gap, valley).
- `drone.js`: look-ahead FPV KEYS matched to the Creation shot list (~20 s loop).
- First load stays under ~300 KB (AVIF path).
- Do not ship Socoloff’s copyrighted video; use it only as motion/composition reference.
