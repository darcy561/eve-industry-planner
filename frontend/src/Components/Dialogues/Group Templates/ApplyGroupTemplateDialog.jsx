import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete,
  Avatar,
  Box,
  Button,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import ContentDialog, {
  useDialogEventState,
} from "../../../Styled Components/Dialog/ContentDialog";
import {
  GROUP_TEMPLATES_APPLY_DIALOG_EVENT,
  closeGroupTemplatesApplyDialog,
} from "../../../Events/groupTemplatesDialogEvents";
import {
  deleteGroupTemplate,
  fetchTemplateCatalogSummaries,
  getGroupTemplateFull,
} from "../../../Functions/Endpoints/Pirivate/groupTemplates";
import { instantiateGroupTemplate } from "../../../Functions/GroupTemplates/instantiateGroupTemplate";
import { getFullItemList } from "../../../Functions/Helper/getCachedData";
import useUsersStore from "../../../Zustand/usersStore";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../Events/snackbarEvents";
import { useNavigate } from "@tanstack/react-router";

const defaultState = () => ({
  isOpen: false,
  openSession: 0,
  contextGroupId: null,
});

/**
 * Global dialog: pick a saved group template and instantiate it into a new or existing group.
 */
export default function ApplyGroupTemplateDialog() {
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

  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fullItemList, setFullItemList] = useState(null);

  const open = Boolean(messageData.isOpen);
  const formatQty = (qty) =>
    new Intl.NumberFormat().format(Number(qty || 0));
  const getItemName = (itemID) =>
    fullItemList?.[itemID]?.name || `Type ${itemID}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchTemplateCatalogSummaries();
        if (!cancelled) setCatalog(rows);
        const itemList = await getFullItemList();
        if (!cancelled) setFullItemList(itemList || null);
      } catch (e) {
        if (!cancelled) {
          showSnackbarError(
            e instanceof Error ? e.message : "Failed to load templates",
            5
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, messageData.openSession]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setBusy(false);
    }
  }, [open]);

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

  const handleClose = useCallback(() => {
    resetDialog();
  }, [resetDialog]);

  const onApply = async () => {
    if (!selected?.templateID) {
      showSnackbarError("Select a template first.", 3);
      return;
    }
    setBusy(true);
    try {
      const mode =
        messageData.contextGroupId && resolvedActiveGroup?.groupID
          ? "activeGroup"
          : "newGroup";
      const payload = await getGroupTemplateFull(selected.templateID);
      const { jobs, group } = await instantiateGroupTemplate({
        payload,
        mode,
        queryClient,
        activeGroupOverride: mode === "activeGroup" ? resolvedActiveGroup : null,
      });
      showSnackbarSuccess(
        mode === "newGroup"
          ? `Created ${jobs.length} job(s) in a new group.`
          : `Added ${jobs.length} job(s) to the group.`,
        4
      );
      handleClose();
      if (mode === "newGroup" && group?.groupID) {
        navigate({
          to: "/group/$groupID",
          params: { groupID: group.groupID },
        });
      }
    } catch (e) {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to apply template",
        6
      );
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    try {
      await deleteGroupTemplate(selected.templateID);
      setCatalog((c) => c.filter((t) => t.templateID !== selected.templateID));
      setSelected(null);
      showSnackbarSuccess("Template deleted.", 3);
      closeGroupTemplatesApplyDialog();
    } catch (e) {
      showSnackbarError(e instanceof Error ? e.message : "Delete failed", 5);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentDialog
      open={open}
      onClose={handleClose}
      title="Apply group template"
      maxWidth="sm"
      fullWidth
      componentName="ApplyGroupTemplateDialog"
      helperArea={
        <Typography variant="body2" color="text.secondary">
          Apply a saved group template.
        </Typography>
      }
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
            <Button onClick={handleClose} disabled={busy}>
              Close
            </Button>
            <Button variant="contained" onClick={onApply} disabled={busy}>
              Apply
            </Button>
          </Box>
        </Box>
      }
    >
      <Autocomplete
        options={catalog}
        value={selected}
        onChange={(_, v) => setSelected(v)}
        getOptionLabel={(o) => o?.name || ""}
        filterOptions={(options, state) => {
          const q = state.inputValue.trim().toLowerCase();
          if (!q) return options;
          return options.filter((o) => {
            const name = (o.name || "").toLowerCase();
            const desc = (o.description || "").toLowerCase();
            const outputNames = (o.rootOutputItemIDs || [])
              .map((id) => fullItemList?.[id]?.name || "")
              .join(" ")
              .toLowerCase();
            return (
              name.includes(q) ||
              desc.includes(q) ||
              outputNames.includes(q) ||
              (o.templateID || "").toLowerCase().includes(q)
            );
          });
        }}
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
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.description?.trim()
              ? selected.description
              : "No description for this template."}
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
            Outputs
          </Typography>
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
        </Box>
      )}
    </ContentDialog>
  );
}
