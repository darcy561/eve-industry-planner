import {
  FormControlLabel,
  FormGroup,
  Grid,
  Switch,
  Typography,
} from "@mui/material";

import { scheduleDebouncedUserAccountDocumentSave } from "../../Functions/Debounce/userDocumentsPersistSchedule.js";
import { STANDARD_TEXT_FORMAT } from "../../Context/defaultValues";
import useUsersStore from "../../Zustand/usersStore";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";

/**
 * Community citadel name sharing (Mongo `users.shareCitadelNames`) — separate from
 * additional linked characters; lives on the Accounts page between main account
 * and Additional Accounts.
 */
export function CitadelNamesCommunityPanel() {
  const shareCitadelNames = useUsersStore(
    (state) => state.account.shareCitadelNames,
  );
  const toggleShareCitadelNames = useUsersStore(
    (state) => state.account.actions.toggleShareCitadelNames,
  );

  return (
    <ContentPanel
      title="Community Citadel Names"
      componentName="Citadel names community"
      paperSx={{ overflow: "hidden" }}
    >
      <Grid container size={12}>
        <Grid sx={{ marginTop: 1, marginBottom: 2 }} size={12}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            Citadel data is only available from the ESI whose character has docking access in-game.
            By agreeing to share this data, you allow other players to see the names of structures you have resolved via ESI, and you can use community provided names when available to label structures you cannot query yourself.
            All data is stored anonymously and is not linked to your account, all ESI queries are made with your character's access token locally in your browser.
            To opt out of sharing/using community data, simply turn the switch off.
          </Typography>
        </Grid>
        <Grid size={12}>
          <FormGroup>
            <FormControlLabel
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
              label={
                <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
                  Share Citadel Names
                </Typography>
              }
              labelPlacement="start"
            />
          </FormGroup>
        </Grid>
      </Grid>
    </ContentPanel>
  );
}
