import {
  Link,
  ListSubheader,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";

import InsetSurface from "../../../../../../Styled Components/Paper/InsetSurface";
import {
  FigureCaption,
  FigureRow,
} from "../../../../../../Styled Components/Typography/figures";
import { formatPercentage } from "../../../../../../Functions/Helper/numberParser";
import {
  SALE_LOCATION_KIND,
  getDefaultSaleStructure,
  getSaleStructures,
} from "../../../../../../Functions/MarketOrders/saleLocations";
import { BROKER_FEE_TERMS } from "../../../../../../Functions/MarketOrders/sellingRates";
import AssignUsersSelect from "../../../../../../Styled Components/Select/users";
import { readMarketSources } from "../../../../../../Hooks/Static/useMarketSources";

/**
 * Where the build is sold from, and what selling there costs.
 *
 * A station shows every subtraction, because those come from the player's own
 * character and seeing them is what makes the figure trustworthy. A citadel
 * shows one line and says Broker Relations does not apply — the absence of any
 * working is itself the information.
 *
 * @param {object} props
 * @param {import("../../../../../../Functions/MarketOrders/saleLocations").SaleLocation} props.saleLocation
 * @param {{brokerFee: import("../../../../../../Functions/MarketOrders/sellingRates").BrokerFeeWorking,
 *   salesTax: {base: number, accounting: number, rate: number}}} [props.rates]
 * @param {import("../../../../../../Functions/MarketOrders/sellerCharacter").SellerCharacter} [props.seller] -
 *   Whose skills and standings are quoted
 * @param {string} [props.priceHubName] - Named for a citadel, whose prices come
 *   from a hub rather than from itself
 * @param {boolean} [props.isLoading]
 * @param {{sellerCharacter: string|null, saleLocationID: string|null}} [props.plan] -
 *   What this job has named, as against the account's defaults
 * @param {(plan: object) => void} [props.onPlanChange] - Omit for a block that
 *   states the location rather than choosing it
 */
export default function SaleLocationRates({
  saleLocation,
  rates,
  seller,
  priceHubName,
  isLoading = false,
  plan = {},
  onPlanChange,
}) {
  if (!saleLocation) return null;

  const atStructure = saleLocation.kind === SALE_LOCATION_KIND.STRUCTURE;

  return (
    <InsetSurface>
      <FigureCaption>Selling from</FigureCaption>
      {onPlanChange ? (
        <SaleLocationSelect plan={plan} onPlanChange={onPlanChange} />
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {saleLocation.name}
        </Typography>
      )}
      {atStructure && priceHubName ? (
        <Typography variant="caption" color="text.secondary">
          Prices from {priceHubName}; the fee is this structure's own
        </Typography>
      ) : null}

      {isLoading || !rates ? (
        <PendingRates atStructure={atStructure} />
      ) : (
        <Stack sx={{ mt: 1 }}>
          {atStructure ? (
            <>
              <FigureRow
                label="Broker fee"
                sublabel="the rate this structure's owner set"
                value={formatPercentage(fraction(rates.brokerFee.rate), {
                  places: 2,
                })}
              />
              <Typography variant="caption" color="text.secondary">
                {STRUCTURE_FEE_NOTE}
              </Typography>
            </>
          ) : (
            <>
              <FigureRow
                label="Broker fee, base"
                value={formatPercentage(fraction(rates.brokerFee.base), {
                  places: 2,
                })}
              />
              {rates.brokerFee.terms.map((term) => (
                <FigureRow
                  key={term.id}
                  label={term.label}
                  sublabel={termDetail(term)}
                  value={termValue(term)}
                />
              ))}
              <FigureRow
                label="Broker fee"
                isTotal
                value={formatPercentage(fraction(rates.brokerFee.rate), {
                  places: 2,
                })}
              />
            </>
          )}

          <FigureRow
            label="Sales tax"
            sublabel={accountingDetail(rates.salesTax)}
            value={formatPercentage(fraction(rates.salesTax.rate), {
              places: 3,
            })}
          />
        </Stack>
      )}

      {onPlanChange ? (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <AssignUsersSelect
            value={plan.sellerCharacter}
            onChange={(characterHash) =>
              onPlanChange({ sellerCharacter: characterHash ?? null })
            }
            formHelperText="Sold by"
          />
          {plan.sellerCharacter || plan.saleLocationID ? (
            <Link
              component="button"
              type="button"
              underline="hover"
              variant="caption"
              sx={{ alignSelf: "flex-start" }}
              onClick={() =>
                onPlanChange({ sellerCharacter: null, saleLocationID: null })
              }
            >
              Back to the account default
            </Link>
          ) : null}
        </Stack>
      ) : null}

      {seller?.name ? (
        <Typography variant="caption" color="text.secondary">
          Quoted for {seller.name}
          {seller.isDefault
            ? " — your main, until this job or your settings name a seller."
            : ""}
        </Typography>
      ) : null}
    </InsetSurface>
  );
}

/**
 * What a term took off, and what it took it off for.
 *
 * A standing of zero is worth stating rather than hiding: it is the difference
 * between a reduction the player has not earned and one the app failed to read.
 *
 * @param {import("../../../../../../Functions/MarketOrders/sellingRates").FeeTerm} term
 */
function termDetail(term) {
  // Before the kind of term, because every kind has the same trap: reporting a
  // figure that could not be read as untrained, or as no standing, states
  // something about the seller the app does not know. The fee below is quoted
  // without the figure either way, so what it cannot do is claim a zero.
  if (term.unknown) return "could not be read";

  if (term.id === "brokerRelations") {
    return term.level > 0 ? `level ${term.level}` : "untrained";
  }

  // Named, because a standing of nothing is the same sentence whichever empire
  // owns the station — and without knowing which one was asked about, a right
  // answer and a lookup pointed at the wrong entity read identically.
  //
  // A standing of zero is stated as 0.00 rather than as an absence: it was read,
  // and it is the answer. Only a figure that could not be read says so.
  return `${term.level.toFixed(2)} with ${term.entityName ?? "them"}`;
}

/**
 * The Accounting behind the tax rate, and the base it came off.
 *
 * A level of zero is stated as the zero it read, the same way a standing is: the
 * rate below is the untrained one either way, and what a reader needs to know is
 * whether the app established that or failed to.
 *
 * @param {{accounting: number, base: number, unknown?: boolean}} salesTax
 * @returns {string}
 */
function accountingDetail(salesTax) {
  if (salesTax.unknown) return "Accounting could not be read";

  const base = formatPercentage(fraction(salesTax.base), { places: 2 });
  return `Accounting ${salesTax.accounting}, from a base of ${base}`;
}

/**
 * What a term took off the base, or nothing where the figure is not known.
 *
 * A term that was read and took nothing off still shows its zero: the row is
 * reporting a figure, and an empty cell beside a named entity reads as a gap in
 * the working rather than as the answer.
 *
 * @param {import("../../../../../../Functions/MarketOrders/sellingRates").FeeTerm} term
 * @returns {string|null}
 */
function termValue(term) {
  if (term.unknown) return null;

  const size = formatPercentage(fraction(Math.abs(term.amount)), { places: 2 });

  if (term.amount === 0) return size;

  // A standing below zero raises the fee, so the sign has to follow the figure
  // rather than always being taken off.
  return term.amount > 0 ? `−${size}` : `+${size}`;
}

/**
 * The rates are percentages; `formatPercentage` takes a fraction. Every line in
 * the fee block is written to the same two places, because they are read down a
 * column and a ragged one reads as figures of different kinds.
 */
const fraction = (percentage) => percentage / 100;

/**
 * Where the job sells from.
 *
 * The two kinds of location are not interchangeable and the list says so: a
 * citadel charges the rate its owner set, and an NPC station charges one derived
 * from the seller's own skill and standings. A flat list of names hides the one
 * thing that decides how the fee beneath it was worked out.
 *
 * The account's default is the menu item it actually resolves to, marked, rather
 * than a separate entry — as a separate entry the same location appeared twice,
 * and choosing it from the list pinned the job to a location it was already
 * using. Choosing the marked item writes nothing, so the job keeps following the
 * default if the default later changes.
 *
 * @param {object} props
 * @param {{saleLocationID: string|null}} props.plan
 * @param {(plan: object) => void} props.onPlanChange
 */
function SaleLocationSelect({ plan, onPlanChange }) {
  const defaultID = getDefaultSaleStructure()?.id ?? null;
  const groups = saleLocationGroups();

  return (
    <Select
      variant="standard"
      size="small"
      fullWidth
      value={plan.saleLocationID ?? defaultID ?? ""}
      inputProps={{ "aria-label": "Where this job sells from" }}
      onChange={(event) => {
        const chosen = event.target.value;
        onPlanChange({ saleLocationID: chosen === defaultID ? null : chosen });
      }}
    >
      {groups.flatMap((group) => [
        <ListSubheader key={group.label}>{group.label}</ListSubheader>,
        ...group.options.map((option) => (
          <MenuItem key={option.id} value={option.id}>
            {option.name}
            {option.id === defaultID ? (
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ ml: 1 }}
              >
                account default
              </Typography>
            ) : null}
          </MenuItem>
        )),
      ])}
    </Select>
  );
}

/**
 * The locations a job can sell from, split by what decides their broker fee.
 *
 * @returns {Array<{label: string, options: Array<{id: string, name: string}>}>}
 */
function saleLocationGroups() {
  return [
    {
      label: "Citadels",
      options: getSaleStructures().map(({ id, name }) => ({ id, name })),
    },
    {
      label: "NPC stations",
      options: readMarketSources().map(({ id, name }) => ({
        id,
        name,
      })),
    },
  ].filter((group) => group.options.length > 0);
}

/**
 * Said wherever a citadel's fee is shown, settled or not: the absence of any
 * working is itself the information, so it is the same sentence both times.
 */
const STRUCTURE_FEE_NOTE =
  "Broker Relations does not reduce a structure's fee, and there is no standing to hold with its owner.";

/**
 * The rates block before its figures have arrived.
 *
 * Drawn as the rows it is about to become rather than as two loose lines, so
 * the box keeps its height while a new location is worked out. A shorter
 * placeholder made changing the sale location shift every panel beneath it
 * twice — once into the placeholder and once back out.
 *
 * The labels are not guesses. Which subtractions a fee has is decided by the
 * kind of place it is sold from, and that is known the moment the location is
 * chosen; only the figures are pending.
 *
 * @param {object} props
 * @param {boolean} props.atStructure
 */
function PendingRates({ atStructure }) {
  const pending = <Skeleton width={52} />;
  // Every settled term states what it was worked out from underneath it, and so
  // does the tax. Reserving that second line is the point of this block: four
  // rows a line short is still a box that grows when the figures land.
  const pendingDetail = <Skeleton width={110} />;

  return (
    <Stack sx={{ mt: 1 }} aria-busy="true">
      {atStructure ? (
        <>
          <FigureRow
            label="Broker fee"
            sublabel="the rate this structure's owner set"
            value={pending}
          />
          <Typography variant="caption" color="text.secondary">
            {STRUCTURE_FEE_NOTE}
          </Typography>
        </>
      ) : (
        <>
          <FigureRow label="Broker fee, base" value={pending} />
          {Object.values(BROKER_FEE_TERMS).map((term) => (
            <FigureRow
              key={term.id}
              label={term.label}
              sublabel={pendingDetail}
              value={pending}
            />
          ))}
          <FigureRow label="Broker fee" isTotal value={pending} />
        </>
      )}
      <FigureRow label="Sales tax" sublabel={pendingDetail} value={pending} />
    </Stack>
  );
}
