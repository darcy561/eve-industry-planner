/**
 * The keyboard half of "the whole card is the control".
 *
 * A `Paper` given a role and a `tabIndex` looks like a control and is reachable
 * by Tab, but a native button's Enter and Space activation is the browser's
 * doing and does not come with the role. Without this a card is focusable and
 * does nothing, which is worse than not being reachable at all.
 *
 * The default is prevented so Space scrolls the page no further than the card.
 *
 * @param {(event: KeyboardEvent) => void} activate
 * @returns {(event: KeyboardEvent) => void} an `onKeyDown` handler
 */
export function activateOnEnterOrSpace(activate) {
  return (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(event);
    }
  };
}
