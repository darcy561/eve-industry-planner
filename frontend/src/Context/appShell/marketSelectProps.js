import {
  appShellHelperTextSx,
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "./formControls";

/**
 * Outlined select + menu styling bundle for market/structure-style selects.
 * Spread onto market selects, structure selects, implant select, etc.
 */
export function getAppShellMarketSelectProps(theme) {
  return {
    selectVariant: "outlined",
    customFormStyling: {
      ...appShellOutlinedFormControl(theme),
    },
    customHelperTextStyling: appShellHelperTextSx,
    menuProps: getAppShellSelectMenuProps(theme),
  };
}
