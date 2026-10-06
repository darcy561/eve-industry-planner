/**
 * @template T
 * @typedef {Object} StaticFile
 * @property {() => Promise<void>} prime - loads the file once; concurrent callers share the load
 * @property {() => T|null} read - the loaded contents, or null before they arrive
 * @property {<V>(build: (contents: T) => V) => () => V|null} view - a derived view, built once and
 *   dropped with the file it came from
 * @property {(listener: () => void) => () => void} subscribe - hears each time the contents change
 * @property {() => void} reset - forgets the file and every view of it
 */

/**
 * A static file, loaded once and then read without awaiting, dropped whole when a new build
 * arrives; a failed load is retried rather than remembered.
 *
 * @template T
 * @param {() => Promise<T>} load - reads the file, normally a `getCachedData` accessor
 * @param {(raw: unknown) => T} [receive] - what to keep from what was loaded; the raw contents by
 *   default
 * @returns {StaticFile<T>}
 */
export default function staticFile(load, receive = (raw) => raw) {
  let contents = null;
  let priming = null;
  const views = new Set();
  const listeners = new Set();

  function changed() {
    for (const listener of listeners) listener();
  }

  function prime() {
    if (contents) return Promise.resolve();

    priming ??= load()
      .then((raw) => {
        contents = receive(raw);
        changed();
      })
      .finally(() => {
        priming = null;
      });

    return priming;
  }

  function read() {
    return contents;
  }

  function view(build) {
    let built = null;
    views.add(() => {
      built = null;
    });

    return () => {
      if (!contents) return null;
      built ??= build(contents);
      return built;
    };
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reset() {
    contents = null;
    priming = null;
    for (const drop of views) drop();
    changed();
  }

  return { prime, read, view, subscribe, reset };
}

/**
 * Entries keyed by their lowercased name, for matching a pasted line however it was cased.
 *
 * @template T
 * @param {Iterable<T>} entries
 * @param {(entry: T) => string|undefined} [nameOf]
 * @returns {Map<string, T>}
 */
export function byName(entries, nameOf = (entry) => entry?.name) {
  const map = new Map();
  for (const entry of entries) {
    const name = nameOf(entry);
    if (name) map.set(name.toLowerCase(), entry);
  }
  return map;
}

/**
 * What a name looks up as, so a caller matches the same way the map was keyed.
 *
 * @param {string} [name]
 * @returns {string|null}
 */
export function nameKey(name) {
  return name ? name.trim().toLowerCase() : null;
}
