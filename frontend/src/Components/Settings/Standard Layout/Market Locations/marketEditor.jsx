import { useState } from "react";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import { Button, Stack, TextField } from "@mui/material";

import { FormField } from "../../../../Styled Components/Textfield/FormField";
import { SwitchField } from "../../../../Styled Components/Textfield/SwitchField";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import InsetSurface from "../../../../Styled Components/Paper/InsetSurface";
import { SOURCE_KIND } from "../../../../Functions/MarketData/marketSources";
import { MAX_BROKER_FEE_PERCENT } from "./newMarket";
import { marketEdits } from "./marketWriter";

/**
 * Changing one market.
 *
 * What it does not offer is the place: a market somewhere else is a different
 * market, and the prices held for it, the character that reads it and its turn
 * on the refresh rotation all hang off this one's id.
 *
 * The same controls whoever saved the market. Which document an edit lands on is
 * `marketWriter`'s to decide, so a row an organisation shared is edited the way
 * the reader's own is — with one control more, for whether the organisation
 * offers it to its members.
 *
 * Where a job is priced is not among them: that is the account's own buying and
 * selling choice, made once at the top of this tab rather than per market.
 *
 * @param {object} props
 * @param {object} props.row - The market as the table drew it
 */
export default function MarketEditor({ row }) {
  const edits = marketEdits(row.sharedBy);

  return (
    <InsetSurface sx={{ m: 1 }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <FormField
            title="Name"
            description="What this market is called in your job setups."
          >
            <MarketName
              row={row}
              onRename={(name) => edits.update(row.id, { name })}
            />
          </FormField>
          {row.kind === SOURCE_KIND.CITADEL ? (
            <FormField
              title="Broker fee"
              description="The rate this citadel's owner set, which nothing can read from the game."
            >
              <TaxPercentageTextField
                id={`broker-fee-${row.id}`}
                label="Broker fee"
                helperText="Percent per order"
                max={MAX_BROKER_FEE_PERCENT}
                initialState={row.brokerFee}
                onBlur={(brokerFee) => edits.update(row.id, { brokerFee })}
              />
            </FormField>
          ) : null}
        </Stack>

        {row.sharedBy ? (
          // Adding a market and giving it to everybody are two acts, so the
          // second is asked for rather than assumed: a market is internal to
          // the organisation until this is on.
          <SwitchField
            label="Share this market with everyone in the organisation"
            checked={Boolean(row.sharedWithMembers)}
            onChange={(shared) =>
              edits.update(row.id, { sharedWithMembers: shared })
            }
          />
        ) : null}

        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlinedIcon fontSize="small" />}
            onClick={() => edits.remove(row.id)}
          >
            Remove market
          </Button>
        </Stack>
      </Stack>
    </InsetSurface>
  );
}

/**
 * The name, committed when the reader leaves the field.
 *
 * Held here while they type rather than written on each keystroke: every change
 * to the settings document schedules a save, and a name typed a letter at a
 * time would schedule one per letter.
 */
function MarketName({ row, onRename }) {
  const [typed, setTyped] = useState(row.name);

  return (
    <TextField
      id={`market-name-${row.id}`}
      size="small"
      variant="standard"
      label="Market name"
      value={typed}
      onChange={(event) => setTyped(event.target.value)}
      onBlur={() => {
        const name = typed.trim();
        // An empty name would leave the row unidentifiable in every picker it
        // appears in, so the field goes back to what it held.
        if (!name) return setTyped(row.name);
        if (name !== row.name) onRename(name);
      }}
    />
  );
}
