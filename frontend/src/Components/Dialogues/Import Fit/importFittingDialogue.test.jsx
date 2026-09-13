import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { snackbarSpies } from "../../../tests/snackbarHarness.js";

const { showSnackbarError } = snackbarSpies;

const {
  checkClipboardReadPermissions,
  importFromClipboard,
  finalBuildRequests,
} = vi.hoisted(() => ({
  checkClipboardReadPermissions: vi.fn(async () => true),
  importFromClipboard: vi.fn(async () => ({ importedItems: [] })),
  finalBuildRequests: vi.fn(async () => {}),
}));

vi.mock("../../../Functions/Clipboard/clipboardPermissions", () => ({
  checkClipboardReadPermissions,
}));

vi.mock("../../../Functions/JobPlanner/importFitFromClipboard", () => ({
  importFromClipboard,
  finalBuildRequests,
}));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("./importFittingItemRow", () => ({
  ImportFittingItemRow: ({ item }) => (
    <p>
      {item.itemName} x{item.itemCalculatedQty}
    </p>
  ),
}));

const { default: ImportFitDialogue } =
  await import("./importFittingDialogue.jsx");
const { showImportFitDialogue } =
  await import("../../../Events/importFitDialogueEvents");

const theme = createTheme();

/** A fit line as the clipboard parser hands it over. */
function fitLine(itemID, itemName, itemBaseQty) {
  return {
    itemID,
    itemName,
    itemBaseQty,
    itemCalculatedQty: itemBaseQty,
  };
}

function onTheClipboard(...items) {
  importFromClipboard.mockResolvedValue({ importedItems: items });
}

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <ImportFitDialogue />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function openIt() {
  await act(async () => showImportFitDialogue());
}

function press(name) {
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  checkClipboardReadPermissions.mockResolvedValue(true);
  onTheClipboard(fitLine(587, "Rifter", 1));
});

describe("importing a fit from the clipboard", () => {
  it("does not read the clipboard until it is opened", () => {
    show();

    expect(checkClipboardReadPermissions).not.toHaveBeenCalled();
    expect(screen.queryByText("Import Fit")).toBeNull();
  });

  it("reads the fit when it opens", async () => {
    show();

    await openIt();

    expect(await screen.findByText("Rifter x1")).toBeInTheDocument();
  });

  it("says so when the browser will not give up the clipboard", async () => {
    checkClipboardReadPermissions.mockResolvedValue(false);
    show();

    await openIt();

    expect(
      await screen.findByText("No Access To Clipboard"),
    ).toBeInTheDocument();
    expect(importFromClipboard).not.toHaveBeenCalled();
  });

  it("tells the reader when the clipboard cannot be read", async () => {
    importFromClipboard.mockRejectedValue(new Error("nothing to import"));
    show();

    await openIt();

    await waitFor(() =>
      expect(showSnackbarError).toHaveBeenCalledWith("nothing to import"),
    );
  });

  it("says when the clipboard holds no items", async () => {
    onTheClipboard();
    show();

    await openIt();

    expect(await screen.findByText("No Imported Items")).toBeInTheDocument();
  });

  it("multiplies the fit's quantities", async () => {
    show();
    await openIt();
    await screen.findByText("Rifter x1");

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "3" },
    });

    expect(screen.getByText("Rifter x3")).toBeInTheDocument();
  });

  it("builds the items that were imported, then closes", async () => {
    show();
    await openIt();
    await screen.findByText("Rifter x1");

    await act(async () => press("Import Items"));

    expect(finalBuildRequests).toHaveBeenCalledWith(
      [expect.objectContaining({ itemID: 587 })],
      expect.anything(),
    );
    expect(screen.queryByText("Rifter x1")).toBeNull();
  });

  // The clipboard can hold something else by the next time it is opened, so
  // each opening reads it afresh rather than showing the last fit.
  it("reads the clipboard again the next time it opens", async () => {
    show();
    await openIt();
    await screen.findByText("Rifter x1");
    press("Close");

    onTheClipboard(fitLine(588, "Punisher", 2));
    await openIt();

    expect(await screen.findByText("Punisher x2")).toBeInTheDocument();
    expect(screen.queryByText("Rifter x1")).toBeNull();
  });
});
