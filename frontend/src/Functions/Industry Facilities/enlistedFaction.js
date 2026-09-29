import useUsersStore from "../../Zustand/usersStore";
import { constraintsFor } from "./placeConstraints";

/**
 * The militia a setup is costed against: the one it names, or the one the
 * character running it flies for.
 *
 * @param {{enlistedFaction?: number|null, selectedCharacter?: string}} setup
 * @returns {number|null}
 */
export default function enlistedFactionForSetup(setup) {
  if (setup?.enlistedFaction != null) return setup.enlistedFaction;

  const character = useUsersStore
    .getState()
    .account.actions.findCharacterByHash(setup?.selectedCharacter);

  return character?.faction_id ?? null;
}

/**
 * The faction holding a system in factional warfare, and zero for a system no
 * militia holds.
 *
 * @param {number} [systemID]
 * @returns {number}
 */
export function militiaHolding(systemID) {
  if (!systemID) return 0;

  return (
    useUsersStore.getState().worldData.systemIndexes?.[systemID]
      ?.militiaFactionID ?? 0
  );
}

/**
 * Whether a setup's system is one a reader may state an upgrade level for.
 *
 * @param {{systemID?: number}} setup
 * @returns {boolean}
 */
export function systemTakesAnUpgradeLevel(setup) {
  return militiaHolding(setup?.systemID) !== 0;
}

/**
 * Every militia that would change what a setup costs: the ones the place it is in
 * gives figures to, and the one holding its system.
 *
 * @param {Object} setup - The setup being costed
 * @param {number} [holding] - The militia holding its system, when the caller has it
 * @returns {Array<number>}
 */
export function militiasThatMatterFor(setup, holding) {
  const fromPlace = constraintsFor(setup).flatMap(
    (constraint) => constraint.enlistedValues?.factions ?? [],
  );
  const held = holding ?? militiaHolding(setup?.systemID);

  return [...new Set(held ? [...fromPlace, held] : fromPlace)];
}
