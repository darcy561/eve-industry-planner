import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const saveOpenJob = vi.fn();
const yieldLocks = vi.fn().mockResolvedValue(undefined);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  useParams: () => ({ jobID: "job-1" }),
  useSearch: () => ({}),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));
vi.mock("../../../../../../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: async () => "not-handled",
}));
vi.mock(
  "../../../../../../../Functions/Job/editing/editSessionLifetime.js",
  () => ({
    leaveEditedJobWhereItStands: vi.fn(),
  }),
);
vi.mock(
  "../../../../../../../Functions/DocumentLock/yieldEditJobDocumentLocksOnLeave.js",
  () => ({
    yieldEditJobDocumentLocksOnLeave: (...args) => yieldLocks(...args),
  }),
);
vi.mock("../../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobPersistGate: () => ({ canPersist: true }),
}));
vi.mock("../../../../../Edit Job Hooks/useJobDraft", () => ({
  useJobDraft: (select) => select({ name: "Hulk" }),
  useJobModified: () => true,
}));
vi.mock("../../../../../Edit Job Hooks/saveOpenJob", () => ({
  saveOpenJob: (...args) => saveOpenJob(...args),
}));

const { OpenChildJobButton } = await import("./openChildJobButton.jsx");

const children = [{ jobID: "child-1", name: "Megacyte" }];

async function saveFromThePrompt() {
  render(<OpenChildJobButton childJobObjects={children} jobDisplay={0} />);
  await userEvent.click(screen.getByRole("button", { name: "Open Child Job" }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

beforeEach(() => {
  navigate.mockClear();
  saveOpenJob.mockReset();
  yieldLocks.mockClear();
});

describe("opening a child job with unsaved changes", () => {
  it("saves, gives up the job's lock and opens the child", async () => {
    saveOpenJob.mockResolvedValue("closed");

    await saveFromThePrompt();

    expect(yieldLocks).toHaveBeenCalledWith({ jobID: "job-1" });
    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { jobID: "child-1" } }),
    );
  });

  it("stays on the job when the save keeps the editor open", async () => {
    saveOpenJob.mockResolvedValue("kept-open");

    await saveFromThePrompt();

    expect(navigate).not.toHaveBeenCalled();
    expect(yieldLocks).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
