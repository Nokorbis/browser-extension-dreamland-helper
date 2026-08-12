# Store screenshots

The one listing asset that can't be generated from the repo — these need a real, logged-in
forum page. Drop the finished PNGs next to this file; they are the only images the
Chrome Web Store shows above the description.

## Rules (Chrome Web Store)

- **1280×800** (or 640×400, but use 1280×800 — it's what the store displays at).
- **Exactly** that size, square corners, **full bleed**: no padding, no border, no drop
  shadow, no rounded frame. A padded screenshot is a rejection reason.
- 1 minimum, **5 maximum**. Three good ones beat five repetitive ones.
- **There is no caption field.** Whatever the image doesn't show, the user doesn't read. If a
  shot needs a label, bake it into the image (see below).
- Same rules on AMO, which accepts these files as-is — shoot once, use twice.

## What is currently shipped

Five shots, all at the store's limit — replace one before adding another:

| File | Shows |
|---|---|
| `dr_qol_presets_usage.png` | The preset panel/menu in use beside the composer. The flagship. |
| `dr_qol_presets_config.png` | The options page: preset tree, BBCode body, live preview — presets are authored, not hardcoded. |
| `dr_qol_highlights.png` | Text highlights painted on a post. |
| `dr_qol_colors.png` | The colour grabber's "Sur la page" filter inside phpBB's own palette. |
| `dr_qol_options.png` | The options page as a whole. |

Two shots that earlier drafts of this list called for were never taken, and the reasons
still hold if you are deciding what to add next:

- **La popup de l'extension** — the feature list with its toggles. Would show at a glance
  that everything is opt-out. The strongest candidate for a sixth slot, if one frees up.
- **La fenêtre « Serveur indisponible »** — hardest to stage, since the exit guard's dialog
  only appears on a real failed send. Only worth it if it comes for free during an outage.

Nothing here covers the emoji picker or export/import yet either.

Practical notes:

- Use the **dev profile** (`pnpm dev`, persistent profile under `.wxt/`) with a plausible set
  of presets already created — an empty tree makes the feature look pointless.
- Shoot the forum in whichever theme reads best; the in-page UI follows the forum's own theme,
  so a dark forum gives dark panels.
- Nothing private in frame: check the username, the PM counter, the browser's other tabs, and
  any bookmark bar. Prefer hiding the bookmark bar entirely (Ctrl+Shift+B).
- Zoom the page to ~110–125 % before capturing. At 1280×800 the forum's default text is small,
  and the store scales the image down further in the carousel.

## Normalising a capture to 1280×800

Crop-to-fill, never pad — `-resize …^` scales so the image covers the box, `-extent` then crops
the overflow from the centre:

```bash
magick capture.png -resize 1280x800^ -gravity center -extent 1280x800 store/screenshots/01-panneau.png
```

If the interesting part isn't centred, crop deliberately first (`-crop WxH+X+Y +repage`) and
then run the command above on the result.

Verify before uploading — the store rejects anything that isn't exactly the declared size:

```bash
magick identify store/screenshots/*.png     # every line must read 1280x800
```

## Baking in a caption (optional)

Since there's no caption field, a short label can be drawn onto the shot. Keep it to a few
words, in French, in the palette's ink-on-dark:

```bash
magick 01-panneau.png \
  -fill '#1b1826e0' -draw 'rectangle 0,720 1280,800' \
  -font DejaVu-Sans -pointsize 30 -fill '#f4f1fa' \
  -annotate +40+772 'Vos préréglages, à côté de l’éditeur' \
  01-panneau.png
```

Apply it to **all** shots or none — a half-captioned carousel looks broken.
