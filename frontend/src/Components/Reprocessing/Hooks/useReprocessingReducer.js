import { useMemo, useReducer } from "react";
import {
  PRICING_SIDE,
  resolvePricingSide,
} from "../../../Functions/MarketData/defaults/pricingSide";
import {
  emptyPastes,
  reprocessingDirections,
  reprocessingReducer,
  REPROCESSING_ACTION_TYPES,
} from "./reprocessingReducer";
import { usePlannerReprocessingSettings } from "../../../Hooks/React Query/plannerSettings.js";
import { useGetCharacterSkills } from "../../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { scheduleDebouncedPlannerSettingsSave } from "../../../Functions/Debounce/plannerSettingsPersistSchedule.js";
import { structureFromDocument } from "../../../Functions/Custom Structures/customStructure";
import { resolveSellerCharacter } from "../../../Functions/MarketOrders/sellerCharacter";
import useUsersStore from "../../../Zustand/usersStore";
import {
  defaultPlannerReprocessingSettings,
  jobTypes,
} from "../../../Context/defaultValues";
import GLOBAL_CONFIG from "../../../global-config-app";
import { useAdvanceWhenFollowingAppDefault } from "../../../Hooks/Planner/useAdvanceWhenFollowingAppDefault.js";

const { DEFAULT_MARKET_OPTION, DEFAULT_ORDER_TYPE } = GLOBAL_CONFIG;

/**
 * The Reprocessing page's state — the reader's choices only — with the settings and skills in force
 * and the actions that change them.
 *
 * @returns {{state: Object, settings: ReturnType<typeof defaultPlannerReprocessingSettings>,
 *   skills: Object<string, number>, trainedSkills: Object<string, number>,
 *   skillsStatus: {isLoading: boolean, isError: boolean},
 *   isPlannerHeld: boolean, actions: Object<string, Function>}}
 */
export default function useReprocessingReducer() {
  const getDefaultReprocessingStructure = useUsersStore(
    (state) =>
      state.applicationSettings.actions.getDefaultCustomStructureWithJobType,
  );
  const { getDefaultReprocessingCharacter } =
    useUsersStore.getState().applicationSettings.actions;
  const { marketLocation: defaultMarketLocation, orderType: defaultOrderType } =
    resolvePricingSide({
      accountPricing: useUsersStore(
        (state) => state.applicationSettings.defaultPricing,
      ),
      side: PRICING_SIDE.SELLING,
    });
  const characters = useUsersStore((state) => state.account.characters);

  const [state, dispatch] = useReducer(reprocessingReducer, undefined, () => ({
    direction: reprocessingDirections.toMinerals,
    pastes: emptyPastes(),
    currentStructure: structureFromDocument(
      getDefaultReprocessingStructure(jobTypes.reprocessing) ?? undefined,
      jobTypes.reprocessing,
    ),
    skillOverrides: {},
    selectedUser:
      getDefaultReprocessingCharacter(characters)?.CharacterHash ||
      useUsersStore.getState().account.actions.getMainCharacterHash() ||
      null,
    marketLocation: defaultMarketLocation || DEFAULT_MARKET_OPTION,
    orderType: defaultOrderType || DEFAULT_ORDER_TYPE,
    sellerHash: resolveSellerCharacter().hash,
    reprocessingSettings: defaultPlannerReprocessingSettings(),
  }));

  useAdvanceWhenFollowingAppDefault({
    applicationDefault: defaultOrderType,
    committedValue: state.orderType,
    fallback: DEFAULT_ORDER_TYPE,
    dispatch,
    advanceActionType: REPROCESSING_ACTION_TYPES.SET_MARKET_ORDER_TYPE,
  });

  useAdvanceWhenFollowingAppDefault({
    applicationDefault: defaultMarketLocation,
    committedValue: state.marketLocation,
    fallback: DEFAULT_MARKET_OPTION,
    dispatch,
    advanceActionType: REPROCESSING_ACTION_TYPES.SET_MARKET_LOCATION,
  });

  const planner = usePlannerReprocessingSettings();
  const settings = planner.isHeld
    ? planner.settings
    : state.reprocessingSettings;

  const {
    data: characterSkills,
    isLoading: skillsLoading,
    isError: skillsFailed,
  } = useGetCharacterSkills(state.selectedUser);
  const trainedSkills = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(characterSkills ?? {}).map(([skillID, skill]) => [
          skillID,
          skill?.activeLevel ?? 0,
        ]),
      ),
    [characterSkills],
  );
  const skills = useMemo(
    () => ({ ...trainedSkills, ...state.skillOverrides }),
    [trainedSkills, state.skillOverrides],
  );

  const changeSettings = (change) => {
    if (planner.isHeld) {
      const { plannerSettings } = useUsersStore.getState();
      const held =
        plannerSettings.byOwner[planner.owner]?.reprocessingSettings ??
        settings;
      plannerSettings.actions.writePlannerReprocessingSettings(
        planner.owner,
        change(held),
      );
      scheduleDebouncedPlannerSettingsSave(planner.owner);
      return;
    }
    dispatch({
      type: REPROCESSING_ACTION_TYPES.CHANGE_REPROCESSING_SETTINGS,
      payload: change,
    });
  };

  const send = (type) => (payload) => dispatch({ type, payload });
  const actions = {
    setDirection: send(REPROCESSING_ACTION_TYPES.SET_DIRECTION),
    setPaste: send(REPROCESSING_ACTION_TYPES.SET_PASTE),
    commitPaste: send(REPROCESSING_ACTION_TYPES.COMMIT_PASTE),
    clearPaste: send(REPROCESSING_ACTION_TYPES.CLEAR_PASTE),
    setSeller: send(REPROCESSING_ACTION_TYPES.SET_SELLER),
    setCurrentStructure: send(REPROCESSING_ACTION_TYPES.SET_CURRENT_STRUCTURE),
    setSkillLevel: (id, level) =>
      dispatch({
        type: REPROCESSING_ACTION_TYPES.SET_SKILL_LEVEL,
        payload: { id, level },
      }),
    setSelectedUser: send(REPROCESSING_ACTION_TYPES.SET_SELECTED_USER),
    setMarketLocation: send(REPROCESSING_ACTION_TYPES.SET_MARKET_LOCATION),
    setMarketOrderType: send(REPROCESSING_ACTION_TYPES.SET_MARKET_ORDER_TYPE),
    changeSettings: (partial) =>
      changeSettings((held) => ({ ...held, ...partial })),
    neverChoose: (typeID) =>
      changeSettings((held) => ({
        ...held,
        neverChoose: [...new Set([...held.neverChoose, Number(typeID)])],
      })),
    allowAgain: (typeID) =>
      changeSettings((held) => ({
        ...held,
        neverChoose: held.neverChoose.filter((id) => id !== Number(typeID)),
      })),
  };

  return {
    state,
    settings,
    skills,
    trainedSkills,
    skillsStatus: { isLoading: skillsLoading, isError: skillsFailed },
    isPlannerHeld: planner.isHeld,
    actions,
  };
}
