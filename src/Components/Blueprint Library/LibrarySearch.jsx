import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  TextField,
} from "@mui/material";
import { useContext, useState } from "react";
import { UsersContext } from "../../Context/AuthContext";
import { jobTypes } from "../../Context/defaultValues";
import { ApiJobsContext } from "../../Context/JobContext";
import itemList from "../../RawData/searchIndex.json";
import {
  CorpEsiDataContext,
  PersonalESIDataContext,
} from "../../Context/EveDataContext";
import VirtualisedRecipeSearch from "../../Styled Components/autocomplete/virtualisedRecipeSearch";

export function LibrarySearch({
  updateBlueprintData,
  pagination,
  setPagination,
}) {
  const [displayAll, changeDisplayAll] = useState(true);
  const [displayActive, changeDisplayActive] = useState(false);
  const [displayManufacturing, changeDisplayManufacturing] = useState(false);
  const [displayReactions, changeDisplayReactions] = useState(false);
  const [displayBPO, changeDisplayBPO] = useState(false);
  const [displayBPC, changeDisplayBPC] = useState(false);
  const { apiJobs } = useContext(ApiJobsContext);
  const { esiBlueprints } = useContext(PersonalESIDataContext);
  const { corpEsiBlueprints } = useContext(CorpEsiDataContext);

  function onChange(value) {
    const tempArray = [
      ...esiBlueprints.flatMap((entry) => entry.data),
      ...Array.from(corpEsiBlueprints.values())
        .filter((obj) => Object.keys(obj).length > 0)
        .map(Object.values)
        .reduce((acc, val) => acc.concat(val), []),
    ].filter((i) => i.type_id === value.blueprintID);
    const idArray = new Set(tempArray.map((bp) => bp.type_id));
    updateBlueprintData({
      ids: [...idArray],
      blueprints: tempArray,
    });
    if (displayAll) {
      changeDisplayAll((prev) => !prev);
    }
    if (displayActive) {
      changeDisplayActive((prev) => !prev);
    }
    if (displayManufacturing) {
      changeDisplayManufacturing((prev) => !prev);
    }
    if (displayReactions) {
      changeDisplayReactions((prev) => !prev);
    }
    if (displayBPO) {
      changeDisplayBPO((prev) => !prev);
    }
    if (displayBPC) {
      changeDisplayBPC((prev) => !prev);
    }
  }

  return (
    <Paper
      square
      elevation={2}
      sx={{
        padding: "20px",
      }}
    >
      <Grid container>
        <Grid item xs={12} sm={5} md={4} xl={2}>
          <VirtualisedRecipeSearch onSelect={onChange} />
        </Grid>
        <Grid
          item
          xs={12}
          sm={6}
          md={7}
          xl={9}
          align="center"
          sx={{
            marginTop: { xs: "10px", sm: "0px" },
            paddingLeft: { xs: "0px", sm: "40px", md: "40px", lg: "0px" },
          }}
        >
          <FormControl>
            <RadioGroup row>
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayAll}
                    onChange={() => {
                      if (displayActive) {
                        changeDisplayActive((prev) => !prev);
                      }
                      if (displayManufacturing) {
                        changeDisplayManufacturing((prev) => !prev);
                      }
                      if (displayReactions) {
                        changeDisplayReactions((prev) => !prev);
                      }
                      if (displayBPO) {
                        changeDisplayBPO((prev) => !prev);
                      }
                      if (displayBPC) {
                        changeDisplayBPC((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ];
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );

                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayAll((prev) => !prev);
                    }}
                  />
                }
                label="All"
              />
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayActive}
                    onChange={() => {
                      if (displayAll) {
                        changeDisplayAll((prev) => !prev);
                      }
                      if (displayManufacturing) {
                        changeDisplayManufacturing((prev) => !prev);
                      }
                      if (displayReactions) {
                        changeDisplayReactions((prev) => !prev);
                      }
                      if (displayBPO) {
                        changeDisplayBPO((prev) => !prev);
                      }
                      if (displayBPC) {
                        changeDisplayBPC((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ].filter((blueprint) =>
                        apiJobs.some(
                          (job) =>
                            job.blueprint_id === blueprint.item_id &&
                            job.status === "active"
                        )
                      );
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );

                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayActive((prev) => !prev);
                    }}
                  />
                }
                label="Active"
              />
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayManufacturing}
                    onChange={() => {
                      if (displayAll) {
                        changeDisplayAll((prev) => !prev);
                      }
                      if (displayActive) {
                        changeDisplayActive((prev) => !prev);
                      }
                      if (displayReactions) {
                        changeDisplayReactions((prev) => !prev);
                      }
                      if (displayBPO) {
                        changeDisplayBPO((prev) => !prev);
                      }
                      if (displayBPC) {
                        changeDisplayBPC((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ].filter((blueprint) =>
                        itemList.some(
                          (item) =>
                            item.blueprintID === blueprint.type_id &&
                            item.jobType === jobTypes.manufacturing
                        )
                      );
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );

                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayManufacturing((prev) => !prev);
                    }}
                  />
                }
                label="Manufacturing"
              />
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayReactions}
                    onChange={() => {
                      if (displayAll) {
                        changeDisplayAll((prev) => !prev);
                      }
                      if (displayActive) {
                        changeDisplayActive((prev) => !prev);
                      }
                      if (displayManufacturing) {
                        changeDisplayManufacturing((prev) => !prev);
                      }
                      if (displayBPO) {
                        changeDisplayBPO((prev) => !prev);
                      }
                      if (displayBPC) {
                        changeDisplayBPC((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ].filter((blueprint) =>
                        itemList.some(
                          (item) =>
                            item.blueprintID === blueprint.type_id &&
                            item.jobType === jobTypes.reaction
                        )
                      );
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );

                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayReactions((prev) => !prev);
                    }}
                  />
                }
                label="Reactions"
              />
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayBPO}
                    onChange={() => {
                      if (displayAll) {
                        changeDisplayAll((prev) => !prev);
                      }
                      if (displayActive) {
                        changeDisplayActive((prev) => !prev);
                      }
                      if (displayManufacturing) {
                        changeDisplayManufacturing((prev) => !prev);
                      }
                      if (displayReactions) {
                        changeDisplayReactions((prev) => !prev);
                      }
                      if (displayBPC) {
                        changeDisplayBPC((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ].filter(
                        (blueprint) =>
                          blueprint.runs === -1 &&
                          itemList.some(
                            (item) =>
                              item.blueprintID === blueprint.type_id &&
                              item.jobType === jobTypes.manufacturing
                          )
                      );
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );
                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayBPO((prev) => !prev);
                    }}
                  />
                }
                label="BP Originals"
              />
              <FormControlLabel
                control={
                  <Radio
                    sx={{
                      "&, &.MuiButtonBase-root.MuiRadio-root": {
                        color: "secondary.main",
                      },
                    }}
                    checked={displayBPC}
                    onChange={() => {
                      if (displayAll) {
                        changeDisplayAll((prev) => !prev);
                      }
                      if (displayActive) {
                        changeDisplayActive((prev) => !prev);
                      }
                      if (displayManufacturing) {
                        changeDisplayManufacturing((prev) => !prev);
                      }
                      if (displayReactions) {
                        changeDisplayReactions((prev) => !prev);
                      }
                      if (displayBPO) {
                        changeDisplayBPO((prev) => !prev);
                      }
                      const tempArray = [
                        ...esiBlueprints.flatMap((entry) => entry.data),
                        ...Array.from(corpEsiBlueprints.values())
                          .filter((obj) => Object.keys(obj).length > 0)
                          .map(Object.values)
                          .reduce((acc, val) => acc.concat(val), []),
                      ].filter(
                        (blueprint) =>
                          blueprint.quantity === -2 &&
                          itemList.some(
                            (item) =>
                              item.blueprintID === blueprint.type_id &&
                              item.jobType === jobTypes.manufacturing
                          )
                      );
                      const idArray = new Set(
                        tempArray.map((bp) => bp.type_id)
                      );

                      tempArray.sort(
                        (a, b) =>
                          a.quantity
                            .toString()
                            .localeCompare(b.quantity.toString()) ||
                          b.material_efficiency - a.material_efficiency ||
                          b.time_efficiency - a.time_efficiency
                      );

                      updateBlueprintData({
                        ids: [...idArray],
                        blueprints: tempArray,
                      });
                      setPagination({
                        ...pagination,
                        from: 0,
                        to: pagination.pageSize,
                      });
                      changeDisplayBPC((prev) => !prev);
                    }}
                  />
                }
                label="BP Copies"
              />
            </RadioGroup>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={1} align="center">
          <FormControl
            sx={{
              "& .MuiFormHelperText-root": {
                color: (theme) => theme.palette.secondary.main,
              },
              "& input::-webkit-clear-button, & input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button":
                {
                  display: "none",
                },
            }}
            fullWidth={true}
          >
            <Select
              variant="standard"
              value={pagination.pageSize}
              size="small"
              onChange={(e) => {
                setPagination({
                  ...pagination,
                  to: e.target.value,
                  pageSize: e.target.value,
                });
              }}
            >
              <MenuItem value={4}>4</MenuItem>
              <MenuItem value={8}>8</MenuItem>
              <MenuItem value={16}>16</MenuItem>
              <MenuItem value={32}>32</MenuItem>
              <MenuItem value={64}>64</MenuItem>
            </Select>
            <FormHelperText variant="standard">Items Per Page</FormHelperText>
          </FormControl>
        </Grid>
      </Grid>
    </Paper>
  );
}
