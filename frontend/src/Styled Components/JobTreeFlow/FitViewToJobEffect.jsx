import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

/**
 * Fits the viewport to the job encoded in `fitSessionKey` (`jobId::focusRequestKey::layoutRevision`).
 */
export default function FitViewToJobEffect({ fitSessionKey }) {
  const { fitView, getNode } = useReactFlow();

  useEffect(() => {
    if (!fitSessionKey) return;
    const id = String(fitSessionKey.split("::")[0]);
    const t = window.setTimeout(() => {
      const n = getNode(id);
      if (!n) return;
      fitView({
        nodes: [n],
        padding: 0.52,
        duration: 380,
        maxZoom: 0.88,
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [fitSessionKey, fitView, getNode]);

  return null;
}
