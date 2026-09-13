import { Stack } from "@mui/material";

import { AdditionalAccounts } from "../../Accounts/AdditionalAccounts";
import { MainCharacterCard } from "../../Accounts/MainCharacterCard";
import { SHARE_CITADEL_NAMES_EXPLANATION } from "../../Accounts/citadelNames.js";
import { scheduleDebouncedUserAccountDocumentSave } from "../../../Functions/Debounce/userDocumentsPersistSchedule.js";
import useUsersStore from "../../../Zustand/usersStore";
import { SectionPanel } from "../../../Styled Components/Paper/SectionPanel";
import { SwitchField } from "../../../Styled Components/Textfield/SwitchField";

export function FirstLoginAccountsStep() {
  const shareCitadelNames = useUsersStore(
    (state) => state.account.shareCitadelNames,
  );
  const toggleShareCitadelNames = useUsersStore(
    (state) => state.account.actions.toggleShareCitadelNames,
  );

  return (
    <Stack spacing={2}>
      <SectionPanel title="Your main character">
        <MainCharacterCard />
      </SectionPanel>

      {/* Titles itself, so it is a section rather than something inside one. */}
      <AdditionalAccounts />

      <SectionPanel
        title="Citadel names"
        subtitle={SHARE_CITADEL_NAMES_EXPLANATION}
      >
        <SwitchField
          label="Share citadel names"
          checked={shareCitadelNames}
          onChange={() => {
            toggleShareCitadelNames();
            scheduleDebouncedUserAccountDocumentSave();
          }}
        />
      </SectionPanel>
    </Stack>
  );
}
