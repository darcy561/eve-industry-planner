import { useEffect, useState } from "react";
import {
  FormControl,
  FormHelperText,
  Grid,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
} from "@mui/material";
import { structureOptions } from "../../Context/defaultValues";
import calculateTimeForSetup from "../../Functions/Blueprint Calculations/calculateTimeForSetup";
import calculateMaterialsFromSetup from "../../Functions/Blueprint Calculations/calculateMaterialsForSetup";

export function ReactionOptionsUpcomingChanges({
  tranqItem,
  updateTranqItem,
  sisiItem,
  updateSisiItem,
  itemLoad,
}) {
  const [runValue, updateRunValue] = useState(1);
  const [jobValue, updateJobValue] = useState(1);
  const [structType, updateStructType] = useState(0);
  const [rigsValue, updateRigsValue] = useState(0);
  const [systemValue, updateSystemValue] = useState(1);

  useEffect(() => {
    function updateDefaultValues() {
      if (tranqItem !== null && sisiItem !== null) {
        if (tranqItem === null && sisiItem !== null) {
          updateRunValue(sisiItem.runCount);
          updateJobValue(sisiItem.jobCount);
          updateStructType(sisiItem.structureType);
          updateRigsValue(sisiItem.rigType);
          updateSystemValue(sisiItem.systemType);
        } else {
          updateRunValue(tranqItem.runCount);
          updateJobValue(tranqItem.jobCount);
          updateStructType(tranqItem.structureType);
          updateRigsValue(tranqItem.rigType);
          updateSystemValue(tranqItem.systemType);
        }
      }
    }
    updateDefaultValues();
  }, [itemLoad]);

  useEffect(() => {
    updateTranqItem((prev) => ({
      ...prev,
      runCount: runValue,
      jobCount: jobValue,
      structureType: structType,
      rigType: rigsValue,
      systemType: systemValue,
      build: {
        ...prev.build,
        materials: calculateMaterialsFromSetup({
          jobType: prev.jobType,
          runCount: runValue,
          jobCount: jobValue,
          structureType: structType,
          rigType: rigsValue,
          systemType: systemValue,
        }),
        products: {
          ...prev.build.products,
          totalQuantity:
            prev.rawData.products[0].quantity * runValue * jobValue,
          quantityPerJob: prev.rawData.products[0].quantity * jobValue,
        },
        time: calculateTimeForSetup({
          jobType: prev.jobType,
          CharacterHash: prev.build.buildChar,
          structureType: structType,
          rigType: rigsValue,
          runCount: runValue,
          bpTE: 0,
          rawTime: prev.rawData.time,
          skills: prev.skills,
        }),
      },
    }));
    updateSisiItem((prev) => ({
      ...prev,
      runCount: runValue,
      jobCount: jobValue,
      structureType: structType,
      rigType: rigsValue,
      systemType: systemValue,
      build: {
        ...prev.build,
        materials: calculateMaterialsFromSetup({
          jobType: prev.jobType,
          runCount: runValue,
          jobCount: jobValue,
          structureType: structType,
          rigType: rigsValue,
          systemType: systemValue,
        }),
        products: {
          ...prev.build.products,
          totalQuantity:
            prev.rawData.products[0].quantity * runValue * jobValue,
          quantityPerJob: prev.rawData.products[0].quantity * jobValue,
        },
        time: calculateTimeForSetup({
          jobType: prev.jobType,
          CharacterHash: prev.build.buildChar,
          structureType: structType,
          rigType: rigsValue,
          runCount: runValue,
          bpTE: 0,
          rawTime: prev.rawData.time,
          skills: prev.skills,
        }),
      },
    }));
  }, [runValue, jobValue, structType, rigsValue, systemValue]);

  return (
    <Paper
      square
      elevation={3}
      sx={{
        padding: "20px",
      }}
    >
      <Grid container>
        <Grid size={6}>
          <TextField
            fullWidth
            defaultValue={runValue}
            size="small"
            variant="standard"
            helperText="Blueprint Runs"
            type="number"
            onBlur={(e) => {
              updateRunValue(Number(e.target.value));
            }}
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
              paddingLeft: "5px",
              paddingRight: "5px",
            }}
          />
        </Grid>
        <Grid size={6}>
          <TextField
            fullWidth
            defaultValue={jobValue}
            size="small"
            variant="standard"
            helperText="Job Slots"
            type="number"
            onBlur={(e) => {
              updateJobValue(Number(e.target.value));
            }}
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
              paddingLeft: "5px",
              paddingRight: "5px",
            }}
          />
        </Grid>
        <Grid size={4}>
          <Tooltip
            title={
              <span>
                <p>Medium: Astrahus, Athanor, Raitaru</p>
                <p>Large: Azbel, Fortizar, Tatara</p>
              </span>
            }
            arrow
            placement="top"
          >
            <FormControl
              fullWidth
              sx={{
                "& .MuiFormHelperText-root": {
                  color: (theme) => theme.palette.secondary.main,
                },
                "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                  {
                    display: "none",
                  },
                paddingLeft: "5px",
                paddingRight: "5px",
              }}
            >
              <Select
                variant="standard"
                size="small"
                value={structType}
                onChange={(e) => {
                  updateStructType(e.target.value);
                }}
              >
                {Object.values(structureOptions.reactionStructure).map(
                  (entry) => {
                    return (
                      <MenuItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </MenuItem>
                    );
                  }
                )}
              </Select>
              <FormHelperText variant="standard">Structure Type</FormHelperText>
            </FormControl>
          </Tooltip>
        </Grid>
        <Grid size={4}>
          <FormControl
            fullWidth
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
              paddingLeft: "5px",
              paddingRight: "5px",
            }}
          >
            <Select
              variant="standard"
              size="small"
              value={rigsValue}
              onChange={(e) => {
                updateRigsValue(e.target.value);
              }}
            >
              {Object.values(structureOptions.reactionRigs).map((entry) => {
                return (
                  <MenuItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText variant="standard">Rig Type</FormHelperText>
          </FormControl>
        </Grid>
        <Grid size={4}>
          <FormControl
            fullWidth
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
              paddingLeft: "5px",
              paddingRight: "5px",
            }}
          >
            <Select
              variant="standard"
              size="small"
              value={systemValue}
              onChange={(e) => {
                updateSystemValue(e.target.value);
              }}
            >
              {Object.values(structureOptions.reactionSystem).map((entry) => {
                return (
                  <MenuItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </MenuItem>
                );
              })}
            </Select>
            <FormHelperText variant="standard">System Type</FormHelperText>
          </FormControl>
        </Grid>
      </Grid>
    </Paper>
  );
}
