import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import SchemaIcon from "@mui/icons-material/Schema";
import { useSearch } from "@tanstack/react-router";
import EveImageAvatar from "../../Styled Components/Avatar/EveImageAvatar";
import { openJobLinkTreeFromEditPage } from "../../Events/jobDependencyTreeDialogueEvents";
import { editJobSearchToCarry } from "../../Functions/Groups/groupPageViewSearch";
import { CloseJobButton } from "./closeJobButton";
import { DeleteJobButton } from "./deleteJobButton";
import { SaveJobButton } from "./saveJobButton";
import JobPurposeLine from "./jobPurposeLine";
import { useJobDraft, useJobModified } from "./Edit Job Hooks/useJobDraft";

function ModifiedState() {
  const modified = useJobModified();
  return (
    <Typography
      variant="caption"
      color={modified ? "warning.main" : "text.secondary"}
      sx={{ whiteSpace: "nowrap" }}
    >
      {modified ? "● Unsaved changes" : "Saved"}
    </Typography>
  );
}

/** The open job's name, what it is for, whether it has unsaved work, and the controls that manage it. */
export default function JobHeader() {
  const search = useSearch({ from: "/editjob/$jobID" });
  const jobID = useJobDraft((job) => job.jobID);
  const name = useJobDraft((job) => job.name);
  const itemID = useJobDraft((job) => job.itemID);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: { xs: 1, sm: 2 },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          minWidth: 0,
          flex: "1 1 260px",
        }}
      >
        <EveImageAvatar
          type={itemID}
          size={40}
          variant="square"
          alt={name}
          sx={{ display: { xs: "none", sm: "flex" } }}
        />
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Typography
            component="h1"
            variant="h6"
            sx={{ lineHeight: 1.25, overflowWrap: "anywhere" }}
          >
            {name}
          </Typography>
          <JobPurposeLine />
        </Box>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: "center", flexWrap: "wrap" }}
      >
        <ModifiedState />
        <Button
          size="small"
          variant="outlined"
          startIcon={<SchemaIcon />}
          onClick={() =>
            openJobLinkTreeFromEditPage({
              jobId: jobID,
              ...editJobSearchToCarry(search),
            })
          }
        >
          Item tree
        </Button>
        <Divider orientation="vertical" flexItem />
        <DeleteJobButton />
        <Divider orientation="vertical" flexItem />
        <CloseJobButton />
        <SaveJobButton />
      </Stack>
    </Box>
  );
}
