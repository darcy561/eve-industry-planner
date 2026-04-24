import { useEffect, useRef } from "react";

export function useAdvanceWhenFollowingAppDefault({
  applicationDefault,
  committedValue,
  fallback,
  dispatch,
  advanceActionType,
}) {
  const prevAppRef = useRef(applicationDefault ?? fallback);

  useEffect(() => {
    const nextDefault = applicationDefault ?? fallback;
    const prevDefault = prevAppRef.current;
    if (nextDefault === prevDefault) {
      return;
    }
    const wasFollowingOldDefault = committedValue === prevDefault;
    prevAppRef.current = nextDefault;
    if (wasFollowingOldDefault) {
      dispatch({ type: advanceActionType, payload: nextDefault });
    }
  }, [
    applicationDefault,
    committedValue,
    fallback,
    dispatch,
    advanceActionType,
  ]);
}
