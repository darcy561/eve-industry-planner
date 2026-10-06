import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  BandCaption,
  ContextRow,
  Disclosure,
  FIGURE_TONE,
  Figure,
  FigureCaption,
  FigureRow,
  FoldedList,
  HeadlineStat,
  PanelFooterMeta,
  PanelHeadline,
  SignedPercent,
  StatTile,
  figureToneColour,
  totalRowSx,
} from "./figures";

describe("Figure", () => {
  it("shows the value it was given", () => {
    render(<Figure>1,234</Figure>);

    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("says there is nothing rather than showing a gap", () => {
    for (const absent of [null, undefined, ""]) {
      const { unmount } = render(<Figure>{absent}</Figure>);
      expect(screen.getByText("—")).toBeInTheDocument();
      unmount();
    }
  });

  it("does not treat a zero as absent", () => {
    render(<Figure>{0}</Figure>);

    expect(screen.getByText("0.00")).toBeInTheDocument();
  });

  it("lines its digits up with the figures around it", () => {
    render(<Figure>12</Figure>);

    expect(screen.getByText("12")).toHaveStyle({
      fontVariantNumeric: "tabular-nums",
    });
  });
});

describe("SignedPercent", () => {
  it("takes a fraction and states a percentage", () => {
    render(<SignedPercent value={-0.083} />);

    expect(screen.getByText("−8.3%")).toBeInTheDocument();
  });

  it("signs a rise", () => {
    render(<SignedPercent value={0.104} />);

    expect(screen.getByText("+10.4%")).toBeInTheDocument();
  });

  it("has nothing to say without a value", () => {
    render(<SignedPercent value={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("has nothing to say about a value that is not a number", () => {
    render(<SignedPercent value={Number.NaN} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("rounds to the places asked for", () => {
    render(<SignedPercent value={-0.08349} places={2} />);

    expect(screen.getByText("−8.35%")).toBeInTheDocument();
  });
});

describe("FigureRow", () => {
  it("states a label and its figure", () => {
    render(<FigureRow label="Materials" value="468,200,000" />);

    expect(screen.getByText("Materials")).toBeInTheDocument();
    expect(screen.getByText("468,200,000")).toBeInTheDocument();
  });

  it("carries a sub-label under the label", () => {
    render(<FigureRow label="Materials" sublabel="16 items" value="1" />);

    expect(screen.getByText("16 items")).toBeInTheDocument();
  });

  it("shows a dash for a row with no figure yet", () => {
    render(<FigureRow label="Sales tax" value={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("PanelFooterMeta", () => {
  it("states what a panel holds and its total", () => {
    render(<PanelFooterMeta value="214,800 m³">16 materials</PanelFooterMeta>);

    expect(screen.getByText("16 materials")).toBeInTheDocument();
    expect(screen.getByText("214,800 m³")).toBeInTheDocument();
  });

  it("omits the total side when there is none", () => {
    const { container } = render(
      <PanelFooterMeta>16 materials</PanelFooterMeta>,
    );

    expect(container.querySelectorAll("span, p")).toHaveLength(1);
  });
});

describe("FigureRow, the shapes a breakdown is made of", () => {
  it("colours the value by the tone it is given", () => {
    render(<FigureRow label="Saving" value="12,000" tone={FIGURE_TONE.GOOD} />);

    expect(screen.getByText("12,000")).toHaveStyle({
      color: "rgb(46, 125, 50)",
    });
  });

  it("rules a total above rather than below, so it closes a block", () => {
    const { container: totalRow, unmount } = render(
      <FigureRow label="Total" value="1" isTotal />,
    );
    expect(totalRow.firstChild).toHaveStyle({ borderTopStyle: "solid" });
    unmount();

    const { container: ordinaryRow } = render(
      <FigureRow label="Materials" value="1" />,
    );
    expect(ordinaryRow.firstChild).toHaveStyle({
      borderBottomStyle: "solid",
    });
  });

  it("carries a marker before the label", () => {
    render(
      <FigureRow label="Materials" value="1" marker={<span>swatch</span>} />,
    );

    expect(screen.getByText("swatch")).toBeInTheDocument();
  });
});

describe("FigureCaption", () => {
  it("names a figure quietly and in caps", () => {
    render(<FigureCaption>Cost per unit</FigureCaption>);

    expect(screen.getByText("Cost per unit")).toHaveStyle({
      textTransform: "uppercase",
    });
  });
});

describe("HeadlineStat", () => {
  it("states what the figure is, then the figure", () => {
    render(<HeadlineStat caption="Net return" value="143,400,000" />);

    expect(screen.getByText("Net return")).toBeInTheDocument();
    expect(screen.getByText("143,400,000")).toBeInTheDocument();
  });

  it("shows a dash when the figure is not known yet", () => {
    render(<HeadlineStat caption="Net return" value={null} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("carries context under the figure", () => {
    render(
      <HeadlineStat caption="Net return" value="1">
        <span>per unit</span>
      </HeadlineStat>,
    );

    expect(screen.getByText("per unit")).toBeInTheDocument();
  });
});

describe("StatTile", () => {
  it("states a measure, its figure and what it was before", () => {
    render(
      <StatTile
        label="Amount Spent"
        value="1,160.00"
        change="+12.4%"
        comparison="Last month: 1,080.00"
      />,
    );

    expect(screen.getByText("Amount Spent")).toBeInTheDocument();
    expect(screen.getByText("1,160.00")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
    expect(screen.getByText("Last month: 1,080.00")).toBeInTheDocument();
  });

  it("shows its shape rather than zeroes while the figures load", () => {
    const { container } = render(
      <StatTile label="Amount Spent" value="0.00" isLoading />,
    );

    expect(screen.queryByText("0.00")).toBeNull();
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBe(3);
  });

  it("leaves out a change and a comparison it was not given", () => {
    render(<StatTile label="Amount Spent" value="1,160.00" />);

    expect(screen.getByText("1,160.00")).toBeInTheDocument();
    expect(screen.queryByText(/Last month/)).toBeNull();
  });
});

describe("figureToneColour", () => {
  it("gives a tone's colour to things that are not figures", () => {
    expect(figureToneColour(FIGURE_TONE.GOOD)).toBe("success.main");
    expect(figureToneColour(FIGURE_TONE.BAD)).toBe("error.main");
  });

  it("falls back rather than returning nothing for an unknown tone", () => {
    expect(figureToneColour("nonsense")).toBe("text.primary");
  });
});

describe("BandCaption", () => {
  it("names a group of rows", () => {
    render(<BandCaption>Cost to sell</BandCaption>);

    expect(screen.getByText("Cost to sell")).toBeInTheDocument();
  });

  it("does without a table, so a stacked panel uses the same one", () => {
    const { container } = render(<BandCaption>Required to build</BandCaption>);

    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByText("Required to build")).toBeInTheDocument();
  });
});

describe("totalRowSx", () => {
  it("rules a total above rather than below", () => {
    expect(totalRowSx).toMatchObject({ borderTop: 1, borderColor: "divider" });
    expect(totalRowSx).not.toHaveProperty("borderBottom");
  });
});

describe("PanelHeadline", () => {
  it("puts the lead figure and what stands beside it on one line", () => {
    render(
      <PanelHeadline aside={<span>beside</span>}>
        <HeadlineStat caption="Net return" value="143,400,000" />
      </PanelHeadline>,
    );

    expect(screen.getByText("Net return")).toBeInTheDocument();
    expect(screen.getByText("beside")).toBeInTheDocument();
  });

  it("does without an aside", () => {
    render(
      <PanelHeadline>
        <HeadlineStat caption="Cost per unit" value="1" />
      </PanelHeadline>,
    );

    expect(screen.getByText("Cost per unit")).toBeInTheDocument();
  });

  it("holds several figures beside the lead one", () => {
    render(
      <PanelHeadline
        aside={
          <>
            <HeadlineStat caption="Per unit" value="1" size="beside" />
            <HeadlineStat caption="Margin" value="2" size="beside" />
            <HeadlineStat caption="Return" value="3" size="beside" />
          </>
        }
      >
        <HeadlineStat caption="Net return" value="4" />
      </PanelHeadline>,
    );

    expect(
      screen.getAllByText(/Per unit|Margin|Return|Net return/),
    ).toHaveLength(4);
  });
});

describe("ContextRow", () => {
  it("states a relationship and its qualification", () => {
    render(<ContextRow note="on 7 builds">Break-even at 46.1M</ContextRow>);

    expect(screen.getByText("Break-even at 46.1M")).toBeInTheDocument();
    expect(screen.getByText("on 7 builds")).toBeInTheDocument();
  });

  it("does without a qualification", () => {
    render(<ContextRow>Break-even at 46.1M</ContextRow>);

    expect(screen.getByText("Break-even at 46.1M")).toBeInTheDocument();
  });
});

describe("Disclosure", () => {
  it("keeps its content out of the way until asked", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure label="Calculation">
        <span>the working</span>
      </Disclosure>,
    );

    expect(screen.queryByText("the working")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Calculation" }));

    expect(screen.getByText("the working")).toBeInTheDocument();
  });

  it("says whether it is open", async () => {
    const user = userEvent.setup();
    render(
      <Disclosure label="Calculation">
        <span>the working</span>
      </Disclosure>,
    );
    const toggle = screen.getByRole("button", { name: "Calculation" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("can start open where a panel wants it shown", () => {
    render(
      <Disclosure label="Calculation" defaultOpen>
        <span>the working</span>
      </Disclosure>,
    );

    expect(screen.getByText("the working")).toBeInTheDocument();
  });
});

describe("a raw number given to a Figure", () => {
  it("is formatted rather than stringified", () => {
    render(<Figure>{12000}</Figure>);

    expect(screen.getByText("12,000.00")).toBeInTheDocument();
  });

  it("takes the decimal places it is told to use", () => {
    render(<Figure formatOptions={{ max: 0 }}>{12000}</Figure>);

    expect(screen.getByText("12,000")).toBeInTheDocument();
  });

  it("leaves an already-formatted string alone", () => {
    render(<Figure>{"12,000"}</Figure>);

    expect(screen.getByText("12,000")).toBeInTheDocument();
  });
});

describe("FoldedList", () => {
  const list = (count) =>
    render(
      <FoldedList
        items={Array.from({ length: count }, (_, n) => `row ${n + 1}`)}
        renderItem={(item) => <span key={item}>{item}</span>}
        foldLabel={(folded) => `Show the other ${folded.length}`}
      />,
    );

  it("shows seven rows whole, since folding one saves nothing", () => {
    list(7);

    expect(screen.getByText("row 7")).toBeInTheDocument();
    expect(screen.queryByText(/Show the other/)).not.toBeInTheDocument();
  });

  it("folds past six and counts what it folds", () => {
    list(9);

    expect(screen.getByText("row 6")).toBeInTheDocument();
    expect(screen.queryByText("row 7")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Show the other 3"));

    expect(screen.getByText("row 9")).toBeInTheDocument();
  });
});

describe("a Disclosure drawn as a heading", () => {
  it("names its section as a caption with a button that says what it will do", async () => {
    render(
      <Disclosure heading label="Skills">
        Reprocessing
      </Disclosure>,
    );

    expect(screen.queryByText("Reprocessing")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show Skills" }));
    expect(screen.getByText("Reprocessing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide Skills" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});
