import { PriceEntryDialogContent } from "./PriceEntryDialogContent";

// Main content component that always renders the same structure
export function PriceEntryContent({ state, actions }) {
  return (
    <PriceEntryDialogContent 
      state={state} 
      actions={actions} 
    />
  );
}

