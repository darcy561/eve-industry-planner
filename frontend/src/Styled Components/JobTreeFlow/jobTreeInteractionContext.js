import { createContext } from "react";

export const noop = () => {};

export const JobTreeInteractionContext = createContext({
  onSelectNode: noop,
  onOpenNode: noop,
});
