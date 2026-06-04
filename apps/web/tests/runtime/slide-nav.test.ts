import { beforeEach, describe, expect, it } from 'vitest';

import {
  resetConsumedSlideNavForTests,
  shouldConsumeSlideNav,
} from '../../src/runtime/slide-nav';

describe('shouldConsumeSlideNav', () => {
  beforeEach(() => resetConsumedSlideNavForTests());

  it('navigates only on the first handling of a request, even across remounts', () => {
    const key = 'proj:deck.html';
    // First mount handles the queued send's request → flip the preview.
    expect(shouldConsumeSlideNav(key, 5)).toBe(true);
    // The request stays live in parent state; leaving the deck tab and coming
    // back remounts the viewer with the same nonce. It must NOT flip again —
    // otherwise manual navigation after the queued send gets yanked back.
    expect(shouldConsumeSlideNav(key, 5)).toBe(false);
    expect(shouldConsumeSlideNav(key, 5)).toBe(false);
  });

  it('navigates again when a new queued send arms a fresh nonce', () => {
    const key = 'proj:deck.html';
    expect(shouldConsumeSlideNav(key, 5)).toBe(true);
    expect(shouldConsumeSlideNav(key, 9)).toBe(true);
    expect(shouldConsumeSlideNav(key, 9)).toBe(false);
  });

  it('tracks consumed nonces per file independently', () => {
    expect(shouldConsumeSlideNav('proj:a.html', 5)).toBe(true);
    expect(shouldConsumeSlideNav('proj:b.html', 5)).toBe(true);
    expect(shouldConsumeSlideNav('proj:a.html', 5)).toBe(false);
    expect(shouldConsumeSlideNav('proj:b.html', 5)).toBe(false);
  });
});
