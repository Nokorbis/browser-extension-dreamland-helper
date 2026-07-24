import { mount } from 'svelte';
import { i18n } from '#i18n';
import App from './App.svelte';

// The tab title is user-facing text, so it comes from the catalog like everything
// else (see docs/adr/0009). It cannot be written as `__MSG_…__` in index.html —
// that substitution only applies to the manifest and CSS — so the static <title>
// there is just the pre-script fallback and this is the source of truth.
document.title = i18n.t('options.title');

export default mount(App, {
  target: document.getElementById('app')!,
});
