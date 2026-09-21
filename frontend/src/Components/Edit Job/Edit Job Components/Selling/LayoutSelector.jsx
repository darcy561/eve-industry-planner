import { useMediaQuery } from "@mui/material";
import { Selling_StandardLayout_EditJob } from "./Standard Layout/standardLayout";
import useUsersStore from "../../../../Zustand/usersStore";
import { useGetCharacterOrdersAndWalletData } from "../../../../Hooks/EveEsi/useGetCharacterOrdersAndWalletData";
import { useSellingRateInputs } from "../../../../Hooks/React Query/Character/useSellingRateInputs";
import { useJobDraft } from "../../Edit Job Hooks/useJobDraft";

export function LayoutSelector_EditJob_Selling() {
  const marketOrders = useJobDraft((job) => job.esi.marketOrders);
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));
  const mainCharacterHash = useUsersStore
    .getState()
    .account.actions.getMainCharacterHash();

  const characterHashes = [
    ...new Set(
      [
        mainCharacterHash,
        ...Object.values(marketOrders).map((order) => order.CharacterHash),
      ].filter(Boolean),
    ),
  ];

  const {
    isLoading: characterDataLoading,
    isError: characterDataError,
    error: characterDataErrorObj,
  } = useGetCharacterOrdersAndWalletData(characterHashes);

  // Every character with an order here, not only the account's main: a fee is
  // worked out against the character who placed the order and then stored on the
  // job, so an alt whose skills and standings were never fetched had its orders
  // costed as though it had neither.
  const {
    isLoading: rateInputsLoading,
    isError: rateInputsError,
    error: rateInputsErrorObj,
  } = useSellingRateInputs(characterHashes);

  const isLoading = rateInputsLoading || characterDataLoading;

  const isError = rateInputsError || characterDataError;

  const error = rateInputsErrorObj || characterDataErrorObj;

  switch (deviceNotMobile) {
    case true:
      return (
        <Selling_StandardLayout_EditJob
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      );
    case false:
      return (
        <Selling_StandardLayout_EditJob
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      );
    default:
      return (
        <Selling_StandardLayout_EditJob
          isLoading={isLoading}
          isError={isError}
          error={error}
        />
      );
  }
}
