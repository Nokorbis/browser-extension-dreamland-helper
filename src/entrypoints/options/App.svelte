<script lang="ts">
  import { i18n } from '#i18n';
  import PresetsSection from './PresetsSection.svelte';
  import BackupSection from './BackupSection.svelte';
  // Global (unscoped) — the --dlh-* variables every section reads. This is an
  // extension page, so the theme follows the OS preference (see below), unlike
  // the in-page surfaces which follow the forum's own theme.
  import '@/lib/palette.css';

  /**
   * The extension's options page: one page, one section per area of settings.
   *
   * This component is deliberately only the page chrome — heading, intro, the nav
   * between sections — and a list of the sections themselves. Each section is its own
   * component owning its own markup, state and styles (`PresetsSection` is the BBCode
   * preset editor, `BackupSection` the export/import of everything). Adding an area
   * means adding a component, a nav entry and one line below; nothing else here grows.
   *
   * The popup's cog opens this page, so a section added here needs no other entry point.
   * See docs/adr/0014-popup-accordion-options-page.md and
   * docs/adr/0021-json-export-import.md.
   */
</script>

<main>
  <header>
    <h1>{i18n.t('options.title')}</h1>
    <p class="intro">{i18n.t('options.intro')}</p>
    <nav aria-label={i18n.t('options.sectionsLabel')}>
      <a href="#presets">{i18n.t('features.bbcodePresets.editor.heading')}</a>
      <a href="#backup">{i18n.t('options.backup.heading')}</a>
    </nav>
  </header>

  <PresetsSection />

  <BackupSection />
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    color: var(--dlh-fg);
    background: var(--dlh-surface);
  }

  main {
    max-width: 60rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 3rem;
  }

  header {
    margin-bottom: 1.75rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--dlh-border);
  }
  h1 {
    margin: 0 0 0.25rem;
    font-size: 1.35rem;
  }
  .intro {
    margin: 0 0 0.8rem;
    color: var(--dlh-muted);
    font-size: 0.9rem;
  }

  /* Two sections is few enough to skim, but the preset editor is tall enough
     to push the backup section off-screen — these keep it one click away and
     make the page read as a set of sections rather than one editor. */
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    font-size: 0.85rem;
  }
  nav a {
    color: var(--dlh-accent);
  }

  /* Sections are separated by rules rather than boxes: boxing them would
     compete with the tree/edit panes, which already carry borders.
     `:global` because each section is rendered by a child component, so its
     `<section>` element carries that component's scope, not this one's. */
  main > :global(section + section) {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--dlh-border);
  }
  /* An anchored jump must not tuck the heading under the top of the viewport. */
  main > :global(section) {
    scroll-margin-top: 1rem;
  }

  /*
   * Only what the shared palette does not already cover — see palette.css, which flips
   * itself via .dlh-theme-auto. Section-local dark rules live in each section.
   */
  @media (prefers-color-scheme: dark) {
    :global(body) {
      color: var(--dlh-fg);
      background: #1c1f26;
    }
  }
</style>
