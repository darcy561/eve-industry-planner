import {
  appShellHelperTextSx,
  appShellOutlinedFormControl,
  getAppShellSelectMenuProps,
} from "./formControls";

/** Under-select copy for price history hub (pairs with title-area world-data helper). */
export const MARKET_HUB_HISTORY_HELPER_TEXT =
  "Market hub region for this history.";

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
