// Single-flight recognition at a bounded rate. No display-rate polling while
// waiting for the next inference; prefer real video frames over duplicate RAFs.
export function createVideoInferenceLoop({ video, process, canRun, interval = () => 50, preferVideoFrames = () => true, onError = () => {}, view = globalThis, now = () => performance.now() }) {
  let timer = null, frame = null, watchdog = null, busy = false, disposed = false, paused = true, lastStart = -Infinity, lastMediaTime = null;
  const allowed = () => !disposed && !paused && canRun();
  const cadence = () => Math.max(16, Number(interval()) || 50);
  function clear() {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    if (watchdog !== null) view.clearTimeout(watchdog);
    watchdog = null;
    if (frame?.kind === 'video') video.cancelVideoFrameCallback?.(frame.id);
    else if (frame) view.cancelAnimationFrame(frame.id);
    frame = null;
  }
  function schedule(delay = 0) {
    if (!allowed() || busy || timer !== null || frame) return;
    timer = view.setTimeout(() => {
      timer = null;
      if (!allowed()) return;
      if (preferVideoFrames() && typeof video.requestVideoFrameCallback === 'function') {
        const pending = { kind: 'video', id: null }; frame = pending;
        pending.id = video.requestVideoFrameCallback((_, metadata) => {
          if (frame !== pending) return;
          view.clearTimeout(watchdog); watchdog = null; frame = null;
          void run(metadata?.mediaTime);
        });
        // Some WebKit video layers stop presenting callbacks when obscured.
        // Fall back to the advancing media clock, never a second inference.
        watchdog = view.setTimeout(() => {
          watchdog = null;
          if (frame !== pending) return;
          video.cancelVideoFrameCallback?.(pending.id); frame = null;
          void run(video.currentTime);
        }, Math.max(100, cadence() * 2));
      } else frame = { kind: 'raf', id: view.requestAnimationFrame(() => { frame = null; void run(video.currentTime); }) };
    }, Math.max(0, delay));
  }
  async function run(mediaTime) {
    if (!allowed() || busy) return;
    const elapsed = now() - lastStart;
    if (elapsed < cadence() - 1) { schedule(cadence() - elapsed); return; }
    if (video.readyState < 2 || (Number.isFinite(mediaTime) && mediaTime === lastMediaTime)) { schedule(cadence()); return; }
    lastMediaTime = mediaTime; lastStart = now(); busy = true;
    let failed = false;
    try { await process(); }
    catch (error) { failed = true; clear(); onError(error); }
    finally { busy = false; if (!failed && allowed()) schedule(Math.max(0, cadence() - (now() - lastStart))); }
  }
  return {
    resume() { paused = false; schedule(Math.max(0, cadence() - (now() - lastStart))); },
    pause() { paused = true; clear(); },
    dispose() { disposed = true; paused = true; clear(); },
  };
}
