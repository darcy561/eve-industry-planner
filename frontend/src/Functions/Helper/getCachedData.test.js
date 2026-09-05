import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("../Sentry/sentryEnvironment", () => ({
  sentryIsDevelopmentEnvironment: () => true,
}));

const fetchWithPublicHeaders = vi.fn();
vi.mock("../Endpoints/Public/applyPublicHeaders.js", () => ({
  fetchWithPublicHeaders: (...args) => fetchWithPublicHeaders(...args),
}));

const { CACHED_DATA_FILES } = await import("../../Context/defaultValues");

// The memo is module state, so each test gets its own module instance.
async function freshModule() {
  vi.resetModules();
  return (await import("./getCachedData.js")).getCachedData;
}

const FILE = CACHED_DATA_FILES.FULL_ITEM_LIST;

function metaResponse(version) {
  return {
    ok: true,
    json: async () => ({
      file_keys: { [FILE]: { versioned_url: `/static/${FILE}-${version}.json` } },
    }),
  };
}

let parses;

function installCaches(payloadByURL) {
  globalThis.caches = {
    open: async () => ({
      match: async (url) =>
        url in payloadByURL
          ? {
              ok: true,
              text: async () => {
                parses += 1;
                return JSON.stringify(payloadByURL[url]);
              },
            }
          : undefined,
      put: async () => {},
    }),
    keys: async () => [],
    delete: async () => true,
  };
}

beforeEach(() => {
  parses = 0;
  fetchWithPublicHeaders.mockReset();
});

afterEach(() => {
  delete globalThis.caches;
});

describe("getCachedData", () => {
  // The Cache API holds the file; parsing it is the expensive part, and every
  // caller was paying it. One parse per build is the point of the memo.
  it("parses a payload once however many callers ask", async () => {
    fetchWithPublicHeaders.mockResolvedValue(metaResponse(1));
    installCaches({ [`/static/${FILE}-1.json`]: { 587: { name: "Rifter" } } });

    const getCachedData = await freshModule();
    const [a, b, c] = await Promise.all([
      getCachedData(FILE),
      getCachedData(FILE),
      getCachedData(FILE),
    ]);

    expect(parses).toBe(1);
    expect(a[587].name).toBe("Rifter");
    // One object, not three copies of it.
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  // The memo is keyed by the versioned URL, so a new build gets its own entry
  // rather than the previous build's parse. Static metadata is cached with its
  // own TTL, so the build only changes once that refreshes.
  it("keeps a separate payload per build", async () => {
    fetchWithPublicHeaders.mockResolvedValue(metaResponse(1));
    installCaches({
      [`/static/${FILE}-1.json`]: { 587: { name: "Rifter" } },
      [`/static/${FILE}-2.json`]: { 587: { name: "Rifter II" } },
    });

    const getCachedData = await freshModule();
    const first = await getCachedData(FILE);
    expect(first[587].name).toBe("Rifter");

    fetchWithPublicHeaders.mockResolvedValue(metaResponse(2));
    const reloaded = await freshModule();
    const second = await reloaded(FILE);

    expect(second[587].name).toBe("Rifter II");
  });

  // A failed load must not be remembered as the answer: the next caller has to
  // be able to try again.
  it("does not remember a failure", async () => {
    fetchWithPublicHeaders.mockResolvedValue(metaResponse(1));
    installCaches({});
    fetchWithPublicHeaders.mockImplementation(async (url) =>
      url === "/api/static-data/meta"
        ? metaResponse(1)
        : { ok: false, status: 500, statusText: "boom" },
    );

    const getCachedData = await freshModule();
    await expect(getCachedData(FILE)).rejects.toThrow();

    installCaches({ [`/static/${FILE}-1.json`]: { 587: { name: "Rifter" } } });
    const retried = await getCachedData(FILE);

    expect(retried[587].name).toBe("Rifter");
  });
});
