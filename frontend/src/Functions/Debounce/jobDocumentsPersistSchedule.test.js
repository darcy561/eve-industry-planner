import { describe, expect, it, vi } from "vitest";

let resolvePersist;
const persistJobDocumentsToApi = vi.fn(
  () =>
    new Promise((resolve) => {
      resolvePersist = resolve;
    }),
);
vi.mock("../JobDocuments/persistJobDocumentsToApi.js", () => ({
  persistJobDocumentsToApi: () => persistJobDocumentsToApi(),
}));
vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account: { isLoggedIn: true } }),
  );
});

const { flushPendingJobDocumentsSave } =
  await import("./jobDocumentsPersistSchedule.js");

// A caller flushes so that the write has landed before it does something the
// write's meaning depends on — switching planner sends the next request under
// another owner. A flush that resolved while the write was still in the air
// would read as ordered and not be.
describe("flushing queued job documents", () => {
  it("resolves only once the write has finished", async () => {
    let finished = false;
    const flush = flushPendingJobDocumentsSave().then(() => {
      finished = true;
    });

    await Promise.resolve();
    expect(persistJobDocumentsToApi).toHaveBeenCalled();
    expect(finished).toBe(false);

    resolvePersist();
    await flush;
    expect(finished).toBe(true);
  });
});
