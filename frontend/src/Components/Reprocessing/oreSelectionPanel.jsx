import {
  Chip,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { appShellTextFieldOutlinedSx } from "../../Context/appShell";
import CancelIcon from "@mui/icons-material/Cancel";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import { ChipRow } from "../../Styled Components/Chip/ChipRow";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import { FormField } from "../../Styled Components/Textfield/FormField";
import { SwitchField } from "../../Styled Components/Textfield/SwitchField";
import { SegmentedChoice } from "../../Styled Components/Select/SegmentedChoice";
import { useItemList } from "../../Hooks/Static/useItems";
import { itemNameFrom } from "../../Functions/Static/items";
import {
  compressedOreChoices,
  shippingModes,
} from "../../Context/defaultValues";

const COMPRESSED_ORE_OPTIONS = [
  { value: compressedOreChoices.prefer, label: "Prefer" },
  { value: compressedOreChoices.allow, label: "Allow" },
  { value: compressedOreChoices.avoid, label: "Don't use" },
];

const SHIPPING_OPTIONS = [
  { value: shippingModes.perVolume, label: "Per m³" },
  { value: shippingModes.fixed, label: "Fixed amount" },
];

const SHIPPING_UNITS = {
  [shippingModes.perVolume]: "ISK / m³",
  [shippingModes.fixed]: "ISK",
};

/**
 * How From minerals chooses ore — shipping, buying outright, compressed ore, leftovers and the ores
 * never chosen — saved to the planner when there is one.
 */
export default function OreSelectionPanel({
  settings,
  isPlannerHeld,
  actions,
}) {
  const { records: itemRecords } = useItemList();

  return (
    <SectionPanel
      title="Ore selection"
      action={
        isPlannerHeld ? (
          <Typography variant="caption" color="text.secondary">
            Saved to this planner
          </Typography>
        ) : null
      }
    >
      <FormField
        title="Shipping"
        description="Per m³ is added to each ore's and mineral's price by its volume, so it can change which ore is chosen. A fixed amount is added once to whatever is delivered."
      >
        <Stack spacing={1}>
          <SegmentedChoice
            label="Shipping charged"
            options={SHIPPING_OPTIONS}
            value={settings.shipping.mode}
            onChange={(mode) =>
              actions.changeSettings({
                shipping: { ...settings.shipping, mode },
              })
            }
          />
          <TextField
            size="small"
            label={
              settings.shipping.mode === shippingModes.fixed ? "Amount" : "Rate"
            }
            type="number"
            sx={appShellTextFieldOutlinedSx}
            placeholder="0"
            value={settings.shipping.amount || ""}
            onChange={(event) => {
              const amount = Number(event.target.value);
              actions.changeSettings({
                shipping: {
                  ...settings.shipping,
                  amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
                },
              });
            }}
            slotProps={{
              htmlInput: { min: 0 },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {SHIPPING_UNITS[settings.shipping.mode]}
                  </InputAdornment>
                ),
              },
            }}
          />
        </Stack>
      </FormField>
      <FormField title="Compressed ore">
        <SegmentedChoice
          label="Compressed ore"
          options={COMPRESSED_ORE_OPTIONS}
          value={settings.compressedOre}
          onChange={(compressedOre) =>
            actions.changeSettings({ compressedOre })
          }
        />
      </FormField>
      <InsetSurface>
        <SwitchField
          label="Buy minerals outright where cheaper"
          checked={settings.buyOutright}
          onChange={(buyOutright) => actions.changeSettings({ buyOutright })}
        />
        <SwitchField
          label="Count leftovers as sold"
          checked={settings.countLeftoversAsSold}
          onChange={(countLeftoversAsSold) =>
            actions.changeSettings({ countLeftoversAsSold })
          }
        />
      </InsetSurface>
      <FormField
        title="Never choose"
        description="Rule an ore out from its row in the ore to buy."
      >
        {settings.neverChoose.length > 0 ? (
          <ChipRow label="Never choose">
            {settings.neverChoose.map((typeID) => {
              const name = itemNameFrom(typeID, itemRecords);
              return (
                <Chip
                  key={typeID}
                  label={name}
                  aria-label={`${name}, never chosen; delete to allow it again`}
                  size="small"
                  variant="outlined"
                  onDelete={() => actions.allowAgain(typeID)}
                  deleteIcon={<CancelIcon aria-label={`Allow ${name} again`} />}
                />
              );
            })}
          </ChipRow>
        ) : null}
      </FormField>
    </SectionPanel>
  );
}
