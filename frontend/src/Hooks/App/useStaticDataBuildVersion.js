import { useState, useEffect } from "react";
import { getStaticDataBuildVersion } from "../../Functions/Helper/getCachedData";

export default function useStaticDataBuildVersion() {
  const [sdeVersion, setSdeVersion] = useState(null);

  useEffect(() => {
    let cancelled = false;

    getStaticDataBuildVersion()
      .then((version) => {
        if (!cancelled) {
          setSdeVersion(version);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSdeVersion(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return sdeVersion;
}
