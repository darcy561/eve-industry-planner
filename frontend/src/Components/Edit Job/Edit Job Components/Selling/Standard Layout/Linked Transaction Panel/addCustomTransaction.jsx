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
import uuid from "react-uuid";
import useUsersStore from "../../../../../../Zustand/usersStore";

export function AddCustomTransactionDialog({
  state,
  actions,
  newTransactionTrigger,
  updateNewTransactionTrigger,
}) {
  const CharacterHash = useUsersStore.getState().users.actions.findParentUser().CharacterHash;
  const [transactionData, setTransactionData] = useState({
    order_id: null,
    journal_ref_id: null,
    unit_price: 0,
    amount: 0,
    transaction_id: uuid(),
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
                    description: v.target.value.replace(/[^a-zA-Z0-9 ]/g, ""),
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
                  setTransactionData((prev) => ({
                    ...prev,
                    unit_price: Number(v.target.value.replace(/[^0-9. ]/g, "")),
                    amount:
                      Number(v.target.value.replace(/[^0-9. ]/g, "")) *
                      transactionData.quantity,
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
                  if (v.target.value >= 0) {
                    setTransactionData((prev) => ({
                      ...prev,

                      quantity: Number(v.target.value.replace(/[^0-9. ]/g, "")),
                      amount:
                        Number(v.target.value.replace(/[^0-9. ]/g, "")) *
                        transactionData.unit_price,
                    }));
                  } else {
                    setTransactionData((prev) => ({
                      ...prev,
                      quantity: 0,
                      amount: 0 * transactionData.unit_price,
                    }));
                  }
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
                  if (v.target.value >= 0) {
                    setTransactionData((prev) => ({
                      ...prev,
                      tax: Number(v.target.value.replace(/[^0-9. ]/g, "")),
                    }));
                  } else {
                    setTransactionData((prev) => ({
                      ...prev,
                      tax: 0,
                    }));
                  }
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
        <Button
          size="large"
          variant="contained"
          onClick={() => {
            state.activeJob.build.sale.transactions.push(transactionData);
            actions.updateActiveJob(state.activeJob);
          }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
