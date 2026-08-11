# 0021. JSON export/import of settings and BBCode presets

Status: Accepted

Date: 2026-08-11

## Context

Nothing about this extension follows a user between browsers or profiles.
[[0012-feature-owned-data-stores]] anticipated this exact gap when it put the preset store's
`version` *inside* the payload rather than beside it: "a copy of the object is self-describing...
which is what will make an Export/Import JSON button a small addition later," and named an
explicit Export/Import button as the mitigation for choosing `storage.local` over `storage.sync`.

Two stores are in scope: `settings` (`src/lib/storage.ts` — feature on/off flags) and
`bbcodePresets` (`src/lib/presets.ts` — the folder/preset library). Highlights
(`src/lib/highlights.ts`) are deliberately excluded: they're per-post artifacts tied to specific
forum threads, a weaker fit for a portable backup, and can be added later without touching this
design.

The two stores warrant different treatment on import. `settings` is a flat five-key boolean map —
there is nothing meaningful to review item by item, so a plain overwrite (after the user picks the
file) is the whole story. `bbcodePresets` is different: it's user-authored content the writer may
have spent real effort on, and a naive full-store replace risks silently discarding local work that
was never exported (e.g. a preset added on this machine since the last export). So presets needed
a way to show *what would change* before anything is written.

Where the controls live matters too. This spans both stores — the feature toggles *and* the preset
library — so it doesn't belong to either one specifically. The popup is the surface every install
opens regardless of which features are in use, which made it the obvious first candidate.

The popup has a hard limitation, though: **it closes the instant it loses focus**, and the OS's
native `<input type="file">` dialog is exactly the kind of window that takes focus — most reliably
reproducible on Linux, where that dialog is a separate top-level GTK window, but not guaranteed
safe on any platform. The dialog opens fine; the popup (and every bit of JS state waiting inside
it, including the code meant to receive the chosen file) is simply gone by the time a file is
picked, so nothing happens. Export never hits this — a download needs no dialog — but import does.
A first version put the whole flow (file picker, review modal) inside the popup and shipped broken:
the dialog opened, a file could be picked, and then nothing.

So import has to live in a real tab. That leaves a choice about export, which *could* have stayed
in the popup: splitting one feature's two halves across two surfaces, or moving export down to join
import. Splitting it lost — a user looking for "where do I back this up" should find one place.

Which raised the last question. The options page was, until now, *only* the BBCode preset editor:
its `<h1>` was "Préréglages BBCode" and `docs/adr/0014` framed it as where substantial editing
happens. Hanging a backup box off the top of a page titled after one feature reads as an accident.

## Decision

We will ship a single JSON bundle format, plus a new pure module, `src/lib/backup.ts`, holding all
of the non-DOM logic. The **options page becomes the extension's general options page** — a page
`<h1>`, and one `<section>` per area with a small nav between them: the preset editor becomes the
`#presets` section, and export/import is the `#backup` section (`options/BackupSection.svelte`).
The popup keeps the feature toggles it already had, plus a cog that does nothing but open this
page. This extends `0014` rather than reversing it: the accordion popup and the real-tab options
page both stand, the page just stops being named after one feature.

- **`ExportBundleV1`**: `{ formatVersion: 1, exportedAt, settings, presets }`. `settings` and
  `presets` are exactly the shapes `src/lib/storage.ts` and `src/lib/presets.ts` already persist —
  no re-encoding — so the bundle is just "what's in storage, wrapped." `formatVersion` is a
  *bundle*-level version, separate from `PresetStore.version`: it can change independently if the
  envelope itself needs a new field, without implying anything about the preset schema.
- **Parsing never throws and is maximally lenient**: `parseImportBundle` only rejects unparsable
  JSON, a non-object root, or a `formatVersion` *newer* than the build understands (a format we
  genuinely can't interpret). A missing `formatVersion` is still read best-effort, the same way
  `normalizePresetStore` treats a missing `version` as `0` rather than refusing to load. A field
  that is *present but malformed* is repaired through the exact same `normalizePresetStore` /
  `normalizeSettings` (new, in `storage.ts`) a corrupt `storage.local` payload already goes
  through — an imported file gets the same tolerance as a live store, for free.
- **A field's *absence* means "leave that store untouched," not "empty it."** `parseImportBundle`
  returns `null` for a field the file never had, and the caller skips writing that store entirely.
  Coercing "absent" into "empty" would silently wipe whatever the user already has from something
  as ordinary as an export made before the presets feature existed.
- **Both stores are written through a `toPlain…` rebuild.** `presets.ts` already had
  `toPlainStore`; `storage.ts` gains the matching `toPlainSettings`, called inside `saveSettings`.
  The import UI holds the parsed bundle in Svelte `$state`, which deep-proxies it, and a `Proxy`
  is not structured-cloneable — so without this, importing settings persists nothing on Firefox
  while working fine on Chrome. `storage.ts` also picks up `store-kit`'s `loadStore`/`saveStore`/
  `watchStore` in the process, so both keys now reach `storage.local` through one code path.
- **`settings` is a plain overwrite**; `bbcodePresets` gets **selective, diffed import** through a
  review modal (`ImportModal.svelte`, `ImportPresetTree.svelte`). Every preset in the imported file
  is matched against the current library by **folder path + name** — never by id, since an
  imported store's ids were minted independently and can never line up with the current one's
  (`folderPath`, added to `presets.ts` alongside `buildPresetTree`/`isDescendantFolder`). Each is
  labeled `new` (no existing match), `identical` (match, same body), or `conflict` (match,
  different body). The user picks presets individually; folders are never picked directly — they're
  inferred and created only as needed to hold a selected preset, since a folder has no content of
  its own to conflict over.
- **Defaults favor not touching existing content**: `new` presets are checked by default, `identical`
  and `conflict` are not — importing is opt-in wherever it could overwrite something already there,
  mirroring the `confirm()` this codebase already requires before every preset/folder delete.
- **`applyPresetImport` is pure** (`store → store`), built entirely from the existing
  `addFolder`/`addPreset`/`updatePreset` mutations: it resolves each selected preset's folder chain
  against the *current* store (creating only what's missing, de-duplicated by path so a shared
  parent is created once) and either updates a matched preset's body in place or adds a new one.
  This keeps it unit-testable the same way the mutations it's built from already are
  (`src/lib/backup.test.ts`, alongside `presets.test.ts`).
- **Entry point: a cog next to the popup's title** (`src/entrypoints/popup/App.svelte`) that only
  calls `browser.runtime.openOptionsPage()`. It holds no state and reveals no panel — the popup is
  the wrong place for anything that might open an OS dialog, so it does not try.
- **`BackupSection.svelte` owns both halves and both stores.** It loads `settings` and
  `bbcodePresets` itself (nothing else owns either store as a whole) and stays subscribed via
  `watchPresetStore`/`watchSettings` — the page is long-lived and the preset editor directly above
  can change the library at any moment, so a snapshot taken at mount would export a stale one.
  Export is plain DOM glue (`Blob` + a temporary `<a download>`), nothing to unit-test per the
  DOM-glue scoping in CLAUDE.md's testing section.
- **The import writes the preset store directly** — `savePresetStore(applyPresetImport(…))`,
  awaited — rather than reaching into the editor's debounced `commit`. The editor watches
  `storage.local` for changes from any context, so a write from a sibling section reaches it
  exactly as a write from the popup would, and awaiting is what lets the import report one honest
  result instead of announcing "Import terminé" over a write still in flight.
- Reaching import still costs a second click once the page is open (the user must press "Importer
  un fichier…" there): a browser will not let a page auto-trigger a file dialog without a fresh
  user gesture in that document.
- **`ImportModal.svelte` is the first modal dialog in an extension page.** It's a small,
  self-contained overlay (`role="dialog" aria-modal="true"`, Escape + backdrop-click + a visible
  Annuler button to close), styled with the existing `--dlh-*` tokens the options page already
  loads. It does not introduce a reusable `<Modal>` component — there is exactly one use site — so
  if a second modal need shows up later, that's the point to extract one rather than before.

## Consequences

- Exporting is always "everything in `settings` + everything in `bbcodePresets`" — there's no way
  to export a subset. That's the deliberately simple case; the modal's selectivity lives entirely
  on the *import* side, where it actually matters (protecting existing data).
- The path+name matching key means renaming a folder (or a preset) between an export and a later
  import makes that item look brand new rather than a conflict — there's no stable cross-export
  identity beyond path+name. Accepted: ids were never portable to begin with, and the alternative
  (a persistent cross-export identity) is real complexity this feature doesn't need yet.
- A preset selected as `conflict` overwrites the existing match's body in place, keeping its
  current id, position, and folder — it is never duplicated. Reviewing the badge before checking
  the box is the only guard against an unwanted overwrite; there is no per-item undo.
- Nothing forbids two sibling folders (or two presets in one folder) sharing a name, and path+name
  cannot tell them apart: the diff keeps the last such preset it sees, while folder resolution
  takes the first sibling that matches. So with duplicate names the badge and the write target can
  disagree. Left as-is — the fix is to forbid duplicate names at the editor, which is a bigger
  question than this feature.
- Imported feature flags land in `storage.local` immediately but only take effect on the next page
  load, since `bootFeatures` reads them once at content-script boot. The confirmation message says
  so, the same way `popup.reloadHint` does for the toggles themselves.
- `formatVersion` gives the bundle envelope room to grow (e.g. adding a third store later) without
  having to interpret an old export under new assumptions — the same reasoning
  `PRESETS_SCHEMA_VERSION` already established for the preset store itself, one level up.
- Highlights staying out of scope means a full "restore everything" story doesn't yet exist; a
  future ADR can extend the bundle with a `highlights` field using the identical
  normalize-tolerant-of-absence pattern already established here.
- Backing anything up now costs a tab switch: neither half is reachable from the popup itself.
  That is the direct cost of the action-popup's focus-loss behavior, and any future control that
  needs a native dialog (a directory picker, a second file picker, anything beyond a plain
  download) inherits the same constraint and belongs on the options page for the same reason.
- The options page now has to earn a second section every time one is added: a heading, a nav
  entry, and a place in the page's reading order. That is the intended cost of it being the
  extension's options page rather than one feature's editor.

Related: [[0012-feature-owned-data-stores]], [[0014-popup-accordion-options-page]]
