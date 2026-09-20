import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import SkillsWhatIf from "./skillsWhatIf";
import { SALE_LOCATION_KIND } from "../../../../../../Functions/MarketOrders/saleLocations";
import { marketSkillIDs } from "../../../../../../Context/defaultValues";

const brokerFee = {
  kind: SALE_LOCATION_KIND.NPC_STATION,
  base: 3,
  rate: 2.4,
  terms: [
    { id: "brokerRelations", label: "Broker Relations", amount: 0.6, level: 2 },
    { id: "faction", label: "Faction standing", amount: 0, level: 0 },
    { id: "corporation", label: "Corporation standing", amount: 0, level: 0 },
  ],
};

const salesTax = { base: 7.5, accounting: 0, rate: 7.5 };

const renderBlock = (proposed = {}, props = {}) =>
  render(
    <SkillsWhatIf
      brokerFee={brokerFee}
      salesTax={salesTax}
      listedValue={1_000_000}
      quantity={100}
      proposed={proposed}
      {...props}
    />,
  );

describe("what selling costs", () => {
  it("states the rates the player's own levels give", () => {
    renderBlock();

    expect(screen.getByText("2.40%")).toBeInTheDocument();
    expect(screen.getByText("7.500%")).toBeInTheDocument();
  });

  it("says nothing about a saving while nothing is being tried", () => {
    renderBlock();

    expect(screen.queryByText(/Worth /)).not.toBeInTheDocument();
  });
});

// The delta is the answer, and reading it off two panels is not an answer — so
// the figure being replaced stays on screen beside the one replacing it.
describe("a level being tried", () => {
  const higher = { [marketSkillIDs.brokerRelations]: 5 };

  it("keeps the superseded rate struck through beside the new one", () => {
    renderBlock(higher);

    expect(screen.getByText("2.40%")).toBeInTheDocument();
    expect(screen.getByText("1.50%")).toBeInTheDocument();
  });

  it("states what the level would be worth on this build", () => {
    renderBlock(higher);

    // 2.4% to 1.5% of a million.
    expect(
      screen.getByText(/Worth 9,000.00 on each build/),
    ).toBeInTheDocument();
  });

  it("states what it moves break-even by", () => {
    renderBlock(higher);

    expect(
      screen.getByText(/moves break-even 90.00 a unit/),
    ).toBeInTheDocument();
  });

  // Accounting takes a share of the base rather than subtracting from it.
  it("reduces sales tax multiplicatively", () => {
    renderBlock({ [marketSkillIDs.accounting]: 5 });

    expect(screen.getByText("3.375%")).toBeInTheDocument();
  });
});

// A structure's fee is its owner's, so no level changes it and the block must
// not quote a saving that training could never deliver.
describe("at a structure", () => {
  const owned = {
    kind: SALE_LOCATION_KIND.CITADEL,
    base: null,
    rate: 1.5,
    terms: [],
  };

  it("says Broker Relations does not apply", () => {
    renderBlock({ [marketSkillIDs.brokerRelations]: 5 }, { brokerFee: owned });

    expect(screen.getByText(/not applied here/)).toBeInTheDocument();
  });

  it("offers no saving from raising it", () => {
    renderBlock({ [marketSkillIDs.brokerRelations]: 5 }, { brokerFee: owned });

    expect(screen.queryByText(/Worth /)).not.toBeInTheDocument();
  });
});

it("draws nothing without rates to work from", () => {
  const { container } = renderBlock({}, { brokerFee: null });

  expect(container).toBeEmptyDOMElement();
});
