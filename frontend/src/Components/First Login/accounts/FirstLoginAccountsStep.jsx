import { Stack } from "@mui/material";

import { AdditionalAccounts } from "../../Accounts/AdditionalAccounts";
import { MainCharacterCard } from "../../Accounts/MainCharacterCard";
import { TokenStorageChoice } from "../../Accounts/TokenStorageChoice";
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
      {/* Storage mode is an account-wide choice about the characters linked below, so it is made
          here, beside the account, before any of them are added. */}
      <SectionPanel title="Your main character">
        <MainCharacterCard />
        <TokenStorageChoice />
      </SectionPanel>

      {/* Titles itself, so it is a section rather than something inside one. The main character
          has its own card above, so the roster here is the characters linked to it. */}
      <AdditionalAccounts includeMainCharacter={false} />

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
