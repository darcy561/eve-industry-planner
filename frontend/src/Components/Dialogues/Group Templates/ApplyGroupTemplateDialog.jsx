import { useMemo, useState } from "react";
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Divider,
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
import ContentDialog, {
  useDialogCloseReset,
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import {
  GROUP_TEMPLATES_APPLY_DIALOG_EVENT,
  closeGroupTemplatesApplyDialog,
} from "../../../Events/groupTemplatesDialogEvents";
import {
  deleteGroupTemplate,
  getGroupTemplateFull,
} from "../../../Functions/Endpoints/Pirivate/groupTemplates";
import { instantiateGroupTemplate } from "../../../Functions/GroupTemplates/instantiateGroupTemplate";
import useUsersStore from "../../../Zustand/usersStore";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../Events/snackbarEvents";
import { useNavigate } from "@tanstack/react-router";
import {
  buildCatalogQueryOptions,
  buildFullItemListQueryOptions,
  invalidateTemplateCatalogQueries,
} from "./helpers/templateDialogQueries";
import { makeTemplateFilter } from "./helpers/templateDialogUtils";
import { appShellSetupSectionPaperSx } from "../../../Context/appShell";
import { trackAppEvent } from "../../../analytics/trackAppEvent";
import { AppEvent } from "../../../analytics/appEventNames";

const defaultState = () => ({
  isOpen: false,
  openSession: 0,
  contextGroupId: null,
});

/**
 * Global dialog: pick a saved group template and instantiate it into a new or existing group.
 */
function ApplyGroupTemplateDialogInner() {
  const [messageData, , resetDialog] = useDialogEventState(
    GROUP_TEMPLATES_APPLY_DIALOG_EVENT,
    defaultState
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const getGroupObject = useUsersStore((s) => s.jobData.actions.getGroupObject);
  const getActiveGroupObject = useUsersStore(
    (s) => s.jobData.actions.getActiveGroupObject
  );

  const [selectedBySession, setSelectedBySession] = useState({
    session: 0,
    templateID: null,
  });

  const open = Boolean(messageData.isOpen);
  const activeSession = Number(messageData.openSession || 0);
  const formatQty = (qty) =>
    new Intl.NumberFormat().format(Number(qty || 0));
  const { data: catalog = [] } = useQuery(
    buildCatalogQueryOptions(activeSession, open)
  );
  const { data: fullItemList = null } = useQuery(
    buildFullItemListQueryOptions(open)
  );
  const getItemName = (itemID) =>
    fullItemList?.[itemID]?.name || `Type ${itemID}`;
  const filterTemplates = useMemo(
    () =>
      makeTemplateFilter({
        getOutputSearchText: (o) =>
          (o.rootOutputItemIDs || [])
            .map((id) => fullItemList?.[id]?.name || "")
            .join(" "),
      }),
    [fullItemList]
  );

  const selected = useMemo(() => {
    if (selectedBySession.session !== activeSession) return null;
    return (
      catalog.find((row) => row.templateID === selectedBySession.templateID) ||
      null
    );
  }, [catalog, selectedBySession, activeSession]);

  const resolvedActiveGroup = useMemo(() => {
    if (messageData.contextGroupId) {
      return getGroupObject(messageData.contextGroupId);
    }
    return getActiveGroupObject();
  }, [
    messageData.contextGroupId,
    getGroupObject,
    getActiveGroupObject,
  ]);

  const handleCloseWithReset = useDialogCloseReset({
    resetFns: [() => setSelectedBySession({ session: activeSession, templateID: null })],
    onClose: resetDialog,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selected?.templateID) {
        throw new Error("Select a template first.");
      }
      const mode =
        messageData.contextGroupId && resolvedActiveGroup?.groupID
          ? "activeGroup"
          : "newGroup";
      const payload = await getGroupTemplateFull(selected.templateID);
      const result = await instantiateGroupTemplate({
        payload,
        mode,
        queryClient,
        activeGroupOverride: mode === "activeGroup" ? resolvedActiveGroup : null,
      });
      return { mode, ...result };
    },
    onSuccess: ({ mode, jobs, group }) => {
      trackAppEvent(AppEvent.GROUP_TEMPLATE_APPLY);
      showSnackbarSuccess(
        mode === "newGroup"
          ? `Created ${jobs.length} job(s) in a new group.`
          : `Added ${jobs.length} job(s) to the group.`,
        4
      );
      handleCloseWithReset();
      if (mode === "newGroup" && group?.groupID) {
        navigate({
          to: "/group/$groupID",
          params: { groupID: group.groupID },
        });
      }
    },
    onError: (e) => {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to apply template",
        6
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selected?.templateID) {
        throw new Error("Select a template to delete.");
      }
      await deleteGroupTemplate(selected.templateID);
    },
    onSuccess: () => {
      trackAppEvent(AppEvent.GROUP_TEMPLATE_DELETE);
      showSnackbarSuccess("Template deleted.", 3);
      invalidateTemplateCatalogQueries(queryClient);
      setSelectedBySession({ session: activeSession, templateID: null });
      closeGroupTemplatesApplyDialog();
    },
    onError: (e) => {
      showSnackbarError(e instanceof Error ? e.message : "Delete failed", 5);
    },
  });

  const busy = applyMutation.isPending || deleteMutation.isPending;

  const onApply = async () => {
    if (!selected?.templateID) return showSnackbarError("Select a template first.", 3);
    await applyMutation.mutateAsync();
  };

  const onDelete = async () => {
    if (!selected?.templateID) {
      showSnackbarError("Select a template to delete.", 3);
      return;
    }
    const ok = window.confirm(
      `Delete "${selected.name}"? This cannot be undone.`
    );
    if (!ok) return;
    await deleteMutation.mutateAsync();
  };

  return (
    <ContentDialog
      open={open}
      onClose={handleCloseWithReset}
      loadingVariant="dense"
      useAppShellDesign
      title="Apply group template"
      maxWidth="sm"
      fullWidth
      componentName="ApplyGroupTemplateDialog"
      helperArea={
        <Typography variant="body2" color="text.secondary">
          Apply a saved group template.
        </Typography>
      }
      actionLayout="split"
      actions={
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1,
            width: "100%",
            justifyContent: "space-between",
          }}
        >
          <Button color="error" onClick={onDelete} disabled={busy || !selected}>
            Delete
          </Button>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={handleCloseWithReset} disabled={busy}>
              Close
            </Button>
            <Button variant="contained" onClick={onApply} disabled={busy}>
              Apply
            </Button>
          </Box>
        </Box>
      }
    >
      <Stack spacing={2}>
        <Autocomplete
          options={catalog}
          value={selected}
          onChange={(_, v) =>
            setSelectedBySession({
              session: activeSession,
              templateID: v?.templateID || null,
            })
          }
          getOptionLabel={(o) => o?.name || ""}
          filterOptions={filterTemplates}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Template"
              placeholder="Search by name, description, output item name"
            />
          )}
          isOptionEqualToValue={(a, b) => a?.templateID === b?.templateID}
        />
        {!!selected && (
          <Paper variant="outlined" sx={appShellSetupSectionPaperSx}>
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                {selected.description?.trim()
                  ? selected.description
                  : "No description for this template."}
              </Typography>
              <Divider />
              <Typography variant="subtitle2">Outputs</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {(selected.outputsSummary || []).map((out) => {
                  const itemName = getItemName(out.itemID);
                  return (
                    <Box
                      key={`${selected.templateID}-${out.templateJobId}-${out.itemID}`}
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                    >
                      <Avatar
                        src={`https://images.evetech.net/types/${out.itemID}/icon?size=64`}
                        alt={itemName}
                        sx={{ width: 24, height: 24 }}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {itemName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        x {formatQty(out.desiredTotalQuantity)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Stack>
          </Paper>
        )}
      </Stack>
    </ContentDialog>
  );
}

export default function ApplyGroupTemplateDialog() {
  return <ApplyGroupTemplateDialogInner />;
}
