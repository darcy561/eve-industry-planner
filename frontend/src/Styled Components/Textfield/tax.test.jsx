import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TaxPercentageTextField from "./tax";

function field() {
  return screen.getByRole("spinbutton");
}

function show(props = {}) {
  return render(
    <TaxPercentageTextField initialState={5} onBlur={() => {}} {...props} />,
  );
}

describe("the tax percentage field", () => {
  it("opens on the figure it was given", () => {
    show({ initialState: 7.5 });

    expect(field()).toHaveValue(7.5);
  });

  it("takes what is typed into it", () => {
    show();

    fireEvent.change(field(), { target: { value: "3.25" } });

    expect(field()).toHaveValue(3.25);
  });

  it("refuses a figure below zero", () => {
    show({ initialState: 5 });

    fireEvent.change(field(), { target: { value: "-2" } });

    expect(field()).toHaveValue(5);
  });

  it("hands back a rounded figure when it is left", () => {
    const onBlur = vi.fn();
    show({ onBlur });

    fireEvent.change(field(), { target: { value: "3.256" } });
    fireEvent.blur(field());

    expect(onBlur).toHaveBeenCalledWith(3.26);
  });

  it("hands back zero for something that is not a figure", () => {
    const onBlur = vi.fn();
    show({ onBlur });

    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());

    expect(onBlur).toHaveBeenCalledWith(0);
  });

  // The field is reused as the reader moves between structures, so it has to
  // show the rate of whichever one they are looking at rather than the rate
  // they last typed against a different one.
  it("takes up a new figure when it is given one", () => {
    const { rerender } = show({ initialState: 5 });

    rerender(<TaxPercentageTextField initialState={11} onBlur={() => {}} />);

    expect(field()).toHaveValue(11);
  });

  it("keeps what was typed while the figure it was given stays put", () => {
    const { rerender } = show({ initialState: 5 });
    fireEvent.change(field(), { target: { value: "9" } });

    rerender(<TaxPercentageTextField initialState={5} onBlur={() => {}} />);

    expect(field()).toHaveValue(9);
  });

  // A ceiling is given where a server rule caps the figure. A field that took
  // more would build a document the save is refused for, which reaches a reader
  // as nothing but a number that never sticks.
  describe("a rate with a ceiling", () => {
    it("refuses a figure above it", () => {
      show({ initialState: 2, max: 100 });

      fireEvent.change(field(), { target: { value: "150" } });

      expect(field()).toHaveValue(2);
    });

    it("takes the ceiling itself", () => {
      show({ initialState: 2, max: 100 });

      fireEvent.change(field(), { target: { value: "100" } });

      expect(field()).toHaveValue(100);
    });

    // Cleared on the way to typing another figure, so an empty field is not yet
    // over anything.
    it("still lets the field be emptied", () => {
      show({ initialState: 2, max: 100 });

      fireEvent.change(field(), { target: { value: "" } });

      expect(field()).toHaveValue(null);
    });

    it("leaves a field with no ceiling unbounded", () => {
      show({ initialState: 2 });

      fireEvent.change(field(), { target: { value: "150" } });

      expect(field()).toHaveValue(150);
    });
  });
});
