import { useEffect } from "react";
import {
  parkWebsocketForMaintenance,
  resumeWebsocketAfterMaintenance,
} from "../../WebSocket/websocketClient.js";

/**
 * Parks the websocket layer while maintenance is on and resumes it when the
 * window ends.
 *
 * @param {boolean} isMaintenanceMode Live `maintenance_mode` from app-config.
 */
export default function useMaintenanceWebsocketPark(isMaintenanceMode) {
  useEffect(() => {
    if (isMaintenanceMode) {
      parkWebsocketForMaintenance();
      return;
    }
    resumeWebsocketAfterMaintenance();
  }, [isMaintenanceMode]);
}
