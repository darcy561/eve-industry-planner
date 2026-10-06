import { SegmentedChoice } from "../../../../../../Styled Components/Select/SegmentedChoice";

/**
 * Which pricing model the components are drawn from: linked child builds where cheaper, or every
 * material bought at market.
 *
 * @enum {string}
 */
export const PRICING_MODEL = {
  CHEAPEST: "cheapest",
  BUY_ALL: "buyAll",
};

const PRICING_MODEL_OPTIONS = [
  {
    value: PRICING_MODEL.CHEAPEST,
    label: "Build where cheaper",
    tooltip:
      "Linked child builds price their material; everything else is bought",
  },
  {
    value: PRICING_MODEL.BUY_ALL,
    label: "Buy everything",
    tooltip: "Every material priced at market, as if nothing were built",
  },
];

/**
 * The choice of pricing model, one always in force.
 *
 * @param {object} props
 * @param {string} props.value - One of PRICING_MODEL
 * @param {(value: string) => void} props.onChange
 */
export default function PricingModelToggle({ value, onChange }) {
  return (
    <SegmentedChoice
      label="How the materials are priced"
      options={PRICING_MODEL_OPTIONS}
      value={value}
      onChange={onChange}
    />
  );
}
