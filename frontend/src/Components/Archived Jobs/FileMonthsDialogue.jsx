import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers";
import {
  appShellSetupSectionPaperSx,
  appShellTextFieldOutlinedSx,
} from "../../Context/appShell";
import ContentDialogue from "../../Styled Components/Dialogue/ContentDialogue";
import { DialogueCloseAction } from "../../Styled Components/Dialogue/DialogueCloseAction";
import { useDialogueCloseReset } from "../../Styled Components/Dialogue/useDialogueCloseReset";
import { fileArchivedJobMonths } from "../../Functions/Endpoints/Private/archivedJobsList";
import {
  MONTH_FORMAT,
  monthKeyFromDate,
  monthKeyToDate,
} from "../Archive Statistics/calendarMonth.js";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button size="small" type="submit" variant="contained" disabled={pending}>
      Save
    </Button>
  );
}

/** The wire form of a month, or null for "work it out from the job". */
function monthValue(date) {
  return monthKeyFromDate(date) || null;
}

/** Clearing is how a filing is undone: a picker has no empty state to choose. */
function MonthField({ label, value, onChange, disabled, helperText }) {
  return (
    <Paper variant="outlined" sx={{ ...appShellSetupSectionPaperSx, p: 1.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <DatePicker
          label={label}
          views={["year", "month"]}
          openTo="month"
          format={MONTH_FORMAT}
          value={value}
          maxDate={new Date()}
          disabled={disabled}
          onChange={onChange}
          slotProps={{
            textField: {
              size: "small",
              fullWidth: true,
              helperText,
              sx: appShellTextFieldOutlinedSx,
            },
          }}
        />
        <Button
          size="small"
          onClick={() => onChange(null)}
          disabled={disabled || !value}
          sx={{ mt: 0.5 }}
        >
          Clear
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Which months a job's two sides count in.
 *
 * Costs carry no date of their own, so the month is a guess the user can
 * correct. Income ESI recorded is not: it shows locked rather than hidden, so
 * the rule is visible. A group or related set is filed as one.
 *
 * @param {Object} props
 * @param {Object|null} props.target - `{scope, id, name, costMonth, salesMonth,
 *   salesFromMarket, jobCount}`
 * @param {() => void} props.onClose
 * @param {(result: Object) => void} props.onFiled
 */
export function FileMonthsDialogue({ target, onClose, onFiled }) {
  // Opening blank would read as "no month", a different request from leaving a
  // side alone.
  const [costMonth, setCostMonth] = useState(() => monthKeyToDate(target?.costMonth));
  const [salesMonth, setSalesMonth] = useState(() =>
    monthKeyToDate(target?.salesMonth),
  );
  const close = useDialogueCloseReset({ onClose });

  const [error, fileMonths, isPending] = useActionState(async () => {
    // null asks the server to derive the month again.
    const result = await fileArchivedJobMonths(target.scope, target.id, {
      costMonth: monthValue(costMonth),
      ...(target.salesFromMarket ? {} : { salesMonth: monthValue(salesMonth) }),
    });
    if (!result) return "Could not change these months. Please try again.";
    if (result.error) return result.error;

    onFiled(result);
    close();
    return null;
  }, null);

  if (!target) return null;
  const many = target.jobCount > 1;

  return (
    <ContentDialogue
      open
      onClose={close}
      useAppShellDesign
      loadingVariant="dense"
      actionLayout="end"
      fullWidth
      maxWidth="xs"
      componentName="File Months Dialogue"
      title={
        many
          ? `Which months do these ${target.jobCount} jobs count in?`
          : `Which months does ${target.name} count in?`
      }
      helperArea={
        <Typography variant="body2" color="text.secondary">
          {many
            ? "Every job here is filed together, and sales the market recorded stay where they are."
            : "These are the months this job's figures count in today. Clear one to let the archive work it out from the job itself."}
        </Typography>
      }
      formProps={{ action: fileMonths }}
      actions={
        <>
          <DialogueCloseAction onClose={close} disabled={isPending}>
            Cancel
          </DialogueCloseAction>
          <SaveButton />
        </>
      }
    >
      <Stack spacing={2} sx={{ mt: 1 }}>
        <MonthField
          label="Costs count in"
          value={costMonth}
          onChange={setCostMonth}
        />

        <MonthField
          label="Sales count in"
          value={salesMonth}
          onChange={setSalesMonth}
          disabled={target.salesFromMarket}
          helperText={
            target.salesFromMarket
              ? "These sales came from the market, so they stay in the month the money arrived."
              : undefined
          }
        />

        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </ContentDialogue>
  );
}

export default FileMonthsDialogue;
