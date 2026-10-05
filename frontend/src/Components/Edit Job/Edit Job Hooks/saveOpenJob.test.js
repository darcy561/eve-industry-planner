import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../Zustand/usersStore", async () => {
  const { create } = await import("zustand");
  const { default: editSessionSlice } =
    await import("../../../Zustand/editSessionSlice.js");
  return { default: create(editSessionSlice) };
});

const closeActiveJob = vi.fn().mockResolvedValue("closed");
vi.mock("../../../Functions/Job/editing/closeActiveJob", () => ({
  closeActiveJob: (...args) => closeActiveJob(...args),
}));

const openChangeReview = vi.fn();
vi.mock("../../../Events/changeReviewEvents", () => ({
  openChangeReview: (...args) => openChangeReview(...args),
}));

const { default: useUsersStore } = await import("../../../Zustand/usersStore");
const { saveOpenJob } = await import("./saveOpenJob.js");

const session = () => useUsersStore.getState().editSession.actions;

beforeEach(() => {
  closeActiveJob.mockClear();
  openChangeReview.mockClear();
  session().closeSession();
  session().openJob("job-1", { jobID: "job-1", name: "Hulk" });
  session().run({
    name: "rename",
    recipe: (job) => {
      job.name = "mine";
    },
  });
});

describe("saving the open job", () => {
  it("saves when nothing is set aside", async () => {
    await expect(saveOpenJob(null)).resolves.toBe("closed");

    expect(closeActiveJob).toHaveBeenCalledOnce();
    expect(openChangeReview).not.toHaveBeenCalled();
  });

  it("opens the review instead while an incoming save has set changes aside", async () => {
    session().documentArrived("job-1", { jobID: "job-1", name: "theirs" });

    await expect(saveOpenJob(null)).resolves.toBe("kept-open");

    expect(closeActiveJob).not.toHaveBeenCalled();
    expect(openChangeReview).toHaveBeenCalledOnce();
  });
});
