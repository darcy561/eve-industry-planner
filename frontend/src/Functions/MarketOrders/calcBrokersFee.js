import { STATIONID_RANGE } from "../../Context/defaultValues";
import getStationData from "../EveESI/World/getStationData";
import { getCachedCharacterSkills } from "../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { getCachedCharacterStandings } from "../../Hooks/EveEsi/Character/useGetCharacterStandings";

/**
 * Calculates broker fee for a market order.
 *
 * @param {object} marketOrder
 * @param {import("@tanstack/react-query").QueryClient} queryClient
 * @param {number} citadelBrokersFee
 * @returns {Promise<number>}
 */
export default async function calcBrokersFee(
  marketOrder,
  queryClient,
  citadelBrokersFee
) {
  let brokerFeePercentage = citadelBrokersFee;

  if (
    marketOrder.location_id >= STATIONID_RANGE.low &&
    marketOrder.location_id <= STATIONID_RANGE.high
  ) {
    const { data: characterSkills } = getCachedCharacterSkills(
      queryClient,
      marketOrder.CharacterHash
    );
    const { data: characterStandings } = getCachedCharacterStandings(
      queryClient,
      marketOrder.CharacterHash
    );

    const brokerSkill = characterSkills?.[3446];
    const stationInfo = await getStationData(marketOrder.location_id);

    const factionStanding =
      characterStandings?.find((i) => i.from_id === stationInfo.race_id)
        ?.standing ?? 0;
    const corpStanding =
      characterStandings?.find((i) => i.from_id === stationInfo.owner)
        ?.standing ?? 0;

    brokerFeePercentage =
      3 -
      0.3 * (brokerSkill?.activeLevel ?? 0) -
      0.03 * factionStanding -
      0.02 * corpStanding;
  }

  const brokersFee =
    (brokerFeePercentage / 100) *
    (marketOrder.price * marketOrder.volume_total);

  return Math.max(brokersFee, 100);
}
