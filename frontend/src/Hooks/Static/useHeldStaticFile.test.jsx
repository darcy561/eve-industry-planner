import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import staticFile from "../../Functions/Static/staticFile";
import { useHeldStaticFile } from "./useHeldStaticFile";

describe("a static file held for a view", () => {
  it("loads the file when the view finds it missing, and redraws with it", async () => {
    const file = staticFile(async () => ({ a: 1 }));
    const { result } = renderHook(() => useHeldStaticFile(file));

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ a: 1 }));
  });

  it("loads the file again when a new build drops it", async () => {
    let build = 1;
    const file = staticFile(async () => ({ build }));
    await file.prime();
    const { result } = renderHook(() => useHeldStaticFile(file));

    build = 2;
    act(() => file.reset());

    await waitFor(() => expect(result.current).toEqual({ build: 2 }));
  });
});
