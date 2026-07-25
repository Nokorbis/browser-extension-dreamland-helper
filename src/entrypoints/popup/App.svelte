<script lang="ts">
  import { i18n } from '#i18n';
  import { ALL_FEATURES } from '@/features/registry';
  import { loadSettings, setFeatureEnabled } from '@/lib/storage';
  import { POPUP_PANELS } from './panels';
  // Global (unscoped) — the --dlh-* variables the feature panels read.
  import '@/features/bbcode-presets/palette.css';

  // Feature id → enabled. Seeded from storage on mount.
  let enabled = $state<Record<string, boolean>>({});

  loadSettings().then((settings) => {
    enabled = settings.features;
  });

  async function toggle(id: string, next: boolean) {
    enabled = { ...enabled, [id]: next };
    await setFeatureEnabled(id, next);
  }
</script>

<main>
  <h1>{i18n.t('extName')}</h1>
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
                {#if !feature.implemented}<em class="soon">{i18n.t('popup.soon')}</em>{/if}
              </span>
              <span class="desc">{feature.description}</span>
            </span>
          </label>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="hint">{i18n.t('popup.reloadHint')}</p>
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
  h1 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
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

  @media (prefers-color-scheme: dark) {
    main {
      color: #eceaf4;
      background: #1c1b22;
    }
    label:hover,
    summary:hover {
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
  }
</style>
