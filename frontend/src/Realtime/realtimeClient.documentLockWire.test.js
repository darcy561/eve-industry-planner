import { describe, expect, it } from "vitest";
import { documentLockWireToDetail } from "./realtimeClient.js";
import {
  DOCUMENT_LOCK_DOMAIN_EVENTS,
  DOCUMENT_LOCK_FRAME_TYPES,
} from "../Functions/DocumentLock/documentLockEvents.js";

describe("documentLockWireToDetail", () => {
  it("returns null when event is missing or blank", () => {
    expect(documentLockWireToDetail({ type: DOCUMENT_LOCK_FRAME_TYPES.CHANNEL })).toBeNull();
    expect(
      documentLockWireToDetail({
        type: DOCUMENT_LOCK_FRAME_TYPES.CHANNEL,
        event: "   ",
      })
    ).toBeNull();
  });

  it("normalises flat wire: type alias + passthrough fields", () => {
    const detail = documentLockWireToDetail({
      type: DOCUMENT_LOCK_FRAME_TYPES.CHANNEL,
      event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
      collection: "job_documents",
      docID: "j1",
      requesterSessionID: "sess-a",
    });
    expect(detail).not.toBeNull();
    expect(detail?.event).toBe(DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED);
    expect(detail?.type).toBe(DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED);
    expect(detail?.collection).toBe("job_documents");
    expect(detail?.docID).toBe("j1");
    expect(detail?.requesterSessionID).toBe("sess-a");
    expect(detail).not.toHaveProperty("payload");
  });
});
