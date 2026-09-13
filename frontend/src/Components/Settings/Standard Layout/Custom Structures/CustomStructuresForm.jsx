import { useState } from "react";
import { Stack } from "@mui/material";

import JobTypeSelection_CustomStructures from "./jobTypeSelection";
import StructureOptionsSelection_CustomStructures from "./structureSelection";
import InventionStructureSelection from "./inventionStructureSelection";
import ReprocessingStructureSelection from "./reprocessingStructureSelection";
import CurrentStructuresFrame from "./currentStructures";
import { SectionPanel } from "../../../../Styled Components/Paper/SectionPanel";
import { jobTypes } from "../../../../Context/defaultValues";

/**
 * Building a custom structure: pick a job type, describe the structure, see what
 * you have.
 *
 * The form a job type gets differs because the structures do — invention has two
 * rig slots, reprocessing adds an implant — so each has its own component and
 * this chooses between them.
 */
export default function CustomStructuresForm() {
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [initialSelectionMade, setInitialSelectionMade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const StructureForm =
    selectedJobType === jobTypes.reprocessing
      ? ReprocessingStructureSelection
      : selectedJobType === jobTypes.invention
        ? InventionStructureSelection
        : StructureOptionsSelection_CustomStructures;

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
            title="Your structures for this lane"
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
