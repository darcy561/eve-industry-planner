import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { store, getActiveGroupObject, fetchTemplateCatalogSummaries } =
  vi.hoisted(() => ({
    store: { current: null },
    getActiveGroupObject: vi.fn(() => null),
    fetchTemplateCatalogSummaries: vi.fn(async () => []),
  }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("../../../Functions/Endpoints/Private/groupTemplates", () => ({
  fetchTemplateCatalogSummaries,
  instantiateGroupTemplate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

vi.mock("../../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../analytics/trackAppEvent", () => ({ trackAppEvent: vi.fn() }));

const { default: ApplyGroupTemplateDialogue } =
  await import("./ApplyGroupTemplateDialogue.jsx");
const { openGroupTemplatesApplyDialogue } =
  await import("../../../Events/groupTemplatesDialogueEvents");

const theme = createTheme();

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <ApplyGroupTemplateDialogue />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store.current = {
    jobData: {
      actions: { getGroupObject: vi.fn(() => null), getActiveGroupObject },
    },
  };
});

describe("applying a saved group template", () => {
  // Until it is opened it should cost nothing: no group resolved, no catalogue
  // fetched, nothing on the page.
  it("does nothing until it is opened", () => {
    const { container } = show();

    expect(container).toBeEmptyDOMElement();
    expect(getActiveGroupObject).not.toHaveBeenCalled();
    expect(fetchTemplateCatalogSummaries).not.toHaveBeenCalled();
  });

  it("opens on the event", () => {
    show();

    act(() => openGroupTemplatesApplyDialogue());

    expect(screen.getByText("Apply group template")).toBeInTheDocument();
  });
});
