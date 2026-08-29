import { useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  TextField,
} from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers";
import { Tooltip } from "@mui/material";
import useUsersStore from "../../../../../../Zustand/usersStore";
import DOMPurify from "dompurify";
import { useActiveJobReadOnly } from "../../../../Edit Job Hooks/useActiveJobDocumentLock";
import { lockReasonText } from "../../../../../DocumentLock/LockGatedTooltip";

/**
 * The trigger for this dialogue already gates on the active job lock, but we
 * keep a defensive guard on the Add button (mirrors how `parentJobDialogue`
 * locks its internal AddIcon rows): if the dialogue is mounted while the lock
 * flips to read-only, we still refuse to mutate the persisted job.
 */
export function AddCustomTransactionDialogue({
  state,
  actions,
  newTransactionTrigger,
  updateNewTransactionTrigger,
}) {
  const CharacterHash =
    useUsersStore.getState().account.actions.getMainCharacterHash();
  const jobLockReadOnly = useActiveJobReadOnly(state);
  const [transactionData, setTransactionData] = useState({
    order_id: null,
    journal_ref_id: null,
    unit_price: 0,
    amount: 0,
    transaction_id: createCustomTransactionID(),
    quantity: 0,
    date: new Date(),
    location_id: null,
    is_corp: false,
    type_id: state.activeJob.itemID,
    tax: 0,
    description: null,
    CharacterHash: CharacterHash,
  });

  const handleClose = () => {
    updateNewTransactionTrigger(false);
  };

  return (
    <Dialog
      open={newTransactionTrigger}
      onClose={handleClose}
      sx={{ padding: 2 }}
    >
      <DialogTitle align="center">New Transaction</DialogTitle>
      <DialogContent>
        <Grid container>
          <Grid container sx={{ paddingTop: 1 }} size={12}>
            <Grid size={6}>
              <DateTimePicker
                variant="outlined"
                value={transactionData.date}
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                }}
                onChange={(v) => {
                  setTransactionData((prev) => ({
                    ...prev,
                    date: v,
                  }));
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                variant="standard"
                helperText="Description"
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                }}
                onBlur={(v) => {
                  setTransactionData((prev) => ({
                    ...prev,
                    description: DOMPurify.sanitize(v.target.value, {
                      ALLOWED_TAGS: [],
                      ALLOWED_ATTR: [],
                    }).trim(),
                  }));
                }}
              />
            </Grid>
          </Grid>
          <Grid container sx={{ paddingTop: 2 }} size={12}>
            <Grid size={6}>
              <TextField
                variant="standard"
                helperText="Item Cost"
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                }}
                onBlur={(v) => {
                  const unitPrice = parseNonNegativeNumber(v.target.value);
                  setTransactionData((prev) => ({
                    ...prev,
                    unit_price: unitPrice,
                    amount: unitPrice * transactionData.quantity,
                  }));
                }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">ISK</InputAdornment>
                    ),
                  }
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                variant="standard"
                helperText="Quantity"
                type="number"
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                }}
                onBlur={(v) => {
                  const quantity = parseNonNegativeNumber(v.target.value);
                  setTransactionData((prev) => ({
                    ...prev,
                    quantity,
                    amount: quantity * transactionData.unit_price,
                  }));
                }}
              />
            </Grid>
          </Grid>
          <Grid container sx={{ paddingTop: 2 }} size={12}>
            <Grid size={6}>
              <TextField
                variant="standard"
                helperText="Tax Or Fees Paid"
                type="number"
                sx={{
                  "& .MuiFormHelperText-root": {
                    color: (theme) => theme.palette.secondary.main,
                  },
                  "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                }}
                onBlur={(v) => {
                  const tax = parseNonNegativeNumber(v.target.value);
                  setTransactionData((prev) => ({
                    ...prev,
                    tax,
                  }));
                }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">ISK</InputAdornment>
                    ),
                  }
                }}
              />
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ padding: 2 }}>
        <Button size="large" onClick={handleClose} sx={{ marginRight: 2 }}>
          Close
        </Button>
        <Tooltip
          title={
            jobLockReadOnly
              ? lockReasonText({ action: "manual transactions are disabled" })
              : ""
          }
          arrow
          disableHoverListener={!jobLockReadOnly}
        >
          <span>
            <Button
              size="large"
              variant="contained"
              disabled={jobLockReadOnly}
              onClick={() => {
                if (jobLockReadOnly) return;
                state.activeJob.build.sale.transactions.push(transactionData);
                actions.updateActiveJob(state.activeJob);
              }}
            >
              Add
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}

function createCustomTransactionID() {
  const timestampPart = Date.now() * 1000;
  const randomPart = Math.floor(Math.random() * 1000);
  return -(timestampPart + randomPart);
}

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
