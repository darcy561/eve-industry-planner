import { Purchasing_StandardLayout_EditJob } from "./Standard Layout/standardLayout";

/**
 * Purchasing shell. Market hub controls use `MarketLocationSelectApplicationSettings` /
 * `MarketListingSelectApplicationSettings` (override + live `applicationSettings` defaults).
 */
export function LayoutSelector_EditJob_Purchasing(props) {
  return <Purchasing_StandardLayout_EditJob {...props} />;
}
