# FitCat collectible avatar frames — 3.22.1

The five artworks were generated specifically for FitCat from the five-frame
concept sheet approved by the user in this conversation. They are original
imagegen outputs, not downloaded commercial game frames or stock artwork.

| Stored ID | Russian title | Visible moving layers |
| --- | --- | --- |
| `dragon` | Небесный дракон | Scale highlights, jade-pearl pulse, cloud contours, emissive detail |
| `chronos` | Хронос | Three rotating gear windows, oscillating balance, fine outer chapter ring, metal sweep |
| `eclipse` | Затмение | Two orbital light groups, star glints, flowing violet corona |
| `frostcrown` | Ледяная корона | Separate facet glints, cold mist contours, refracted-light map |
| `phoenix` | Феникс | Heat-light map, feather sweep, three gently rising ember groups |

Each item costs **229 FitCat Coins**, once. Ownership is recorded in the local
wallet receipt and does not require PRO+. The collection is decorative and
does not affect nutrition calculations or activity data.

`assets/profile-frames/frames.sources.json` records the original master hashes,
derived asset sizes and opening geometry. The local build tool
`tools/prepare_frame_assets.mjs` produces a 1024×1024 alpha sprite, a 320×320
static thumbnail and two 512×512 effect maps per frame. The tool requires the
five original transparent PNG masters as its input directory. It is not used
by the deployed PWA.

The empty avatar opening is protected with a native radial mask, so decorative
orbit lines do not cross the face. The profile keeps its existing avatar slot
and field layout; the try-on stage has the same dimensions for every frame.
Artwork uses a native image element. CSS effect URLs resolve from the application
root, including GitHub Pages subdirectories. The header uses its thumbnail and only the small light sweep; gear,
cloud and particle layers are hidden there.

Motion uses native CSS transforms and opacity. There are no additional timers,
requestAnimationFrame loops, video files, animated filters or sensor listeners.
All moving layers use the existing shared cosmetic timeline to preserve phase
across ordinary renders and screen transitions. Hidden and offscreen heroes
pause; gallery thumbnails remain still. The system reduced-motion setting
disables movement, and the appearance settings control highlight speed and
enablement. Actual WebKit rendering and device frame rate have not been measured
in this managed environment.
