<script lang="ts">
  import { i18n } from '#i18n';
  import { ALL_FEATURES } from '@/features/registry';
  import { loadSettings, setFeatureEnabled } from '@/lib/storage';

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
  <h1>Dreamland Reborn QoL</h1>
  <ul>
    {#each ALL_FEATURES as feature (feature.id)}
      <li class:disabled={!feature.implemented}>
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
      </li>
    {/each}
  </ul>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
  }
  main {
    width: 20rem;
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
  label {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.5rem;
    border-radius: 0.5rem;
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
  }
  .text {
    display: flex;
    flex-direction: column;
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

  @media (prefers-color-scheme: dark) {
    main {
      color: #eceaf4;
      background: #1c1b22;
    }
    label:hover {
      background: #2a2833;
    }
    .desc {
      color: #a7a5b0;
    }
    .soon {
      color: #a7a5b0;
    }
  }
</style>
