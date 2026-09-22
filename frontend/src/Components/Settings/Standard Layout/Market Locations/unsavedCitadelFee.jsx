import { FormField } from "../../../../Styled Components/Textfield/FormField";
import TaxPercentageTextField from "../../../../Styled Components/Textfield/tax";
import { MAX_BROKER_FEE_PERCENT } from "./newMarket";
import useUsersStore from "../../../../Zustand/usersStore";
import { scheduleDebouncedApplicationSettingsSave } from "../../../../Functions/Debounce/userDocumentsPersistSchedule.js";

/**
 * The broker rate for a citadel the reader has not saved as a market.
 *
 * Every saved market carries its own rate, so this answers only for the
 * citadels that are not among them — a market order linked from somebody else's
 * structure, which the reader may never price a job against and has no reason to
 * save. Nothing can read that structure's rate from the game, and a linked order
 * still has to be charged something, so one account-wide figure stands in.
 *
 * An NPC station never reaches this: its rate is worked out from the seller's
 * Broker Relations and standings, and a stored number there would quote the
 * untrained rate without saying so.
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
