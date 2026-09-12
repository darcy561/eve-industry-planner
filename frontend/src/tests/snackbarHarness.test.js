import { beforeEach, describe, expect, it } from "vitest";
import * as real from "../Events/snackbarEvents.js";
import {
  lastSnackbar,
  resetSnackbars,
  snackbarMessages,
  snackbarMock,
  snackbars,
} from "./snackbarHarness.js";

beforeEach(resetSnackbars);

describe("snackbarMock", () => {
  // The reason this harness exists: Vitest throws on an export a factory left
  // out, so a mock that covers all but one is a test that breaks the day a
  // component reaches for the one it missed. Compared against the real module
  // rather than a copied list, which would drift the same way.
  it("covers every export the real module has", () => {
    expect(Object.keys(snackbarMock()).sort()).toEqual(
      Object.keys(real).sort(),
    );
  });

  it("records what the reader was told", () => {
    const mock = snackbarMock();
    mock.showSnackbarError("Could not save", 4);

    expect(lastSnackbar()).toMatchObject({
      kind: "showSnackbarError",
      message: "Could not save",
      severity: "error",
      duration: 4,
    });
  });

  it("keeps a lock snackbar's scope", () => {
    const mock = snackbarMock();
    mock.showDocumentLockAccessRequestSnackbar("Another tab asked", {
      collection: "job_documents",
      docID: "j1",
    });

    expect(lastSnackbar().scope).toEqual({
      collection: "job_documents",
      docID: "j1",
    });
  });

  it("spies and record stay in step", () => {
    const mock = snackbarMock();
    mock.showSnackbarSuccess("Saved");

    expect(mock.showSnackbarSuccess).toHaveBeenCalledWith("Saved");
    expect(snackbarMessages()).toEqual(["Saved"]);
  });
});

describe("reading back", () => {
  it("narrows by severity and by kind", () => {
    const mock = snackbarMock();
    mock.showSnackbarSuccess("Saved");
    mock.showSnackbarError("First fault");
    mock.showSnackbarError("Second fault");

    expect(snackbarMessages("error")).toEqual(["First fault", "Second fault"]);
    expect(lastSnackbar("showSnackbarSuccess").message).toBe("Saved");
  });

  it("answers null for a kind that was never raised", () => {
    expect(lastSnackbar("showSnackbarWarning")).toBeNull();
  });

  // Both the record and the spies are module state, so a test that forgets the
  // reset reads what an earlier one raised.
  it("clears the record and the spies", () => {
    const mock = snackbarMock();
    mock.showSnackbarInfo("Something");
    resetSnackbars();

    expect(snackbars).toEqual([]);
    expect(mock.showSnackbarInfo).not.toHaveBeenCalled();
  });
});
