<script lang="ts">
  import { i18n } from '#i18n';
  import { browser } from '#imports';
  import {
    loadPresetStore,
    watchPresetStore,
    countPresets,
    countFolders,
    emptyPresetStore,
    type PresetStore,
  } from '@/lib/presets';

  /**
   * The BBCode presets panel inside the popup accordion.
   *
   * Read-only on purpose: the popup is ~23rem wide and closes on any outside
   * click, which would put half-typed BBCode at risk. It shows what the library
   * contains and hands off to the options page for real editing.
   * See docs/adr/0014-popup-accordion-options-page.md.
   */
  let store = $state<PresetStore>(emptyPresetStore());

  void loadPresetStore().then((loaded) => {
    store = loaded;
  });
  watchPresetStore((next) => {
    store = next;
  });

  function openOptions() {
    // Available in extension pages (not content scripts) on MV2 and MV3, in both
    // browsers — so no background worker is needed to reach the options page.
    void browser.runtime.openOptionsPage();
  }
</script>

<p class="counts">
  {i18n.t('features.bbcodePresets.popup.presetCount', countPresets(store))}
  ·
  {i18n.t('features.bbcodePresets.popup.folderCount', countFolders(store))}
</p>

<button type="button" onclick={openOptions}>
  {i18n.t('features.bbcodePresets.popup.manage')}
</button>

<style>
  /* Inherits the --dlh-* palette from the popup's `.dlh-theme-auto` root. */
  .counts {
    margin: 0 0 0.5rem;
    color: var(--dlh-muted);
    font-size: 0.78rem;
  }

  button {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--dlh-border);
    border-radius: 0.4rem;
    background: var(--dlh-surface-alt);
    color: inherit;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  button:hover {
    background: var(--dlh-hover);
  }
</style>
