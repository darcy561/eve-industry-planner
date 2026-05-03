import { useState } from "react";
import { Box } from "@mui/material";
import JobTypeSelection_CustomStructures from "./Custom Structures/jobTypeSelection";
import StructureOptionsSelection_CustomStructures from "./Custom Structures/structureSelection";
import ReprocessingStructureSelection from "./Custom Structures/reprocessingStructureSelection";
import CurrentStructuresFrame from "./Custom Structures/currentStructures";
import InventionStructureSelection from "./Custom Structures/inventionStructureSelection";
import { jobTypes } from "../../../Context/defaultValues";

function CustomStructuresFrame() {
  const [selectedJobType, setSelectedJobType] = useState(null);
  const [initialSelectionMade, setInitialSelectionMade] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <JobTypeSelection_CustomStructures
          selectedJobType={selectedJobType}
          setSelectedJobType={setSelectedJobType}
          setInitialSelectionMade={setInitialSelectionMade}
        />
      </Box>

      {initialSelectionMade && (
        <Box sx={{ flexShrink: 0 }}>
          {selectedJobType === jobTypes.invention && (
            <InventionStructureSelection
              key={selectedJobType}
              selectedJobType={selectedJobType}
              setIsLoading={setIsLoading}
            />
          )}
          {selectedJobType === jobTypes.reprocessing && (
            <ReprocessingStructureSelection
              key={selectedJobType}
              selectedJobType={selectedJobType}
              setIsLoading={setIsLoading}
            />
          )}
          {selectedJobType === jobTypes.manufacturing || selectedJobType === jobTypes.reaction && (
            <StructureOptionsSelection_CustomStructures
              key={selectedJobType}
              selectedJobType={selectedJobType}
              setIsLoading={setIsLoading}
            />
          )}
        </Box>
      )}

      {initialSelectionMade && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
            alignItems: "center",
            flexGrow: 1,
            overflowY: "auto",
            marginTop: "20px",
          }}
        >
          <CurrentStructuresFrame
            selectedJobType={selectedJobType}
            isLoading={isLoading}
          />
        </Box>
      )}
    </Box>
  );
}

export default CustomStructuresFrame;
