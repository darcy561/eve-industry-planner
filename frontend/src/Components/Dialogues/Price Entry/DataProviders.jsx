import { PriceEntryDialogueContent } from "./PriceEntryDialogueContent";

// Main content component that always renders the same structure
export function PriceEntryContent({ state, actions }) {
  return (
    <PriceEntryDialogueContent 
      state={state} 
      actions={actions} 
    />
  );
}

