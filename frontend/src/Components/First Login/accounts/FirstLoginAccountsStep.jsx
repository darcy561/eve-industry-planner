import { Stack } from "@mui/material";
import { AdditionalAccounts } from "../../Accounts/AdditionalAccounts";
import { FirstLoginSetupSection } from "../shared/FirstLoginSetupSection";
import { FirstLoginMainCharacterCard } from "./FirstLoginMainCharacterCard";

export function FirstLoginAccountsStep() {
  return (
    <Stack spacing={2}>
      <FirstLoginSetupSection title="Characters & linked accounts">
        <FirstLoginMainCharacterCard />
        <AdditionalAccounts appearance="firstLogin" />
      </FirstLoginSetupSection>
    </Stack>
  );
}
