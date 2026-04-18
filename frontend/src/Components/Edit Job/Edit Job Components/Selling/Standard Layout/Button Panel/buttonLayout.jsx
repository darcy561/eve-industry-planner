import { Grid } from "@mui/material";

import { ArchiveJobButton } from "../../../Complete/Standard Layout/Button Panel/archiveJobButton";

export function Selling_ButtonPanel_EditJob(props) {
  return (
    <Grid container sx={{
      justifyContent: "flex-end"
    }}>
      <ArchiveJobButton {...props} />
    </Grid>
  );
}
        