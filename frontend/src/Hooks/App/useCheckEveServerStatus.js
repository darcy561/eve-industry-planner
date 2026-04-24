import { useEffect, useRef } from "react";
import useUsersStore from "../../Zustand/usersStore";
import { getESIRateLimitStatuses } from "../../Functions/EveESI/fetchWithCustomHeaders";
import fetchWithCustomHeaders from "../../Functions/EveESI/fetchWithCustomHeaders";

function useCheckEveServerStatus() {
  const intervalRef = useRef(null);

  useEffect(() => {
    const checkEveServerStatus = async () => {
      try {
        const rateLimits = getESIRateLimitStatuses();
        const statusStatus = rateLimits.find((status) => status.group === "status");

        if (statusStatus && statusStatus.availableTokens <= 0) {
          const tokensPerMs = statusStatus.maxTokens / statusStatus.windowSize;
          const tokensToRecover = statusStatus.maxTokens - statusStatus.availableTokens;
          const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setTimeout(checkEveServerStatus, waitTime);
          return;
        }

        const statusPromise = await fetchWithCustomHeaders(
          "https://esi.evetech.net/status/?datasource=tranquility",
          {},
          {
            group: "status",
            priority: "low",
            batchable: true,
            maxRetries: 1,
          }
        );

        const statusJSON = await statusPromise.json();

        if (statusPromise.status === 200 || statusPromise.status === 304) {
          useUsersStore.getState().worldData.actions.updateEveServerStatus({
            eveServerStatus: true,
            evePlayerCount: statusJSON.players,
          });
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(checkEveServerStatus, 15 * 60 * 1000);
        } else {
          useUsersStore.getState().worldData.actions.updateEveServerStatus({
            eveServerStatus: false,
            evePlayerCount: 0,
          });
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = setInterval(checkEveServerStatus, 5 * 60 * 1000);
        }
      } catch (err) {
        if (err.message && err.message.includes("rate limited")) {
          const rateLimits = getESIRateLimitStatuses();
          const statusStatus = rateLimits.find((status) => status.group === "status");
          if (statusStatus) {
            const tokensPerMs = statusStatus.maxTokens / statusStatus.windowSize;
            const tokensToRecover = statusStatus.maxTokens - statusStatus.availableTokens;
            const waitTime = Math.ceil(tokensToRecover / tokensPerMs);
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setTimeout(checkEveServerStatus, waitTime);
            return;
          }
        }

        useUsersStore.getState().worldData.actions.updateEveServerStatus({
          eveServerStatus: false,
          evePlayerCount: 0,
        });
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(checkEveServerStatus, 5 * 60 * 1000);
      }
    };

    checkEveServerStatus();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
}

export default useCheckEveServerStatus;
