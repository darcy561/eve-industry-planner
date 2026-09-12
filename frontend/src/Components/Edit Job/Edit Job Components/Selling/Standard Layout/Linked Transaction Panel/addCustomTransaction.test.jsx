import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { readOnly } = vi.hoisted(() => ({ readOnly: { current: false } }));

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: { actions: { getMainCharacterHash: () => "hash-main" } },
    }),
  );
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
}));

const { AddCustomTransactionDialogue } =
  await import("./addCustomTransaction.jsx");

const theme = createTheme();

function sellingJob() {
  return {
    itemID: 587,
    build: { sale: { transactions: [] } },
  };
}

const onClose = vi.fn();
const actions = { addCustomTransaction: vi.fn() };

function show(activeJob) {
  return render(
    <ThemeProvider theme={theme}>
      <AddCustomTransactionDialogue
        state={{ activeJob }}
        actions={actions}
        onClose={onClose}
      />
    </ThemeProvider>,
  );
}

function addButton() {
  return screen.getByRole("button", { name: "Add" });
}

beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
});

describe("adding a transaction by hand", () => {
  it("hands the transaction over and closes", () => {
    show(sellingJob());

    fireEvent.click(addButton());

    expect(actions.addCustomTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type_id: 587 }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("records it against the account's main character", () => {
    show(sellingJob());

    fireEvent.click(addButton());

    expect(actions.addCustomTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ CharacterHash: "hash-main" }),
    );
  });

  // Each opening mints its own id, which is what keeps two transactions added
  // one after the other from sharing one.
  it("gives each opening its own transaction id", () => {
    const { unmount } = show(sellingJob());
    fireEvent.click(addButton());
    unmount();

    show(sellingJob());
    fireEvent.click(addButton());

    const [first] = actions.addCustomTransaction.mock.calls[0];
    const [second] = actions.addCustomTransaction.mock.calls[1];
    expect(second.transaction_id).not.toBe(first.transaction_id);
  });

  it("will not add while the job is locked", () => {
    readOnly.current = true;

    show(sellingJob());

    expect(addButton()).toBeDisabled();
  });
});
