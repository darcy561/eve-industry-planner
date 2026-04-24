import { useEffect, useMemo } from "react";
import {
  clearHeaderDocumentLockUI,
  registerHeaderDocumentLockUI,
} from "../../Events/headerDocumentLockEvents.js";

export function useRegisterHeaderDocumentLockUI(config) {
  const {
    registrations,
    collection,
    docID,
    enabled = true,
    readOnlyMessage,
    label,
    treeOwnership,
  } = config;

  const serialized = useMemo(() => {
    if (Array.isArray(registrations)) {
      return JSON.stringify(registrations);
    }
    return [
      collection,
      docID,
      enabled,
      readOnlyMessage,
      label,
      treeOwnership,
    ].join("\0");
  }, [
    registrations,
    collection,
    docID,
    enabled,
    readOnlyMessage,
    label,
    treeOwnership,
  ]);

  useEffect(() => {
    if (Array.isArray(registrations)) {
      registerHeaderDocumentLockUI({ registrations });
    } else {
      registerHeaderDocumentLockUI({
        collection,
        docID,
        enabled,
        readOnlyMessage,
        label,
        treeOwnership,
      });
    }
    return () => clearHeaderDocumentLockUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);
}
