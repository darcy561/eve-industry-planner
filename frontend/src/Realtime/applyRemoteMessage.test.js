import { beforeEach, describe, expect, test, vi } from "vitest";

const invalidateArchiveQueries = vi.fn();
const showSnackbar = vi.fn();

vi.mock("../queryClient.js", () => ({ queryClient: { marker: "queryClient" } }));
vi.mock("../Hooks/React Query/Backend/archivedJobsList.js", () => ({
  invalidateArchiveQueries: (...args) => invalidateArchiveQueries(...args),
}));
vi.mock("../Events/snackbarEvents.js", () => ({
  showSnackbar: (...args) => showSnackbar(...args),
}));

const applyDocumentMessage = vi.fn();
vi.mock("./handlers/documentMessage.js", () => ({
  applyDocumentMessage: (...args) => applyDocumentMessage(...args),
}));

const { applyRemoteMessage } = await import("./applyRemoteMessage.js");

describe("applyRemoteMessage", () => {
  beforeEach(() => {
    invalidateArchiveQueries.mockClear();
    showSnackbar.mockClear();
    applyDocumentMessage.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // Every producer of document changes predates the family field, so an absent
  // one has to keep meaning what it means today.
  test("a message with no type still routes to the document path", async () => {
    await applyRemoteMessage({ collection: "accounts", docID: "a1" });
    expect(applyDocumentMessage).toHaveBeenCalledOnce();
    expect(invalidateArchiveQueries).not.toHaveBeenCalled();
  });

  test("an explicit document type routes the same way", async () => {
    await applyRemoteMessage({ type: "document", collection: "accounts", docID: "a1" });
    expect(applyDocumentMessage).toHaveBeenCalledOnce();
  });

  // One handler invalidates both trees, so a call site that archives a job does
  // not have to know what archiving invalidates.
  test("an archive statistics notification invalidates the archive and its statistics", async () => {
    await applyRemoteMessage({
      type: "notification",
      subtype: "archiveStatsProcessed",
      data: { accountID: "acct-1" },
    });
    expect(invalidateArchiveQueries).toHaveBeenCalledWith({ marker: "queryClient" });
    expect(showSnackbar).toHaveBeenCalled();
    expect(applyDocumentMessage).not.toHaveBeenCalled();
  });

  test("an unrecognised subtype is reported rather than dropped in silence", async () => {
    await applyRemoteMessage({ type: "notification", subtype: "somethingElse" });
    expect(console.warn).toHaveBeenCalledWith(
      "[realtime] no handler for notification",
      "somethingElse",
    );
    expect(invalidateArchiveQueries).not.toHaveBeenCalled();
  });

  test("an unrecognised family is reported too", async () => {
    await applyRemoteMessage({ type: "somethingNew" });
    expect(console.warn).toHaveBeenCalledWith(
      "[realtime] no handler for message family",
      "somethingNew",
    );
  });

  test("a non-object is ignored", async () => {
    await applyRemoteMessage(null);
    await applyRemoteMessage("nope");
    expect(applyDocumentMessage).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
