/**
 * Runs view transitions in jsdom, which has none, recording the elements React
 * named before the DOM changed and after it changed.
 *
 * @returns {{started: Array<{namedBefore: Element[], namedAfter: Element[]}>, restore: function(): void}}
 */
export function stubViewTransitions() {
  const started = [];
  const original = {
    startViewTransition: document.startViewTransition,
    fonts: document.fonts,
    getAnimations: document.documentElement.getAnimations,
    animate: Element.prototype.animate,
  };

  document.fonts = { status: "loaded", ready: Promise.resolve() };
  document.documentElement.getAnimations = () => [];
  Element.prototype.animate = () => ({
    cancel() {},
    finish() {},
    persist() {},
    currentTime: 0,
    playState: "finished",
    finished: Promise.resolve(),
    effect: { getKeyframes: () => [], pseudoElement: null },
  });

  const named = () =>
    [...document.querySelectorAll("*")].filter(
      (element) =>
        element !== document.documentElement &&
        element.style?.viewTransitionName,
    );

  document.startViewTransition = (argument) => {
    const update = typeof argument === "function" ? argument : argument.update;
    const transition = { namedBefore: named(), namedAfter: [] };
    started.push(transition);
    const done = Promise.resolve().then(() => {
      const result = update();
      transition.namedAfter = named();
      return result;
    });
    return {
      ready: done,
      finished: done,
      updateCallbackDone: done,
      skipTransition() {},
    };
  };

  function restore() {
    document.startViewTransition = original.startViewTransition;
    document.fonts = original.fonts;
    document.documentElement.getAnimations = original.getAnimations;
    Element.prototype.animate = original.animate;
  }

  return { started, restore };
}
