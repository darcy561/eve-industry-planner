import { useEffect, useRef } from "react";
import useUsersStore from "../Zustand/usersStore";
import { getESIRateLimitStatuses } from "../Functions/EveESI/fetchWithCustomHeaders";
import fetchWithCustomHeaders from "../Functions/EveESI/fetchWithCustomHeaders";

/**
 * Custom hook that monitors EVE Online server status and player count
 * 
 * This hook:
 * - Checks EVE server status via ESI API at regular intervals
 * - Handles ESI rate limiting with intelligent retry timing
 * - Updates server status and player count in the Zustand store
 * - Adjusts check intervals based on server status (15min online, 5min offline)
 * - Runs immediately on mount and sets up automatic polling
 * - Cleans up intervals on unmount to prevent memory leaks
 * 
 * Rate Limiting Behavior:
 * - Checks ESI rate limit status before making requests
 * - Calculates wait time based on token recovery rate
 * - Uses setTimeout for rate-limited retries instead of fixed intervals
 * 
 * @returns {void} This hook doesn't return any value, but updates the global store
 * 
 * @example
 * function App() {
 *   useCheckEveServerStatus(); // Starts monitoring EVE server status
 *   return <div>App content</div>;
 * }
 */
function useCheckEveServerStatus() {
    const intervalRef = useRef(null);

    useEffect(() => {
        const checkEveServerStatus = async () => {
            try {
                // Check if status group is rate limited
                const rateLimits = getESIRateLimitStatuses();
                const statusStatus = rateLimits.find(status => status.group === 'status');

                if (statusStatus && statusStatus.availableTokens <= 0) {
                    const tokensPerMs = statusStatus.maxTokens / statusStatus.windowSize;
                    const tokensToRecover = statusStatus.maxTokens - statusStatus.availableTokens;
                    const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

                    console.warn(`Status group is rate limited. Wait ${Math.ceil(waitTime / 1000)} seconds.`);

                    // If rate limited, set interval to check again in the calculated wait time
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                    }
                    intervalRef.current = setTimeout(checkEveServerStatus, waitTime);
                    return;
                }

                const statusPromise = await fetchWithCustomHeaders(
                    "https://esi.evetech.net/latest/status/?datasource=tranquility",
                    {},
                    {
                        group: 'status',
                        priority: 'low',
                        batchable: true,
                        maxRetries: 1
                    }
                );

                const statusJSON = await statusPromise.json();

                if (statusPromise.status === 200 || statusPromise.status === 304) {
                    // Update Zustand store
                    useUsersStore.getState().worldData.actions.updateEveServerStatus({
                        eveServerStatus: true,
                        evePlayerCount: statusJSON.players,
                    });

                    // If server is online, set interval to 15 minutes
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                    }
                    intervalRef.current = setInterval(checkEveServerStatus, 15 * 60 * 1000);
                } else {
                    // Update Zustand store
                    useUsersStore.getState().worldData.actions.updateEveServerStatus({
                        eveServerStatus: false,
                        evePlayerCount: 0,
                    });

                    console.warn("EVE Server Status: Offline");

                    // If server is offline, set interval to 5 minutes
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                    }
                    intervalRef.current = setInterval(checkEveServerStatus, 5 * 60 * 1000);
                }
            } catch (err) {
                console.error("Error checking EVE server status:", err);

                // Check if it's a rate limiting error
                if (err.message && err.message.includes('rate limited')) {
                    // If rate limited, wait and retry
                    const rateLimits = getESIRateLimitStatuses();
                    const statusStatus = rateLimits.find(status => status.group === 'status');

                    if (statusStatus) {
                        const tokensPerMs = statusStatus.maxTokens / statusStatus.windowSize;
                        const tokensToRecover = statusStatus.maxTokens - statusStatus.availableTokens;
                        const waitTime = Math.ceil(tokensToRecover / tokensPerMs);

                        console.warn(`Rate limited, retrying in ${Math.ceil(waitTime / 1000)} seconds`);

                        if (intervalRef.current) {
                            clearInterval(intervalRef.current);
                        }
                        intervalRef.current = setTimeout(checkEveServerStatus, waitTime);
                        return;
                    }
                }

                // Update status to offline on error
                useUsersStore.getState().worldData.actions.updateEveServerStatus({
                    eveServerStatus: false,
                    evePlayerCount: 0,
                });

                // If there's an error, set interval to 5 minutes
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
                intervalRef.current = setInterval(checkEveServerStatus, 5 * 60 * 1000);
            }
        };

        // Run immediately on mount
        checkEveServerStatus();

        // Cleanup function
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);
}

export default useCheckEveServerStatus;
