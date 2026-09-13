import { FormControlLabel, Stack, Switch } from "@mui/material";
import { AdditionalAccounts } from "../../Accounts/AdditionalAccounts";
import { scheduleDebouncedUserAccountDocumentSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import useUsersStore from "../../../Zustand/usersStore";
import { SectionPanel } from "../../../Styled Components/Paper/SectionPanel";
import { FormField } from "../../../Styled Components/Textfield/FormField";
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
      <SectionPanel title="Characters & linked accounts">
        <FirstLoginMainCharacterCard />
        <AdditionalAccounts appearance="firstLogin" />
      </SectionPanel>

      <SectionPanel
        title="Citadel names"
        subtitle="Citadel name data is only available from the ESI when a character has docking access to the structure in-game.
        To reduce the number of missing names in the asset lists the application is gathering name data from community submissions.
        All name data is stored anonymously and is not linked to your account, all ESI queries are made with your character's access token locally in your browser.
        To opt out of sharing/using community data, simply turn the switch off."
      >
        <FormField>
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
                onChange={() => {
                  toggleShareCitadelNames();
                  scheduleDebouncedUserAccountDocumentSave();
                }}
              />
            }
          />
        </FormField>
      </SectionPanel>
    </Stack>
  );
}
