const loaded = new Map();

// Third-party libraries load only when the corresponding feature is used.
export function loadScript(url, globalName) {
  const readGlobal = typeof globalName === 'function' ? globalName : () => globalThis[globalName];
  if (readGlobal()) return Promise.resolve(readGlobal());
  if (loaded.has(url)) return loaded.get(url);
  const task = new Promise((resolve, reject) => {
    const element = document.createElement('script');
    const timer = setTimeout(() => { element.remove(); loaded.delete(url); reject(new Error('library_timeout')); }, 18000);
    element.src = url;
    element.async = true;
    element.onload = () => {
      clearTimeout(timer);
      if (readGlobal()) resolve(readGlobal());
      else { loaded.delete(url); reject(new Error('library_unavailable')); }
    };
    element.onerror = () => { clearTimeout(timer); element.remove(); loaded.delete(url); reject(new Error('library_unavailable')); };
    document.head.append(element);
  });
  loaded.set(url, task);
  return task;
}

export async function fetchJSON(url, timeout = 12000, options = {}) {
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
