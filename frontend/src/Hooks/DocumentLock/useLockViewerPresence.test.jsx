import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLockViewerPresence } from "./useLockViewerPresence.js";

vi.mock("../../Functions/Endpoints/Private/documentLockClient.js", () => ({
  postDocumentLockViewerArrived: vi.fn(() => Promise.resolve()),
  postDocumentLockViewerDeparted: vi.fn(() => Promise.resolve()),
  sendDocumentLockViewerDepartedBeacon: vi.fn(),
}));

import {
  postDocumentLockViewerArrived,
  postDocumentLockViewerDeparted,
} from "../../Functions/Endpoints/Private/documentLockClient.js";

describe("useLockViewerPresence", () => {
  it("registers viewer when queued on waitlist even if not readOnly", () => {
    renderHook(() =>
      useLockViewerPresence({
        enabled: true,
        collection: "job_documents",
        docID: "job-1",
        readOnly: false,
        waitingInHandoffQueue: true,
      })
    );

    expect(postDocumentLockViewerArrived).toHaveBeenCalledWith(
      "job_documents",
      "job-1"
    );
    expect(postDocumentLockViewerDeparted).not.toHaveBeenCalled();
  });

  it("does not depart when readOnly clears but waitlist flag remains", () => {
    const { rerender, unmount } = renderHook(
      (props) => useLockViewerPresence(props),
      {
        initialProps: {
          enabled: true,
          collection: "job_documents",
          docID: "job-1",
          readOnly: true,
          waitingInHandoffQueue: true,
        },
      }
    );

    postDocumentLockViewerArrived.mockClear();
    postDocumentLockViewerDeparted.mockClear();

    rerender({
      enabled: true,
      collection: "job_documents",
      docID: "job-1",
      readOnly: false,
      waitingInHandoffQueue: true,
    });

    expect(postDocumentLockViewerDeparted).not.toHaveBeenCalled();
    expect(postDocumentLockViewerArrived).not.toHaveBeenCalled();

    unmount();
    expect(postDocumentLockViewerDeparted).toHaveBeenCalledWith(
      "job_documents",
      "job-1"
    );
  });
});
