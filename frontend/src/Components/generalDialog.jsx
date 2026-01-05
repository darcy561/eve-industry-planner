import { useState, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { subscribeToEvent } from "../utils/EventSystem";

const initialState = {
  open: false,
  title: "",
  body: "",
  buttonText: "",
  id: "",
};

export default function GeneralDialog() {
  const [dialogData, setDialogData] = useState(initialState);

  useEffect(() => {
    const unsubscribe = subscribeToEvent("notificationDialog", (data) => {
      setDialogData((prev) => ({
        ...prev,
        ...data,
      }));
    });
    return () => unsubscribe();
  }, []);

  const handleClose = () => {
    setDialogData((prev) => ({
      ...prev,
      open: false,
    }));
  };

  if (!dialogData.open) return null;

  return (
    <Dialog key={dialogData.id} open={dialogData.open} onClose={handleClose}>
      <DialogTitle>{dialogData.title}</DialogTitle>
      <DialogContent>
        <DialogContentText color="secondary">
          {dialogData.body}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} autoFocus>
          {dialogData.buttonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
