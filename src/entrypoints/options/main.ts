import { mount } from 'svelte';
import { i18n } from '#i18n';
import App from './App.svelte';

// The tab title is user-facing text, so it comes from the catalog (docs/adr/0009).
// `__MSG_…__` only substitutes in the manifest and CSS, so index.html's static <title>
// is a pre-script fallback and this is the source of truth.
document.title = i18n.t('options.title');

export default mount(App, {
  target: document.getElementById('app')!,
});
