import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../tests/queryClients.js";

const getSolarSystems = vi.fn();

vi.mock("../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../tests/cachedDataMock.js");
  return cachedDataMock({
    getSolarSystems: (...args) => getSolarSystems(...args),
  });
});

const { UNKNOWN_SYSTEM_LABEL, useSolarSystemName, useSolarSystemNames } =
  await import("./useSolarSystemNames.js");

const JITA = 30000142;

function withClient() {
  const client = testQueryClient();
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSolarSystems.mockResolvedValue({ [JITA]: "Jita" });
});

describe("useSolarSystemNames", () => {
  it("reads the whole table in one entry", async () => {
    const { result } = renderHook(() => useSolarSystemNames(), {
      wrapper: withClient(),
    });

    await waitFor(() => expect(result.current[JITA]).toBe("Jita"));
    expect(getSolarSystems).toHaveBeenCalledTimes(1);
  });

  // A caller indexes the result while rendering, so it has to be an object from
  // the first frame rather than undefined until the read lands.
  it("is an empty map before the table arrives", () => {
    getSolarSystems.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSolarSystemNames(), {
      wrapper: withClient(),
    });

    expect(result.current).toEqual({});
  });
});

describe("useSolarSystemName", () => {
  it("names one system", async () => {
    const { result } = renderHook(() => useSolarSystemName(JITA), {
      wrapper: withClient(),
    });

    await waitFor(() => expect(result.current).toBe("Jita"));
  });

  // The fallback lives in the hook, so a system the table cannot name reads the
  // same wherever it is shown rather than once per call site.
  it("says a system is unknown when the table does not carry it", async () => {
    const { result } = renderHook(() => useSolarSystemName(30099999), {
      wrapper: withClient(),
    });

    await waitFor(() => expect(getSolarSystems).toHaveBeenCalled());
    expect(result.current).toBe(UNKNOWN_SYSTEM_LABEL);
  });

  it("says unknown when given no system id", () => {
    const { result } = renderHook(() => useSolarSystemName(undefined), {
      wrapper: withClient(),
    });

    expect(result.current).toBe(UNKNOWN_SYSTEM_LABEL);
  });
});
