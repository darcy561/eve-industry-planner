import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { testQueryClient } from "../../tests/queryClients.js";
import { useStructureFieldContext } from "./useStructureFieldContext.js";
import { structureFromDocument } from "../../Functions/Custom Structures/customStructure";
import { jobTypes } from "../../Context/defaultValues";

function contextFor(structure, change = vi.fn()) {
  const client = testQueryClient();
  const { result } = renderHook(
    () =>
      useStructureFieldContext({
        structure,
        jobType: structure.jobType,
        change,
      }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { context: result.current, change };
}

describe("what the structure fields render from", () => {
  it("fixes the tax at an NPC station", () => {
    const { context } = contextFor(
      structureFromDocument({
        jobType: jobTypes.reprocessing,
        structureType: 0,
      }),
    );

    expect(context.isFixed("taxValue")).toBe(true);
  });

  it("leaves the tax free in a structure of the player's own", () => {
    const { context } = contextFor(
      structureFromDocument({
        jobType: jobTypes.reprocessing,
        structureType: 1,
      }),
    );

    expect(context.isFixed("taxValue")).toBe(false);
    expect(context.rigSize).toBe(2);
  });

  it("hands each field's change to the caller", () => {
    const { context, change } = contextFor(
      structureFromDocument({
        jobType: jobTypes.reprocessing,
        structureType: 1,
      }),
    );

    context.onTax(2.5);
    context.onImplant({ id: 3 });

    expect(change).toHaveBeenCalledWith({ tax: 2.5 });
    expect(change).toHaveBeenCalledWith({ implant: 3 });
  });

  it("gives the selects their app-shell styling", () => {
    const { context } = contextFor(
      structureFromDocument({ jobType: jobTypes.reprocessing }),
    );

    expect(context.fieldProps.selectVariant).toBe("outlined");
  });
});
