import { Stack, Switch, Typography } from "@mui/material";

import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import useUsersStore from "../../Zustand/usersStore";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import {
  CITADEL_NAMES_PRIVACY,
  CITADEL_NAMES_WHILE_NOT_SHARING,
  CITADEL_NAMES_WHILE_SHARING,
  SHARE_CITADEL_NAMES_SUMMARY,
} from "./citadelNames.js";

/**
 * Community citadel name sharing (Mongo `users.shareCitadelNames`).
 *
 * The switch sits with the title because it is the whole of the section; what a reader gets and
 * gives for it is the two lines beneath, rather than a paragraph they have to read past to find
 * the control.
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
      subtitle={SHARE_CITADEL_NAMES_SUMMARY}
      componentName="Community citadel names"
      action={
        <Switch
          checked={shareCitadelNames}
          slotProps={{ input: { "aria-label": "Share citadel names" } }}
          onChange={() => {
            toggleShareCitadelNames();
            scheduleDebouncedUserAccountDocumentSave();
          }}
        />
      }
    >
      <InsetSurface>
        <Stack spacing={0.75}>
          <Typography variant="body2" color="text.secondary">
            {CITADEL_NAMES_PRIVACY}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {shareCitadelNames
              ? CITADEL_NAMES_WHILE_SHARING
              : CITADEL_NAMES_WHILE_NOT_SHARING}
          </Typography>
        </Stack>
      </InsetSurface>
    </SectionPanel>
  );
}
