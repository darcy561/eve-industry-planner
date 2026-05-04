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
        subtitle="Citadel data is only available from the ESI whose character has docking access in-game.
            By agreeing to share this data, you allow other players to see the names of structures you have resolved via ESI, and you can use community provided names when available to label structures you cannot query yourself.
            All data is stored anonymously and is not linked to your account, all ESI queries are made with your character's access token locally in your browser.
            To opt out of sharing/using community data, simply turn the switch off."
      >
        <FirstLoginStructureFormField
        >
          <FormControlLabel
            label="Share Citadel Names"
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
