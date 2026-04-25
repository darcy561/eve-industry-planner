import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";

/**
 * Re-fits the viewport to include all nodes whenever `fitViewRequestKey` changes.
 */
export default function FitViewToGraphEffect({ fitViewRequestKey }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (fitViewRequestKey === undefined || fitViewRequestKey === null) return;
    const t = window.setTimeout(() => {
      fitView({
        padding: 0.28,
        duration: 220,
        maxZoom: 1.35,
      });
    }, 80);
    return () => window.clearTimeout(t);
  }, [fitViewRequestKey, fitView]);

  return null;
}
