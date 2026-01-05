import { Box, TextField, Button, IconButton, Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState } from "react";
import { calculateReprocessing } from "../../Functions/Reprocessing/calculateReprocessing";

function TextInputFrame({
  pageState,
  pageActions,
}) {
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async () => {
    // Reset the modified flag when calculation starts
    pageActions.setInputModified(false);
    await calculateReprocessing({
      pageState,
      pageActions,
    });
  };

  const toggleExpand = () => {
    setExpanded((prev) => !prev);
  };

  const handleInputChange = (e) => {
    pageActions.setInputText(e.target.value);
    // Mark as modified when user changes the input
    pageActions.setInputModified(true);
  };

  return (
    <Box sx={{ width: "100%" }}>
      <TextField
        label="Paste Here"
        multiline
        fullWidth
        rows={expanded ? 18 : 6}
        value={pageState.inputText}
        onChange={handleInputChange}
        variant="outlined"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderColor: pageState.inputModified ? 'warning.main' : undefined,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: pageState.inputModified ? 'warning.main' : undefined,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: pageState.inputModified ? 'warning.main' : undefined,
            },
          },
        }}
      />
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "10px",
        }}
      >
        <Button
          variant="contained"
          onClick={handleSubmit}
          sx={{ 
            width: "50%",
            backgroundColor: pageState.inputModified ? 'warning.main' : 'primary.main',
            '&:hover': {
              backgroundColor: pageState.inputModified ? 'warning.dark' : 'primary.dark',
            },
          }}
        >
          {pageState.inputModified ? 'Calculate Changes' : 'Reprocess'}
        </Button>

        <Tooltip title="Expand input text box" arrow placement="left">
          <IconButton
            onClick={toggleExpand}
            sx={{
              color: "secondary.main",
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.3s ease-in-out",
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export default TextInputFrame;
