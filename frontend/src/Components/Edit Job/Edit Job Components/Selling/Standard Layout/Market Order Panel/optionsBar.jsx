import { Grid } from "@mui/material";

import { ArchiveJobButton } from "./archiveJobButton";

export function Step5Buttons({ setJobModified, updateEditJobTrigger }) {
  return (
    <Grid container justifyContent="flex-end">
      <ArchiveJobButton updateEditJobTrigger={updateEditJobTrigger} />
    </Grid>
  );
}
