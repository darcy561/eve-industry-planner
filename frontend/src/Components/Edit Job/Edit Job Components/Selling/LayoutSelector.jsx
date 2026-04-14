import { useMediaQuery } from "@mui/material";
import { Selling_StandardLayout_EditJob } from "./Standard Layout/standardLayout";
import useUsersStore from "../../../../Zustand/usersStore";
import { useGetCharacterOrdersAndWalletData } from "../../../../Hooks/EveEsi/useGetCharacterOrdersAndWalletData";
import { useGetCharacterSkills } from "../../../../Hooks/EveEsi/Character/useGetCharacterSkills";
import { useGetCharacterStandings } from "../../../../Hooks/EveEsi/Character/useGetCharacterStandings";

export function LayoutSelector_EditJob_Selling(props) {
  const { state } = props;
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const mainCharacterHash =
    useUsersStore.getState().account.actions.getMainCharacterHash();

  const characterHashes = [
    ...new Set(
      [
        mainCharacterHash,
        ...state.activeJob.build.sale.marketOrders.map(
          (order) => order.CharacterHash
        ),
      ].filter(Boolean)
    ),
  ];

  const {
    isLoading: characterDataLoading,
    isError: characterDataError,
    error: characterDataErrorObj,
  } = useGetCharacterOrdersAndWalletData(characterHashes);

  const {
    isLoading: SkillDataLoading,
    isError: SkillDataError,
    error: SkillDataErrorObj,
  } = useGetCharacterSkills(mainCharacterHash);

  const {
    isLoading: StandingDataLoading,
    isError: StandingDataError,
    error: StandingDataErrorObj,
  } = useGetCharacterStandings(mainCharacterHash);

  const isLoading =
    SkillDataLoading ||
    StandingDataLoading ||
    characterDataLoading

  const isError =
    SkillDataError || StandingDataError || characterDataError;

  const error =
    SkillDataErrorObj ||
    StandingDataErrorObj ||
    characterDataErrorObj

  switch (deviceNotMobile) {
    case true:
      return <Selling_StandardLayout_EditJob {...props} isLoading={isLoading} isError={isError} error={error} />;
    case false:
      return <Selling_StandardLayout_EditJob {...props} isLoading={isLoading} isError={isError} error={error} />;
    default:
      return <Selling_StandardLayout_EditJob {...props} isLoading={isLoading} isError={isError} error={error} />;
  }
}
