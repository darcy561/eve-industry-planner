import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { readOnly } = vi.hoisted(() => ({ readOnly: { current: false } }));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: { actions: { getMainCharacterHash: () => "hash-main" } },
  });
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

const { AddCustomTransactionDialogue } =
  await import("./addCustomTransaction.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { draftFor } =
  await import("../../../../Edit Job Hooks/jobDraftStore.js");

const theme = createTheme();

const session = () => useUsersStore.getState().editSession;

const onClose = vi.fn();

/** The sales the job carries after what the reader did. */
const sales = () =>
  Object.values(draftFor(session().draft, "job-1").esi.transactions);
const addedSale = () => sales()[0];

function sellingJob() {
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemID: 587,
    build: {},
    esi: { transactions: {} },
  });
}

function show() {
  return render(
    <ThemeProvider theme={theme}>
      <AddCustomTransactionDialogue onClose={onClose} />
    </ThemeProvider>,
  );
}

function addButton() {
  return screen.getByRole("button", { name: "Add" });
}

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  session().actions.closeSession();
  sellingJob();
});

describe("adding a transaction by hand", () => {
  it("hands the transaction over and closes", () => {
    show();

    fireEvent.click(addButton());

    expect(addedSale()).toMatchObject({ type_id: 587 });
    expect(onClose).toHaveBeenCalled();
  });

  it("records it against the account's main character", () => {
    show();

    fireEvent.click(addButton());

    expect(addedSale()).toMatchObject({ CharacterHash: "hash-main" });
  });

  // Each opening mints its own id, which is what keeps two transactions added
  // one after the other from sharing one.
  it("gives each opening its own transaction id", () => {
    const { unmount } = show();
    fireEvent.click(addButton());
    unmount();

    show();
    fireEvent.click(addButton());

    const [first, second] = sales();
    expect(second.transaction_id).not.toBe(first.transaction_id);
  });

  it("will not add while the job is locked", () => {
    readOnly.current = true;

    show();

    expect(addButton()).toBeDisabled();
  });
});
