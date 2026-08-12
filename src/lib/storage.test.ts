import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  normalizeSettings,
  toPlainSettings,
  loadSettings,
  saveSettings,
  watchSettings,
  setFeatureEnabled,
} from './storage';

/**
 * Settings hold nothing but on/off flags, so the invariants that matter are all
 * about *not* surprising `bootFeatures`: an unknown or damaged entry must never
 * turn into a truthy value, defaults must always fill the gaps, and what lands
 * in `storage.local` must be plain enough for Firefox to structured-clone it.
 */

describe('normalizeSettings', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an array', []],
    ['an object with no features', {}],
    ['a non-object features field', { features: 'nope' }],
  ])('falls back to the defaults for %s', (_label, raw) => {
    expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('lets a stored flag override its default', () => {
    expect(normalizeSettings({ features: { 'exit-guard': false } })).toEqual({
      features: { ...DEFAULT_SETTINGS.features, 'exit-guard': false },
    });
  });

  it('drops a non-boolean entry rather than coercing it', () => {
    // 'yes' is truthy, so keeping it would silently enable the feature.
    const settings = normalizeSettings({
      features: { highlight: 'yes', 'color-grab': 0 },
    });
    expect(settings.features.highlight).toBe(DEFAULT_SETTINGS.features.highlight);
    expect(settings.features['color-grab']).toBe(DEFAULT_SETTINGS.features['color-grab']);
  });

  it('keeps a flag for a feature this build does not know', () => {
    // An import from a newer version must not lose the flag on the way through.
    expect(
      normalizeSettings({ features: { 'from-the-future': false } }).features,
    ).toMatchObject({
      'from-the-future': false,
    });
  });

  it('never returns the DEFAULT_SETTINGS object itself', () => {
    const settings = normalizeSettings(undefined);
    settings.features['exit-guard'] = false;
    expect(DEFAULT_SETTINGS.features['exit-guard']).toBe(true);
  });
});

describe('toPlainSettings', () => {
  it('keeps only the declared fields', () => {
    const settings = normalizeSettings(undefined);
    (settings as unknown as Record<string, unknown>).stray = 'nope';

    expect(Object.keys(toPlainSettings(settings))).toEqual(['features']);
  });

  it('produces a copy the caller cannot reach back into', () => {
    const original = normalizeSettings(undefined);
    const plain = toPlainSettings(original);

    plain.features['exit-guard'] = false;

    expect(original.features['exit-guard']).toBe(true);
  });

  it('survives structuredClone when the input is a Proxy', () => {
    // The regression this guards: the options page holds the parsed import
    // bundle in `$state`, which Svelte 5 deep-proxies. Firefox structured-clones
    // values on their way into storage.local and a Proxy is not cloneable, so
    // the write throws DataCloneError — while Chrome, which serialises by
    // reading properties, persists it fine. That asymmetry made importing
    // settings fail on Firefox only. See docs/adr/0021.
    const proxied = new Proxy(normalizeSettings({ features: { highlight: false } }), {});

    expect(() => structuredClone(toPlainSettings(proxied))).not.toThrow();
    expect(toPlainSettings(proxied).features.highlight).toBe(false);
  });
});

describe('persistence', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('returns the defaults when nothing is stored yet', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings through storage', async () => {
    const settings = normalizeSettings({ features: { 'exit-guard': false } });
    await saveSettings(settings);
    expect(await loadSettings()).toEqual(settings);
  });

  it('repairs damaged data on the way out of storage', async () => {
    await fakeBrowser.storage.local.set({
      [SETTINGS_KEY]: { features: { highlight: 'yes' } },
    });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('writes a value that is safe to structuredClone', async () => {
    await saveSettings(new Proxy(normalizeSettings(undefined), {}));
    const stored = (await fakeBrowser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    expect(() => structuredClone(stored)).not.toThrow();
  });

  it('setFeatureEnabled flips one flag and leaves the rest alone', async () => {
    await setFeatureEnabled('highlight', false);
    expect(await loadSettings()).toEqual({
      features: { ...DEFAULT_SETTINGS.features, highlight: false },
    });
  });

  it('notifies a watcher with the normalized settings', async () => {
    const seen: Array<Record<string, boolean>> = [];
    const stop = watchSettings((settings) => seen.push(settings.features));

    await saveSettings(normalizeSettings({ features: { 'color-grab': false } }));
    stop();
    await saveSettings(DEFAULT_SETTINGS);

    expect(seen).toHaveLength(1);
    expect(seen[0]['color-grab']).toBe(false);
  });
});

/*
 * There is deliberately no runtime check here that `DEFAULT_SETTINGS.features` and
 * `ALL_FEATURES` agree. Importing the registry pulls in every feature module, and those
 * import Svelte components — which this node-only suite cannot parse. It is the same
 * constraint that keeps `POPUP_PANELS` off the `Feature` interface (CLAUDE.md).
 *
 * The check that matters is a compile-time one instead: `DEFAULT_SETTINGS` is typed
 * `Record<FeatureId, boolean>`, so a feature added to `ALL_FEATURES` and forgotten here
 * fails `pnpm check` by name. Only the harmless direction — a leftover entry for a
 * removed feature, which `bootFeatures` simply never looks up — goes unchecked.
 */

describe('normalizeSettings against hostile input', () => {
  it('does not let a prototype-polluting key reach the prototype', () => {
    // `features` comes straight from an import file the user was handed by someone else.
    const result = normalizeSettings({
      features: { __proto__: true, constructor: true, highlight: false },
    });
    expect(result.features.highlight).toBe(false);
    expect(Object.prototype.hasOwnProperty.call({}, 'polluted')).toBe(false);
    const probe: Record<string, unknown> = {};
    expect(probe.constructor).toBe(Object);
  });

  it('keeps an unknown feature id rather than dropping it', () => {
    // A flag from a newer build must survive a round trip through an older one, or
    // installing an update after an export would silently reset it.
    const result = normalizeSettings({ features: { 'from-the-future': false } });
    expect(result.features['from-the-future']).toBe(false);
    expect(toPlainSettings(result).features['from-the-future']).toBe(false);
  });
});
