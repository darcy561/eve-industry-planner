import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MAX_BROKER_FEE_PERCENT } from "./newMarket";

const updateCitadelBrokersFee = vi.fn();
const scheduleDebouncedApplicationSettingsSave = vi.fn();
let defaultCitadelBrokersFee = 1.5;

vi.mock("../../../../Zustand/usersStore", () => ({
  default: (selector) =>
    selector({
      applicationSettings: {
        get defaultCitadelBrokersFee() {
          return defaultCitadelBrokersFee;
        },
        actions: { updateCitadelBrokersFee },
      },
    }),
}));

vi.mock(
  "../../../../Functions/Debounce/userDocumentsPersistSchedule.js",
  () => ({ scheduleDebouncedApplicationSettingsSave }),
);

const { default: UnsavedCitadelFee } = await import("./unsavedCitadelFee.jsx");

beforeEach(() => {
  vi.clearAllMocks();
  defaultCitadelBrokersFee = 1.5;
});

// Every saved market carries its own rate, so this figure answers for the
// citadels that are not among them and says so.
describe("the rate for a citadel that is not a saved market", () => {
  it("names what it answers for rather than citadels at large", () => {
    render(<UnsavedCitadelFee />);

    expect(
      screen.getByLabelText("Unsaved citadel broker fee"),
    ).toBeInTheDocument();
  });

  it("shows the rate the account has stored", () => {
    render(<UnsavedCitadelFee />);

    expect(screen.getByLabelText("Unsaved citadel broker fee")).toHaveValue(
      1.5,
    );
  });

  it("writes the rate and saves it once the reader leaves the field", async () => {
    render(<UnsavedCitadelFee />);
    const field = screen.getByLabelText("Unsaved citadel broker fee");

    await userEvent.clear(field);
    await userEvent.type(field, "2.25");
    await userEvent.tab();

    expect(updateCitadelBrokersFee).toHaveBeenCalledWith(2.25);
    expect(scheduleDebouncedApplicationSettingsSave).toHaveBeenCalled();
  });

  // The server refuses a fee above the cap, so the field refuses the keystroke
  // that would take it there rather than letting the reader find the save
  // rejected with nothing on screen explaining it.
  it("will not take a rate the server would not store", async () => {
    render(<UnsavedCitadelFee />);
    const field = screen.getByLabelText("Unsaved citadel broker fee");

    await userEvent.clear(field);
    await userEvent.type(field, `${MAX_BROKER_FEE_PERCENT}1`);
    await userEvent.tab();

    expect(field).toHaveValue(MAX_BROKER_FEE_PERCENT);
    expect(updateCitadelBrokersFee).toHaveBeenCalledWith(
      MAX_BROKER_FEE_PERCENT,
    );
  });
});
