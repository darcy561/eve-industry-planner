import { useState } from "react";
import { Box } from "@mui/material";
import JobTypeSelection_CustomStructures from "./Custom Structures/jobTypeSelection";
import StructureOptionsSelection_CustomStructures from "./Custom Structures/structureSelection";

function CustomStructuresFrame() {
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [initialSelectionMade, setInitialSelectionMade] = useState(false);

  return (
    <Box>
      <JobTypeSelection_CustomStructures
        selectedJobType={selectedJobType}
        setSelectedJobType={setSelectedJobType}
        setInitialSelectionMade={setInitialSelectionMade}
      />
      {initialSelectionMade && (
        <Box>
          <StructureOptionsSelection_CustomStructures
            key={selectedJobType}
            selectedJobType={selectedJobType}
          />
        </Box>
      )}
    </Box>
  );
}

export default CustomStructuresFrame;
