import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Button, TextField, Typography } from "@mui/material";
import DOMPurify from "dompurify";
import ContentDialog from "../../../Styled Components/Dialog/ContentDialog";
import {
  deleteGroupTemplate,
  fetchTemplateCatalogSummaries,
  patchGroupTemplate,
  postGroupTemplate,
} from "../../../Functions/Endpoints/Pirivate/groupTemplates";
import { serializeGroupToTemplatePayload } from "../../../Functions/GroupTemplates/serializeGroupToTemplatePayload";
import {
  showSnackbarError,
  showSnackbarSuccess,
} from "../../../Events/snackbarEvents";

/**
 * Save the current group’s jobs as an account-scoped template.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.groupID
 * @param {import("../../../Classes/job").default[]} props.groupJobs
 */
export default function SaveGroupTemplateDialog({
  open,
  onClose,
  groupID,
  groupJobs,
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setBusy(false);
      setSelectedTemplate(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const templates = await fetchTemplateCatalogSummaries();
        if (!cancelled) setCatalog(templates);
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
  }, [open]);

  const normalizedName = useMemo(
    () => name.trim() || "Untitled template",
    [name]
  );

  const sanitizeText = (value) =>
    DOMPurify.sanitize(String(value ?? ""), {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim();

  const buildSerializedBody = () =>
    serializeGroupToTemplatePayload({
      groupID,
      jobs: groupJobs,
      name: sanitizeText(normalizedName) || "Untitled template",
      description: sanitizeText(description),
    });

  const onSaveNew = async () => {
    if (!groupJobs?.length) {
      showSnackbarError("This group has no jobs to save.", 4);
      return;
    }
    setBusy(true);
    try {
      const body = buildSerializedBody();
      await postGroupTemplate(body);
      showSnackbarSuccess("Template saved.", 3);
      onClose();
    } catch (e) {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to save template",
        6
      );
    } finally {
      setBusy(false);
    }
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

    setBusy(true);
    try {
      const body = buildSerializedBody();
      await patchGroupTemplate(selectedTemplate.templateID, {
        name: body.name,
        description: body.description,
        payload: body.payload,
      });
      showSnackbarSuccess("Template replaced.", 3);
      onClose();
    } catch (e) {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to replace template",
        6
      );
    } finally {
      setBusy(false);
    }
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
    setBusy(true);
    try {
      await deleteGroupTemplate(selectedTemplate.templateID);
      setCatalog((prev) =>
        prev.filter((t) => t.templateID !== selectedTemplate.templateID)
      );
      setSelectedTemplate(null);
      showSnackbarSuccess("Template deleted.", 3);
    } catch (e) {
      showSnackbarError(
        e instanceof Error ? e.message : "Failed to delete template",
        6
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentDialog
      open={open}
      onClose={onClose}
      title="Save group as template"
      maxWidth="sm"
      fullWidth
      componentName="SaveGroupTemplateDialog"
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
      <Typography variant="subtitle2" sx={{ mt: 0.5 }}>
        Existing templates
      </Typography>
      <Autocomplete
        options={catalog}
        value={selectedTemplate}
        onChange={(_, v) => {
          setSelectedTemplate(v);
          setName(v?.name || "");
          setDescription(v?.description || "");
        }}
        getOptionLabel={(o) => o?.name || o?.templateID || ""}
        filterOptions={(options, state) => {
          const q = state.inputValue.trim().toLowerCase();
          if (!q) return options;
          return options.filter((o) => {
            const nameText = (o.name || "").toLowerCase();
            const desc = (o.description || "").toLowerCase();
            const ids = (o.rootOutputItemIDs || []).join(" ");
            return (
              nameText.includes(q) ||
              desc.includes(q) ||
              ids.includes(q) ||
              (o.templateID || "").toLowerCase().includes(q)
            );
          });
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select existing template"
            placeholder="Search by name, description, output item name"
            margin="normal"
          />
        )}
        isOptionEqualToValue={(a, b) => a?.templateID === b?.templateID}
      />
      <TextField
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        fullWidth
        margin="normal"
        autoFocus
      />
      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        margin="normal"
        multiline
        minRows={2}
      />
      <Typography variant="caption" color="text.secondary">
        Use "Save as new" to create a new template. Select an existing template, then use
        "Replace existing" to overwrite its contents or "Delete existing" to remove it completely.
      </Typography>
    </ContentDialog>
  );
}
