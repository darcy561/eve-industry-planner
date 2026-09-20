import { useState } from "react";
import { Stack } from "@mui/material";

import JobTypeSelection_CustomStructures from "./jobTypeSelection";
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
        title="Choose a job type"
        subtitle="The application currently supports saving custom structures that perform the following jobs:"
        componentName="Custom structures job type"
      >
        <JobTypeSelection_CustomStructures
          selectedJobType={selectedJobType}
          setSelectedJobType={setSelectedJobType}
          setInitialSelectionMade={setInitialSelectionMade}
        />
      </SectionPanel>

      {initialSelectionMade && (
        <>
          <SectionPanel
            title="Configure your custom structure"
            subtitle="You can add multiple custom structures for each job type but only one structure can be the default. The default structure is what is used initially when creating new jobs of this job type, it can be quickly changed in the job later if needed."
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
