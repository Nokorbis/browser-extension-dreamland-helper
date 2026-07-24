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

## Shot list

In order of how much they sell the extension:

1. **Le panneau de préréglages, ouvert à côté de l'éditeur.** A real reply page, composer
   visible with a few lines of text, the side panel expanded showing a folder tree with
   believable preset names (one folder per character). This is the flagship feature.
2. **Le bouton dans la barre d'outils BBCode, menu déroulé.** Tight on the composer toolbar,
   the extension's button next to B / i / u, its folder menu open over the editor.
3. **La popup de l'extension.** Click the toolbar icon: the feature list with its toggles.
   Shows at a glance that everything is opt-out.
4. **La page d'options.** Preset tree on the left, name + BBCode body + live preview on the
   right. Shows presets are authored, not hardcoded.
5. *(optional)* **La fenêtre « Serveur indisponible ».** Hardest to stage — the exit guard's
   dialog only appears on a real failed send. Only worth it if it comes for free during a
   forum outage; skip otherwise.

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
