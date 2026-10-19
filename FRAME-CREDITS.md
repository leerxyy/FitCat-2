# FitCat collectible avatar frames — 3.24.0

The five artworks were generated specifically for FitCat from the five-frame
concept sheet approved by the user in this conversation. They are original
imagegen outputs, not downloaded commercial game frames or stock artwork.

| Stored ID | Russian title | Visible moving layers |
| --- | --- | --- |
| `dragon` | Небесный дракон | Gold/jade contour flow, scale highlights, pearl pulse and orbit, eye glow, cloud wisps and glints |
| `chronos` | Хронос | Three rotating gear windows, oscillating balance, fine outer chapter ring, metal sweep |
| `eclipse` | Затмение | Two orbital light groups, star glints, flowing violet corona |
| `frostcrown` | Ледяная корона | Redrawn restrained ice ring with three crown crystals, cool contour flow, facet glints and ice motes |
| `phoenix` | Феникс | Eight animated flame tongues, red/yellow contour flow, heat map, feather sweep and rising embers |

Each item costs **229 FitCat Coins**, once. Ownership is recorded in the local
wallet receipt and does not require PRO+. The collection is decorative and
does not affect nutrition calculations or activity data.

`assets/profile-frames/frames.sources.json` records the original master hashes,
derived asset sizes and opening geometry. The local build tool
`tools/prepare_frame_assets.mjs` produces a 1024×1024 alpha sprite, a 320×320
static thumbnail and two 512×512 effect maps per frame, plus a small measured aperture mask. Dragon, Phoenix and Frost Crown also use a precomputed 512×512 edge-light mask. The tool requires the
five original transparent PNG masters as its input directory. It is not used
by the deployed PWA.

Every paid frame uses its own measured alpha opening, including asymmetric or off-center openings. An opaque backing and the photo share that exact aperture; the cover cannot leak through it. The artwork and thumbnails retain their native alpha, with no destructive central circular crop. The profile keeps its existing avatar slot and field layout; the try-on stage has the same dimensions for every frame. Artwork uses a native image element. CSS image URLs resolve from the application root, including GitHub Pages subdirectories. The header uses its thumbnail and only the small light sweep; gears, clouds, flames and particles are hidden there.

Frost Crown was replaced at the user's request in 3.24.0 with original artwork made using the built-in imagegen tool. The final production prompt and normalization notes are recorded in `FRAME-ART-PROMPTS.json`. It retains the same stored `frostcrown` ID and all ownership receipts. High-resolution PNG masters remain outside the deployment ZIP. `tools/prepare_collectible_fit.mjs` refreshes aperture/contour masks without changing the other four approved artworks.

Motion uses native CSS transforms and opacity. There are no additional timers,
requestAnimationFrame loops, video files, animated filters or sensor listeners.
All moving layers use the existing shared cosmetic timeline to preserve phase
across ordinary renders and screen transitions. Hidden and offscreen heroes
pause; gallery thumbnails remain still. The system reduced-motion setting
disables movement, and the appearance settings control highlight speed and
enablement. Actual WebKit rendering and device frame rate have not been measured
in this managed environment.
