/**
 * Counts what re-renders, so a conversion can be held to the thing it is for.
 *
 * A panel reading the whole job re-renders on every edit; one reading the part
 * it needs does not. That difference is invisible to a test that only reads what
 * is on screen — both draw the same thing — so it is counted instead.
 *
 * Counting a panel that is meant to stay still takes the `memo` outside the
 * counter — `memo(watch(...))` counts the panel, `watch(memo(...))` breaks,
 * because the counter calls what it is given rather than rendering it as a
 * child. A plain function component is what it takes. A panel re-renders with
 * its parent whatever it subscribes to, so narrowing what it reads is half of
 * holding it still.
 *
 * @example
 * const renders = renderCounts();
 * const Materials = memo(renders.watch("materials", MaterialsPanel));
 * render(<Page MaterialsPanel={Materials} />);
 * renders.reset();
 * fireEvent.click(screen.getByRole("button", { name: "next step" }));
 * expect(renders.of("materials")).toBe(0);
 */
export function renderCounts() {
  const counts = new Map();

  return {
    /**
     * The component under a name, counting each render it does — including the
     * ones it causes itself by what it reads.
     *
     * @param {string} name - What to call it when reading the count back
     * @param {Function} Component - A plain function component
     * @returns {Function} The same component, counted
     */
    watch(name, Component) {
      const Counted = (props) => {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        // Called, not rendered as a child: a panel re-rendering itself off what
        // it reads would otherwise count zero.
        return Component(props);
      };
      Counted.displayName = `Counted(${name})`;
      return Counted;
    },

    /**
     * How many times it has rendered since the last {@link reset}.
     *
     * @param {string} name
     * @returns {number}
     */
    of(name) {
      return counts.get(name) ?? 0;
    },

    /** Forgets what has been counted, for measuring one interaction. */
    reset() {
      counts.clear();
    },
  };
}
