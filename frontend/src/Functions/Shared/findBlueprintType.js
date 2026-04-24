import { getAllCachedCorporationBlueprints } from "../../Hooks/EveEsi/Corporation/useGetAllCorporationBlueprints";
import { getAllCachedCharacterBlueprints } from "../../Hooks/EveEsi/Character/useGetAllCharacterBlueprints";

/**
 * Determines whether a blueprint is a copy (bpc) or original (bp).
 *
 * @param {number | undefined | null} blueprintID
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @returns {"bpc" | "bp"}
 */
export default function findBlueprintType(blueprintID, queryClient) {
  if (!blueprintID) {
    return "bpc";
  }

  const { data: characterBlueprints = {} } =
    getAllCachedCharacterBlueprints(queryClient);
  const { data: corporationBlueprints = {} } =
    getAllCachedCorporationBlueprints(queryClient);

  const blueprintData = [
    ...Object.values(characterBlueprints).flat(),
    ...Object.values(corporationBlueprints).flat(),
  ];

  const foundBlueprint = blueprintData.find((i) => i.item_id === blueprintID);
  if (!foundBlueprint || foundBlueprint.quantity === -2) {
    return "bpc";
  }

  return "bp";
}
