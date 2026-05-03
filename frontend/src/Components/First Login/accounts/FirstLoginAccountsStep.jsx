import { FormControlLabel, Stack, Switch } from "@mui/material";
import { AdditionalAccounts } from "../../Accounts/AdditionalAccounts";
import { scheduleDebouncedUserAccountDocumentSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import useUsersStore from "../../../Zustand/usersStore";
import { FirstLoginSetupSection } from "../shared/FirstLoginSetupSection";
import { FirstLoginStructureFormField } from "../shared/FirstLoginStructureFormField";
import { FirstLoginMainCharacterCard } from "./FirstLoginMainCharacterCard";

export function FirstLoginAccountsStep() {
  const shareCitadelNames = useUsersStore(
    (state) => state.account.shareCitadelNames,
  );
  const toggleShareCitadelNames = useUsersStore(
    (state) => state.account.actions.toggleShareCitadelNames,
  );

  return (
    <Stack spacing={2}>
      <FirstLoginSetupSection title="Characters & linked accounts">
        <FirstLoginMainCharacterCard />
        <AdditionalAccounts appearance="firstLogin" />
      </FirstLoginSetupSection>

      <FirstLoginSetupSection
        title="Citadel names"
        subtitle="Optional — shared anonymously to help label structures when you no longer have in-game access."
      >
        <FirstLoginStructureFormField
          title="Community lookup"
          description="When enabled, names for structures you successfully resolve via EVE can be stored so other players see labels for locations they cannot query themselves. Turn off to opt out."
        >
          <FormControlLabel
            label="Share discovered citadel names"
            labelPlacement="start"
            sx={{
              width: "100%",
              ml: 0,
              justifyContent: "space-between",
              gap: 1,
            }}
            control={
              <Switch
                checked={shareCitadelNames}
                color="primary"
                onChange={() => {
                  toggleShareCitadelNames();
                  scheduleDebouncedUserAccountDocumentSave();
                }}
              />
            }
          />
        </FirstLoginStructureFormField>
      </FirstLoginSetupSection>
    </Stack>
  );
}
