import { describe, expect, it } from "vitest";
import { ORDER_TYPES } from "../../../Context/defaultValues";
import { orderTypeOptions } from "./orderTypeOptions";

describe("the order types offered with their totals", () => {
  const totals = Object.fromEntries(
    ORDER_TYPES.map((entry, index) => [entry.id, (index + 1) * 100]),
  );
  const current = ORDER_TYPES[1].id;

  it("offers every order type, in order, with its total", () => {
    const options = orderTypeOptions((id) => totals[id], current);

    expect(options.map((option) => option.id)).toEqual(
      ORDER_TYPES.map((entry) => entry.id),
    );
    expect(options.map((option) => option.total)).toEqual([100, 200, 300, 400]);
  });

  it("measures each from the order type in effect", () => {
    const options = orderTypeOptions((id) => totals[id], current);

    expect(options.map((option) => option.delta)).toEqual([-100, 0, 100, 200]);
    expect(options.filter((option) => option.isCurrent)).toEqual([
      expect.objectContaining({ id: current }),
    ]);
  });
});
