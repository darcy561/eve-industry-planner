import { useMemo } from "react";
import { useDrag } from "react-dnd";
import { ItemTypes } from "../../../../Context/DnDTypes";
import { jobTypes, STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import InfoIcon from "@mui/icons-material/Info";
import DeleteIcon from "@mui/icons-material/Delete";
import { grey } from "@mui/material/colors";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate } from "@tanstack/react-router";
import GLOBAL_CONFIG from "../../../../global-config-app";
import getTooltipContent from "./tooltipContent";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";
import { useMediaQuery } from "@mui/material";
import useUsersStore from "../../../../Zustand/usersStore";
import { getJobTypeAccentColor } from "../../../../Functions/Helper/jobTypeDividerColor";

export function CompactJobCardFrame({ job }) {
  const multiSelect = useUsersStore((state) => state.jobData.multiSelect);
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const tooltipContent = getTooltipContent(job);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.jobCard,
    item: {
      id: job.jobID,
      cardType: ItemTypes.jobCard,
      currentStatus: job.jobStatus,
    },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));

  const jobCardChecked = useMemo(
    () => multiSelect.some((i) => i === job.jobID),
    [multiSelect]
  );
  const navigate = useNavigate({ from: '/jobplanner' });

  function getCardColor(theme, jobType) {
    switch (jobType) {
      case jobTypes.manufacturing:
      case jobTypes.reaction: {
        const accent = getJobTypeAccentColor(theme, jobType);
        return theme.palette.mode === PRIMARY_THEME
          ? `linear-gradient(to right, ${accent} 30%, ${grey[900]} 60%)`
          : `linear-gradient(to right, ${accent} 30%, white 60%)`;
      }
      default:
        return "transparent";
    }
  }

  return (
    <Card
      ref={drag}
      elevation={2}
      square
      sx={(theme) => {
        const isDarkMode = theme.palette.mode === PRIMARY_THEME;
        const backgroundColor =
          jobCardChecked || isDragging
            ? isDarkMode
              ? grey[900]
              : grey[300]
            : undefined;
        const borderColor = isDarkMode ? grey[700] : grey[400];
        return {
          marginTop: 0.5,
          marginBottom: 0.5,
          cursor: "grab",
          backgroundColor,
          transition: "border 0.3s ease",
          border: `2px solid transparent`,
          "&:hover": {
            border: `2px solid ${borderColor}`,
          },
        };
      }}
    >
      <Grid container size={12}>
        <Grid
          align="center"
          size={{
            xs: 2,
            sm: 1
          }}>
          <Checkbox
            checked={jobCardChecked}
            sx={{
              color: (theme) =>
                theme.palette.mode === PRIMARY_THEME
                  ? theme.palette.primary.main
                  : theme.palette.secondary.main,
            }}
            onChange={(event) => {
              if (event.target.checked) {
                addToMultiSelect(job.jobID);
              } else {
                removeFromMultiSelect(job.jobID);
              }
            }}
          />
        </Grid>
        <Grid container alignItems="center" size={isMobile ? 7 : 8}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT }}>
            {job.name}
          </Typography>
        </Grid>
        {!isMobile && (
          <Grid
            alignItems="center"
            justifyContent="center"
            sx={{
              display: "flex",
              minHeight: "100%",
            }}
            size={1}>
            <Tooltip title={tooltipContent} arrow placement="left">
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <InfoIcon fontSize="small" color="primary" />
              </Box>
            </Tooltip>
          </Grid>
        )}
        <Grid
          container
          align="center"
          alignItems="center"
          justifyContent="center"
          size={isMobile ? 3 : 1}>
          <Button
            color="primary"
            onClick={() => {
              navigate({
                to: '/editjob/$jobID',
                params: { jobID: job.jobID }
              });
            }}
          >
            Edit
          </Button>
        </Grid>
        {!isMobile && (
          <Grid container align="center" alignItems="center" size={1}>
            <IconButton
              sx={{
                color: (theme) =>
                  theme.palette.mode === PRIMARY_THEME
                    ? theme.palette.primary.main
                    : theme.palette.secondary.main,
                "&:Hover": {
                  color: "error.main",
                },
              }}
              onClick={async () => {
                await deleteJobsFromPlanner(job.jobID);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        )}
        <Grid
          sx={{
            height: "2px",
            background: (theme) => getCardColor(theme, job.jobType),
          }}
          size={12} />
      </Grid>
    </Card>
  );
}
