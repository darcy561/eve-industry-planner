/**
 * The shape every static data file is read through.
 *
 * Each file is downloaded and cached once and then read many times, by callers that often cannot
 * await — a shopping list priced from a class method, a fit parsed from clipboard text, a job built
 * from a click. So loading is separated from reading: the file is primed once by whatever can wait,
 * and every read after that is a plain lookup.
 *
 * The owners under this folder differ only in which file they read and which views they take of it.
 * What they share — loading once, sharing one load between concurrent callers, not remembering a
 * failure as an answer, and dropping everything when a new build arrives — lives here.
 */

/**
 * @template T
 * @typedef {Object} StaticFile
 * @property {() => Promise<void>} prime - loads the file once; concurrent callers share the load
 * @property {() => T|null} read - the loaded contents, or null before they arrive
 * @property {<V>(build: (contents: T) => V) => () => V|null} view - a derived view, built once and
 *   dropped with the file it came from
 * @property {() => void} reset - forgets the file and every view of it
 */

/**
 * A static file, held for reading without awaiting.
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

  function prime() {
    if (contents) return Promise.resolve();

    // A failure is not remembered as an answer: `priming` is cleared either way, so a later caller
    // retries rather than inheriting one outage. Views need no dropping here — the only way back
    // to empty contents is `reset`, which drops them on the way past.
    priming ??= load()
      .then((raw) => {
        contents = receive(raw);
      })
      .finally(() => {
        priming = null;
      });

    return priming;
  }

  function read() {
    return contents;
  }

  /**
   * A value derived from the file, built on first use and kept until the file is dropped.
   *
   * Registered rather than held by the caller so that a new build cannot leave a view behind that
   * outlives the contents it was built from — the trap of holding a derived array beside the thing
   * it was derived from.
   */
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

  function reset() {
    contents = null;
    priming = null;
    for (const drop of views) drop();
  }

  return { prime, read, view, reset };
}

/**
 * Entries keyed by their lowercased name, for matching what a player pasted.
 *
 * A pasted list is matched a line at a time, so a scan per line is a scan of the whole file per
 * line. Names are matched case-insensitively and without surrounding space, because a player pastes
 * what the game gave them.
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
