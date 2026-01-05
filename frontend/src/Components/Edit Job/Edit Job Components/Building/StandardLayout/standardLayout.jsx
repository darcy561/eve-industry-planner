import { Grid } from "@mui/material";
import { TutorialStep3 } from "../tutorialStep3";
import { InformationPanel } from "./Information Panel/informationPanel";
import { TabPanel_Building } from "./Tab Panel/tabPanel";
import TutorialTemplate from "../../../../Tutorials/tutorialTemplate";
import JobSetupInfoFrame from "../../Purchasing/Standard Layout/JobSetupInfo/JobSetupInfoFrame";

export function Building_StandardLayout_EditJob(props) {
  return (
    <Grid container spacing={2} sx={{ width: "100%", flexGrow: 1 }}>
      <TutorialTemplate TutorialContent={<TutorialStep3 {...props} />} />

      <Grid size={12}>
        <InformationPanel {...props} />
      </Grid>
      <Grid size={12}>
        <TabPanel_Building {...props} />
      </Grid>
      <Grid size={12}>
        <JobSetupInfoFrame {...props} />
      </Grid>
    </Grid>
  );
}
