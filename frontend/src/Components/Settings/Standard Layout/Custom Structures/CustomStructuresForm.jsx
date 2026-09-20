import { useState } from "react";
import { Stack } from "@mui/material";

import StructureKindSelection from "./structureKindSelection";
import StructureForm from "./structureForm";
import CurrentStructuresFrame from "./currentStructures";
import { SectionPanel } from "../../../../Styled Components/Paper/SectionPanel";

/**
 * Building a custom structure: pick what you are saving, describe it, see what
 * you have.
 *
 * One form serves every kind: what a kind carries is a row in the class's field
 * map, and the form renders the control for each field that row names.
 */
export default function CustomStructuresForm() {
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [initialSelectionMade, setInitialSelectionMade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Stack spacing={2.5}>
      <SectionPanel
        title="Choose what you are saving"
        subtitle="Somewhere you build, or somewhere you sell. What a kind is described by follows from which you pick."
        componentName="Custom structure kind"
      >
        <StructureKindSelection
          selectedJobType={selectedJobType}
          setSelectedJobType={setSelectedJobType}
          setInitialSelectionMade={setInitialSelectionMade}
        />
      </SectionPanel>

      {initialSelectionMade && (
        <>
          <SectionPanel
            title="Configure your custom structure"
            subtitle="You can save as many of each kind as you like, and one of each is the default. The default is what a new job of that kind starts with, and can be changed on the job afterwards."
            componentName="Custom structure form"
          >
            <StructureForm
              key={selectedJobType}
              selectedJobType={selectedJobType}
              setIsLoading={setIsLoading}
            />
          </SectionPanel>

          <SectionPanel
            title="What you have saved"
            componentName="Current custom structures"
          >
            <CurrentStructuresFrame
              selectedJobType={selectedJobType}
              isLoading={isLoading}
            />
          </SectionPanel>
        </>
      )}
    </Stack>
  );
}
