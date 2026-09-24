import { FormField } from "../../../../Styled Components/Textfield/FormField";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import { MAX_BROKER_FEE_PERCENT } from "./newMarket";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

/**
 * The broker rate for a citadel the reader has not saved as a market.
 *
 * Every saved market carries its own rate, so this answers only for the rest.
 * An NPC station never reaches it: its rate comes from the seller's skills and
 * standings, and a stored number would quote the untrained rate without saying
 * so.
 *
 * @param {object} [props]
 * @param {object} [props.fieldProps] - Styling the surrounding surface gives its
 *   controls, as the app shell's outlined form props do
 */
export default function UnsavedCitadelFee({ fieldProps = {} }) {
  const brokerFee = useUsersStore(
    (state) => state.applicationSettings.defaultCitadelBrokersFee,
  );
  const { updateCitadelBrokersFee } = useUsersStore(
    (state) => state.applicationSettings.actions,
  );

  return (
    <FormField
      title="Citadels you have not saved"
      description="What a broker fee is charged at when an order sits in a citadel that is not one of your markets. A market you save carries its own rate instead."
    >
      <TaxPercentageTextField
        {...fieldProps}
        id="unsaved-citadel-broker-fee"
        label="Unsaved citadel broker fee"
        helperText="Percent per order"
        max={MAX_BROKER_FEE_PERCENT}
        initialState={brokerFee}
        onBlur={(fee) => {
          updateCitadelBrokersFee(fee);
          scheduleDebouncedApplicationSettingsSave();
        }}
      />
    </FormField>
  );
}
