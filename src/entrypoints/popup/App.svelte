<script lang="ts">
  import { i18n } from '#i18n';
  import { browser } from '#imports';
  import { ALL_FEATURES } from '@/features/registry';
  import { loadSettings, setFeatureEnabled } from '@/lib/storage';
  import { error } from '@/lib/log';
  import { POPUP_PANELS } from './panels';
  // Global (unscoped) — the --dlh-* variables the feature panels read.
  import '@/lib/palette.css';

  // Feature id → enabled. Seeded from storage on mount.
  let enabled = $state<Record<string, boolean>>({});
  let saveFailed = $state(false);

  void loadSettings().then((settings) => {
    enabled = settings.features;
  });

  /**
   * Flip a feature, optimistically, then report the outcome rather than assume it.
   *
   * The checkbox moves first because a storage write is fast and the alternative is a
   * visibly laggy control. But an optimistic update that is never reconciled is just a
   * UI that lies: a rejected write (Firefox refusing to clone a `$state` proxy is the
   * one that bit this project before) would leave the box ticked with nothing persisted.
   * So a failure puts the box back and says so — the same stance as the options page's
   * `commit`, which is where that lesson was learned. See CLAUDE.md.
   */
  async function toggle(id: string, next: boolean) {
    const previous = enabled[id] ?? false;
    enabled = { ...enabled, [id]: next };
    saveFailed = false;
    try {
      await setFeatureEnabled(id, next);
    } catch (err) {
      enabled = { ...enabled, [id]: previous };
      saveFailed = true;
      error('failed to save the feature toggle', err);
    }
  }

  // The cog is a plain link to the options page — where the preset editor and
  // the backup section both live. Nothing that needs a native dialog can run
  // in the popup, which closes the moment one steals focus.
  // See docs/adr/0021-json-export-import.md.
  function openOptions() {
    void browser.runtime.openOptionsPage();
  }
</script>

<main>
  <div class="header">
    <h1>{i18n.t('extName')}</h1>
    <button
      type="button"
      class="cog"
      aria-label={i18n.t('popup.openOptions')}
      title={i18n.t('popup.openOptions')}
      onclick={openOptions}
    >
      <span aria-hidden="true">⚙</span>
    </button>
  </div>

  <ul>
    {#each ALL_FEATURES as feature (feature.id)}
      {@const Panel = feature.implemented ? POPUP_PANELS[feature.id] : undefined}
      <li class:disabled={!feature.implemented}>
        {#if Panel !== undefined}
          <!--
            A feature with settings gets a disclosure row. The checkbox sits
            OUTSIDE the <details> on purpose: inside <summary> its click would
            also toggle the disclosure. Separate hit-areas beat stopPropagation.
            Native <details> also gives us keyboard support for free.
          -->
          <div class="row">
            <input
              type="checkbox"
              checked={enabled[feature.id] ?? false}
              aria-labelledby="name-{feature.id}"
              onchange={(e) => toggle(feature.id, e.currentTarget.checked)}
            />
            <details>
              <summary>
                <span class="text">
                  <span class="name" id="name-{feature.id}">{feature.name}</span>
                  <span class="desc">{feature.description}</span>
                </span>
              </summary>
              <div class="panel">
                <Panel />
              </div>
            </details>
          </div>
        {:else}
          <!-- No settings to show: keep the whole row as one toggle target. -->
          <label>
            <input
              type="checkbox"
              checked={enabled[feature.id] ?? false}
              disabled={!feature.implemented}
              onchange={(e) => toggle(feature.id, e.currentTarget.checked)}
            />
            <span class="text">
              <span class="name">
                {feature.name}
                {#if !feature.implemented}<em class="soon">{i18n.t('popup.soon')}</em
                  >{/if}
              </span>
              <span class="desc">{feature.description}</span>
            </span>
          </label>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="hint">{i18n.t('popup.reloadHint')}</p>
  <!--
    Rendered conditionally rather than faded with a class: a live region only announces
    when its *content* changes, so text that is always present is never read out. Same
    reasoning as the options page's save status.
  -->
  <p class="save-failed" role="status" aria-live="polite">
    {#if saveFailed}{i18n.t('popup.saveFailed')}{/if}
  </p>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
  }
  main {
    width: 23rem;
    padding: 0.75rem 1rem 1rem;
    color: #1c1b22;
    background: #fff;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  h1 {
    margin: 0;
    font-size: 1rem;
  }
  .cog {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    padding: 0;
    border: none;
    border-radius: 0.35rem;
    background: none;
    color: inherit;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .cog:hover {
    background: #f2f1f6;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label,
  .row {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.5rem;
    border-radius: 0.5rem;
  }
  label {
    cursor: pointer;
  }
  label:hover {
    background: #f2f1f6;
  }
  li.disabled label {
    cursor: default;
    opacity: 0.55;
  }

  input {
    margin-top: 0.15rem;
    flex: none;
  }

  /* The disclosure takes the rest of the row so its summary is a wide target. */
  details {
    flex: 1;
    min-width: 0;
  }
  summary {
    border-radius: 0.35rem;
    cursor: pointer;
    list-style-position: outside;
  }
  summary:hover {
    background: #f2f1f6;
  }
  /* Keep the marker aligned with the first line of a two-line label. */
  summary::marker {
    font-size: 0.8em;
  }

  .panel {
    padding: 0.5rem 0 0.15rem 0.9rem;
  }

  .text {
    display: inline-flex;
    flex-direction: column;
    vertical-align: top;
  }
  .name {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .soon {
    margin-left: 0.35rem;
    font-size: 0.65rem;
    font-style: normal;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #6b6a72;
    border: 1px solid currentColor;
    border-radius: 0.5rem;
    padding: 0 0.3rem;
    vertical-align: middle;
  }
  .desc {
    font-size: 0.78rem;
    color: #55545c;
  }

  .hint {
    margin: 0.75rem 0 0;
    padding-top: 0.6rem;
    border-top: 1px solid #e8e7ed;
    color: #6b6a72;
    font-size: 0.72rem;
  }

  .save-failed {
    /* Empty while nothing has failed, so it would collapse and shift the popup the
       moment a message arrives. Reserve the line instead. */
    min-height: 1lh;
    margin: 0.4rem 0 0;
    color: #a12626;
    font-size: 0.72rem;
    font-weight: 600;
  }

  @media (prefers-color-scheme: dark) {
    main {
      color: #eceaf4;
      background: #1c1b22;
    }
    label:hover,
    summary:hover,
    .cog:hover {
      background: #2a2833;
    }
    .desc {
      color: #a7a5b0;
    }
    .soon {
      color: #a7a5b0;
    }
    .hint {
      border-top-color: #2f2d38;
      color: #a7a5b0;
    }
    .save-failed {
      color: #ef9a9a;
    }
  }
</style>
