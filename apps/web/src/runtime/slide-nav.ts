// Dedupe deck slide-navigation requests across HtmlViewer remounts.
//
// A queued chat send arms a `slideNavRequest` that lives in parent (ProjectView)
// state and stays set after the viewer handles it. A per-mount ref would only
// suppress replays for the current mount: leaving the deck tab and coming back
// remounts HtmlViewer, the ref resets, and the stale nonce reads as fresh — so
// the preview yanks back to the queued slide and clobbers wherever the user had
// navigated manually. Keying consumed nonces by preview-state key *outside* the
// component makes "consume once" survive remounts.
//
// The map is keyed by `${projectId}:${fileName}`, so a fresh queued send (new
// nonce, via Date.now()) for the same deck still navigates, and each file is
// tracked independently. One entry per opened deck — bounded and tiny.
const consumedSlideNavNonces = new Map<string, number>();

/**
 * Returns true exactly once per (key, nonce) pair, recording it as consumed.
 * Returns false for a nonce already consumed under that key — including after a
 * remount — so the navigation fires only on the first handling of each request.
 */
export function shouldConsumeSlideNav(key: string, nonce: number): boolean {
  if (consumedSlideNavNonces.get(key) === nonce) return false;
  consumedSlideNavNonces.set(key, nonce);
  return true;
}

/** Test seam: drop all recorded consumptions. */
export function resetConsumedSlideNavForTests(): void {
  consumedSlideNavNonces.clear();
}
