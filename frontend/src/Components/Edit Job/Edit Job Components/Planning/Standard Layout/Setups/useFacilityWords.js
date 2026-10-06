import {
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../../../../../../Functions/Industry Facilities/getStructureInfo";
import { rigSlotLabel } from "../../../../../../Functions/Industry Facilities/rigs";
import { useSolarSystemName } from "../../../../../../Hooks/useSolarSystems";
import useUsersStore from "../../../../../../Zustand/usersStore";

/**
 * A facility in words: the saved structure's name, or its size where none is saved, and the size,
 * security, rigs, tax and system behind it.
 *
 * @param {ReturnType<typeof import("../../../../../../Functions/Industry Facilities/setupFacility").facilityOf> | null} facility
 * @param {number} jobType
 * @returns {{name: string, saved: boolean, size: string, security: string, rigs: string, tax: string, system: string, details: Array<string>}}
 */
export function useFacilityWords(facility, jobType) {
  const system = useSolarSystemName(facility?.systemID);
  const saved = useUsersStore((state) =>
    facility?.customStructureID
      ? state.applicationSettings.actions.getCustomStructureWithID(
          facility.customStructureID,
        )
      : null,
  );

  const size =
    getStructureInfoFromID(jobType, facility?.structureID)?.label ?? "Unknown";
  const security =
    getSystemTypeFromID(jobType, facility?.systemTypeID)?.label ?? "Unknown";

  const rigs = rigSlotLabel(jobType, facility?.rigSlot1, facility?.rigSlot2);
  const tax = `${facility?.taxValue ?? 0}%`;

  return {
    name: saved?.name ?? size,
    saved: Boolean(saved),
    size,
    security,
    rigs,
    tax,
    system,
    details: [
      ...(saved ? [size] : []),
      security,
      rigs,
      `${tax} facility tax`,
      system,
    ],
  };
}
