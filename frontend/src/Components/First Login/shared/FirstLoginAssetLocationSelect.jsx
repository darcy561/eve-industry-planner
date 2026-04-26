import {
  FormControl,
  FormHelperText,
  MenuItem,
  Select,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useUsersStore from "../../../Zustand/usersStore";
import {
  appShellHelperTextSx,
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "../../../Context/appShell";

/**
 * Default asset location dropdown with the same outlined look as other first-login selects.
 */
export function FirstLoginAssetLocationSelect({
  value,
  locationIds,
  onChange,
  labelText = "Default Asset Location",
}) {
  const theme = useTheme();
  return (
    <FormControl
      fullWidth
      sx={(t) => ({
        ...appShellOutlinedFormControl(t),
        "& .MuiFormHelperText-root": appShellHelperTextSx,
      })}
    >
      <Select
        variant="outlined"
        size="small"
        displayEmpty
        value={locationIds.includes(value) ? value : ""}
        onChange={(e) => {
          if (!e.target.value) return;
          onChange(e.target.value);
        }}
        MenuProps={getAppShellSelectMenuProps(theme)}
      >
        <MenuItem value="">
          <em>Select location</em>
        </MenuItem>
        {locationIds.map((entry) => {
          const locationNameData = useUsersStore
            .getState()
            .worldData.actions.findUniverseData(entry);
          if (
            !locationNameData ||
            locationNameData.name === "No Acces To Location"
          ) {
            return null;
          }
          return (
            <MenuItem key={entry} value={entry}>
              {locationNameData.name}
            </MenuItem>
          );
        })}
      </Select>
      <FormHelperText variant="standard" sx={appShellHelperTextSx}>
        {labelText}
      </FormHelperText>
    </FormControl>
  );
}
