import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import useUsersStore from "../../Zustand/usersStore";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { SwitchField } from "../../Styled Components/Textfield/SwitchField";
import { SHARE_CITADEL_NAMES_EXPLANATION } from "./citadelNames.js";

/**
 * Community citadel name sharing (Mongo `users.shareCitadelNames`).
 */
export function CitadelNamesCommunityPanel() {
  const shareCitadelNames = useUsersStore(
    (state) => state.account.shareCitadelNames,
  );
  const toggleShareCitadelNames = useUsersStore(
    (state) => state.account.actions.toggleShareCitadelNames,
  );

  return (
    <SectionPanel
      title="Community citadel names"
      subtitle={SHARE_CITADEL_NAMES_EXPLANATION}
      componentName="Community citadel names"
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
  );
}
