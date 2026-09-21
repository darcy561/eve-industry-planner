import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

const { TutorialStep1 } = await import("./Planning/tutorialStep1.jsx");
const { TutorialStep3 } = await import("./Building/tutorialStep3.jsx");
const { TutorialStep4 } = await import("./Complete/tutorialStep4.jsx");
const { default: useUsersStore } = await import("../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

beforeEach(() => {
  session().actions.closeSession();
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    build: {},
  });
});

// Each stage's overlay names the job the reader is building, which is the whole
// of what it reads and the only thing a conversion could take away from it.
describe("the tutorial overlays", () => {
  it.each([
    ["planning", TutorialStep1],
    ["building", TutorialStep3],
    ["complete", TutorialStep4],
  ])("names the job on the %s stage", (_stage, Overlay) => {
    render(<Overlay />);

    expect(screen.getByText(/Rifter/)).toBeInTheDocument();
  });
});
