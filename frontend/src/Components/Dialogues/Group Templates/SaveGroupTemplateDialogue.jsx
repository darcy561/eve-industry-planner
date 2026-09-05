import { useMemo, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  useMutation,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import ContentDialogue, {
  useDialogueCloseReset,
  useDialogueEventState,
} from "../../../Styled Components/Dialogue/ContentDialogue";
import {
  deleteGroupTemplate,
  patchGroupTemplate,
  postGroupTemplate,
} from "../../../Functions/Endpoints/Private/groupTemplates";
import { serialiseGroupToTemplatePayload } from "../../../Functions/GroupTemplates/serialiseGroupToTemplatePayload";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../Events/snackbarEvents";
import useUsersStore from "../../../Zustand/usersStore";
import {
  buildCatalogQueryOptions,
  invalidateTemplateCatalogQueries,
} from "./helpers/templateDialogueQueries";
import {
  makeTemplateFilter,
  sanitizeTemplateText,
} from "./helpers/templateDialogueUtils";
import { appShellSetupSectionPaperSx } from "../../../Context/appShell";
import {
  GROUP_TEMPLATES_SAVE_DIALOGUE_EVENT,
} from "../../../Events/groupTemplatesDialogueEvents";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import { AppEvent } from "../../../analytics/appEventNames";

const defaultState = () => ({
  isOpen: false,
  openSession: 0,
  contextGroupId: null,
});

/** Save the current group's jobs as an account-scoped template (event-driven global dialogue). */
function SaveGroupTemplateDialogueInner() {
  const [messageData, , resetDialogue] = useDialogueEventState(
    GROUP_TEMPLATES_SAVE_DIALOGUE_EVENT,
    defaultState
  );
  const queryClient = useQueryClient();
  const groupArray = useUsersStore((s) => s.jobData.groupArray);
  const jobArray = useUsersStore((s) => s.jobData.jobArray);
  const getGroupObject = useUsersStore((s) => s.jobData.actions.getGroupObject);
  const getActiveGroupObject = useUsersStore(
    (s) => s.jobData.actions.getActiveGroupObject
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const open = Boolean(messageData.isOpen);
  const activeSession = Number(messageData.openSession || 0);
  const resolvedGroup = useMemo(() => {
    if (messageData.contextGroupId) {
      return getGroupObject(messageData.contextGroupId);
    }
    return getActiveGroupObject();
  }, [messageData.contextGroupId, getGroupObject, getActiveGroupObject, groupArray]);
  const groupID = resolvedGroup?.groupID ?? "";
  const groupJobs = useMemo(() => {
    if (!resolvedGroup?.includedJobIDs) return [];
    return jobArray.filter((job) => resolvedGroup.includedJobIDs.has(job.jobID));
  }, [resolvedGroup, jobArray]);
  const { data: catalog = [] } = useQuery(
    buildCatalogQueryOptions(activeSession, open)
  );

  const normalizedName = useMemo(
    () => name.trim() || "Untitled template",
    [name]
  );

  const buildSerializedBody = () =>
    serialiseGroupToTemplatePayload({
      groupID,
      jobs: groupJobs,
      name: sanitizeTemplateText(normalizedName) || "Untitled template",
      description: sanitizeTemplateText(description),
    });

  const filterTemplates = useMemo(
    () =>
      makeTemplateFilter({
        getOutputSearchText: (o) => (o.rootOutputItemIDs || []).join(" "),
      }),
    []
  );

  const handleClose = useDialogueCloseReset({
    resetFns: [() => setName(""), () => setDescription(""), () => setSelectedTemplate(null)],
    onClose: resetDialogue,
  });

  const saveNewMutation = useMutation({
    mutationFn: async () => {
      const body = buildSerializedBody();
      await postGroupTemplate(body);
    },
    onSuccess: () => {
      trackAppEvent(AppEvent.GROUP_TEMPLATE_ADD);
      showSnackbarSuccess("Template saved.", 3);
      invalidateTemplateCatalogQueries(queryClient);
      handleClose();
    },
    onError: (e) => {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to save template",
        6
      );
    },
  });

  const replaceMutation = useMutation({
    mutationFn: async () => {
      const body = buildSerializedBody();
      await patchGroupTemplate(selectedTemplate.templateID, {
        name: body.name,
        description: body.description,
        payload: body.payload,
      });
    },
    onSuccess: () => {
      trackAppEvent(AppEvent.GROUP_TEMPLATE_REPLACE);
      showSnackbarSuccess("Template replaced.", 3);
      invalidateTemplateCatalogQueries(queryClient);
      handleClose();
    },
    onError: (e) => {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to replace template",
        6
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteGroupTemplate(selectedTemplate.templateID);
    },
    onSuccess: () => {
      trackAppEvent(AppEvent.GROUP_TEMPLATE_DELETE);
      showSnackbarSuccess("Template deleted.", 3);
      invalidateTemplateCatalogQueries(queryClient);
      setSelectedTemplate(null);
      setName("");
      setDescription("");
    },
    onError: (e) => {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to delete template",
        6
      );
    },
  });

  const busy =
    saveNewMutation.isPending || replaceMutation.isPending || deleteMutation.isPending;

  const onSaveNew = async () => {
    if (!groupJobs?.length) {
      showSnackbarError("This group has no jobs to save.", 4);
      return;
    }
    await saveNewMutation.mutateAsync();
  };

  const onReplace = async () => {
    if (!selectedTemplate?.templateID) {
      showSnackbarError("Select an existing template to replace.", 4);
      return;
    }
    if (!groupJobs?.length) {
      showSnackbarError("This group has no jobs to save.", 4);
      return;
    }
    const ok = window.confirm(
      `Replace "${selectedTemplate.name}" with this group's current jobs and setups?`
    );
    if (!ok) return;

    await replaceMutation.mutateAsync();
  };

  const onDelete = async () => {
    if (!selectedTemplate?.templateID) {
      showSnackbarError("Select an existing template to delete.", 4);
      return;
    }
    const ok = window.confirm(
      `Delete "${selectedTemplate.name}"? This cannot be undone.`
    );
    if (!ok) return;
    await deleteMutation.mutateAsync();
  };

  return (
    <SaveGroupTemplateDialogueFrame
      open={open}
      onClose={handleClose}
      busy={busy}
      selectedTemplate={selectedTemplate}
      onDelete={onDelete}
      onReplace={onReplace}
      onSaveNew={onSaveNew}
    >
      <Stack spacing={2}>
        <Paper variant="outlined" sx={appShellSetupSectionPaperSx}>
          <Stack spacing={1.5}>
            <Typography variant="subtitle2">Existing templates</Typography>
            <Autocomplete
              options={catalog}
              value={selectedTemplate}
              onChange={(_, v) => {
                setSelectedTemplate(v);
                setName(v?.name || "");
                setDescription(v?.description || "");
              }}
              getOptionLabel={(o) => o?.name || o?.templateID || ""}
              filterOptions={filterTemplates}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select existing template"
                  placeholder="Search by name, description, output item name"
                />
              )}
              isOptionEqualToValue={(a, b) => a?.templateID === b?.templateID}
            />
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={appShellSetupSectionPaperSx}>
          <Stack spacing={1.5}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </Paper>

        <Typography variant="caption" color="text.secondary">
          Use "Save as new" to create a new template. Select an existing template, then
          use "Replace existing" to overwrite its contents or "Delete existing" to
          remove it completely.
        </Typography>
      </Stack>
    </SaveGroupTemplateDialogueFrame>
  );
}

function SaveGroupTemplateDialogueFrame({
  open,
  onClose,
  busy,
  selectedTemplate,
  onDelete,
  onReplace,
  onSaveNew,
  children,
}) {
  return (
    <ContentDialogue
      open={open}
      onClose={onClose}
      loadingVariant="dense"
      useAppShellDesign
      title="Save group as template"
      maxWidth="sm"
      fullWidth
      componentName="SaveGroupTemplateDialogue"
      actionLayout="split"
      actions={
        <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button color="error" onClick={onDelete} disabled={busy || !selectedTemplate}>
              Delete existing
            </Button>
            <Button onClick={onReplace} disabled={busy || !selectedTemplate}>
              Replace existing
            </Button>
          </Box>
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" onClick={onSaveNew} disabled={busy}>
              Save as new
            </Button>
          </Box>
        </Box>
      }
    >
      {children}
    </ContentDialogue>
  );
}

export default function SaveGroupTemplateDialogue() {
  return <SaveGroupTemplateDialogueInner />;
}
