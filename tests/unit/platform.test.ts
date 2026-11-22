import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
}));

import { Capacitor } from '@capacitor/core';
import { usePwaStore } from '../../src/stores/app';

describe('PWA installation guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 15; TECNO LI9)',
      maxTouchPoints: 0,
    });
    vi.stubGlobal('window', { addEventListener: vi.fn() });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('treats the native Android app as installed', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    const store = usePwaStore();

    expect(store.mobile).toBe(true);
    expect(store.installed).toBe(true);
    expect(store.needsInstall).toBe(false);
  });

  it('keeps the install guide for Android browsers without an installed PWA', () => {
    const store = usePwaStore();

    expect(store.mobile).toBe(true);
    expect(store.installed).toBe(false);
    expect(store.needsInstall).toBe(true);
  });
});
