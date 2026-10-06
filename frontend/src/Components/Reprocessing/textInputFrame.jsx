import { Box, Button, TextField, Typography } from "@mui/material";
import { appShellTextFieldOutlinedSx } from "../../Context/appShell";
import {
  FigureCaption,
  FigureRow,
} from "../../Styled Components/Typography/figures";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { ChipRow } from "../../Styled Components/Chip/ChipRow";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";
import { formatNumberForLocale } from "../../Functions/Helper/numberParser";
import { AppEvent } from "../../analytics/appEventNames";
import { trackAppEvent } from "../../analytics/trackAppEvent";
import { reprocessingDirections } from "./Hooks/reprocessingReducer";
import {
  parseInputMineralString,
  parseReprocessingInput,
} from "../../Functions/Reprocessing/reprocessingInput";

const PASTE_PANELS = {
  [reprocessingDirections.toMinerals]: {
    title: "Items to reprocess",
    label: "Paste from your inventory, a contract or a list",
    placeholder: "Veldspar\t10,000\nScordite\t5,000",
    action: "Reprocess",
    read: (count) => `${count} ${count === 1 ? "item" : "items"} read`,
    leftOutChip: (count) =>
      `${count} ${count === 1 ? "line" : "lines"} not reprocessable`,
    leftOutCaption: null,
    leftOutNote: "Not ore, ice or gas: left out",
    event: AppEvent.REPROCESSING_CALCULATION_TO_MINERALS,
    countRead: (text) => parseReprocessingInput(text).items.length,
  },
  [reprocessingDirections.fromMinerals]: {
    title: "Minerals you need",
    label: "Paste a shopping list, or type one mineral a line",
    placeholder: "Tritanium\t100,000\nPyerite\t25,000",
    action: "Find ore",
    read: (count) => `${count} ${count === 1 ? "mineral" : "minerals"} read`,
    leftOutChip: null,
    leftOutCaption: "No ore yields this; buy it as it is",
    leftOutNote: null,
    event: AppEvent.REPROCESSING_CALCULATION_FROM_MINERALS,
    countRead: (text) =>
      Object.keys(parseInputMineralString(text).items).length,
  },
};

/**
 * The paste for the chosen direction, read when the reader presses its button, with what was read,
 * what no ore gives, and the lines it could not read.
 */
function TextInputFrame({ pageState, pageActions, answers }) {
  const panel = PASTE_PANELS[pageState.direction];
  const { text, committed } = pageState.pastes[pageState.direction];
  const readCount =
    pageState.direction === reprocessingDirections.toMinerals
      ? answers.itemTypeIDs.length
      : Object.keys(answers.requestedMinerals).length;

  const handleSubmit = () => {
    pageActions.commitPaste();
    const itemsRead = panel.countRead(text);
    if (itemsRead > 0) trackAppEvent(panel.event, itemsRead);
  };

  return (
    <SectionPanel
      title={panel.title}
      action={
        text ? (
          <Button size="small" onClick={() => pageActions.clearPaste()}>
            Clear
          </Button>
        ) : null
      }
    >
      <Box>
        <Typography
          component="label"
          htmlFor={`paste-${pageState.direction}`}
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 0.5 }}
        >
          {panel.label}
        </Typography>
        <TextField
          id={`paste-${pageState.direction}`}
          placeholder={panel.placeholder}
          multiline
          sx={appShellTextFieldOutlinedSx}
          fullWidth
          minRows={5}
          maxRows={12}
          value={text}
          onChange={(e) => pageActions.setPaste(e.target.value)}
        />
      </Box>
      {committed ? (
        <ChipRow>
          <StatusChip label={panel.read(readCount)} tone={STATUS_TONE.FACT} />
          {panel.leftOutChip && answers.leftOut.length > 0 ? (
            <StatusChip
              label={panel.leftOutChip(answers.leftOut.length)}
              tone={STATUS_TONE.WARN}
            />
          ) : null}
          {answers.unread.length > 0 ? (
            <StatusChip
              label={`${answers.unread.length} not read`}
              tone={STATUS_TONE.WARN}
            />
          ) : null}
        </ChipRow>
      ) : null}
      {answers.leftOut.length > 0 ? (
        <InsetSurface>
          {panel.leftOutCaption ? (
            <FigureCaption>{panel.leftOutCaption}</FigureCaption>
          ) : null}
          {answers.leftOut.map(({ id, name, quantity }, index) => (
            <FigureRow
              key={`${id}-${index}`}
              label={name}
              sublabel={panel.leftOutNote}
              value={formatNumberForLocale(quantity, { max: 0 })}
            />
          ))}
        </InsetSurface>
      ) : null}
      {answers.unread.length > 0 ? (
        <InsetSurface>
          <FigureCaption>Not read</FigureCaption>
          {answers.unread.map((line, index) => (
            <Typography
              key={`${index}-${line}`}
              variant="body2"
              color="text.secondary"
              sx={{ fontFamily: "monospace", whiteSpace: "pre" }}
            >
              {line}
            </Typography>
          ))}
        </InsetSurface>
      ) : null}
      <Button
        variant="contained"
        fullWidth
        disabled={!text.trim()}
        onClick={handleSubmit}
      >
        {panel.action}
      </Button>
    </SectionPanel>
  );
}

export default TextInputFrame;
