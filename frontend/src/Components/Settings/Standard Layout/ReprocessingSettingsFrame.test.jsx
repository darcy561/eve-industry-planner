import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { store } = vi.hoisted(() => ({
  store: {
    account: {
      mainCharacterHash: "main-hash",
      characters: [
        { CharacterHash: "main-hash", CharacterName: "Main Pilot" },
        { CharacterHash: "alt-hash", CharacterName: "Alt Pilot" },
      ],
    },
    applicationSettings: {
      reprocessingSettings: { defaultReprocessingCharacter: "alt-hash" },
      actions: { setDefaultReprocessingCharacter: vi.fn() },
    },
  },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedApplicationSettingsSave: () => {},
}));

const { default: ReprocessingSettingsFrame } =
  await import("./ReprocessingSettingsFrame");

describe("the default reprocessing character setting", () => {
  it("shows the character the account chose rather than its main", () => {
    render(<ReprocessingSettingsFrame />);

    expect(screen.getByRole("combobox")).toHaveTextContent("Alt Pilot");
  });
});
