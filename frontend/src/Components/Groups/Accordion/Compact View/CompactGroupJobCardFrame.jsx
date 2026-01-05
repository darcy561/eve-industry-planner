import { useMemo } from "react";
import { useDrag } from "react-dnd";
import { ItemTypes } from "../../../../Context/DnDTypes";
import { jobTypes } from "../../../../Context/defaultValues";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Grid,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import InfoIcon from "@mui/icons-material/Info";
import { deepPurple, grey, lightGreen } from "@mui/material/colors";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useNavigate } from "@tanstack/react-router";
import getTooltipContent from "./jobCardTooltips";
import useUsersStore from "../../../../Zustand/usersStore";
import deleteJobsFromPlanner from "../../../../Functions/JobPlanner/deleteMultipleJobs";

export function CompactGroupJobCardFrame({ job, highlightedItems }) {
  const { activeGroupID } = useUsersStore((state) => state.jobData);
  const { multiSelect } = useUsersStore((state) => state.jobData);
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));
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

  const jobCardChecked = useMemo(() => {
    return multiSelect.includes(job.jobID);
  }, [multiSelect]);

  const isHighlighted = highlightedItems.has(job.jobID);

  const tooltipContent = getTooltipContent(job);

  const navigate = useNavigate();

  function getCardColor(theme, jobType) {
    switch (jobType) {
      case jobTypes.manufacturing:
        return theme.palette.mode === PRIMARY_THEME
          ? `linear-gradient(to right, ${lightGreen[300]} 30%, ${grey[900]} 60%)`
          : `linear-gradient(to right, ${lightGreen[200]} 30%, white 60%)`;

      case jobTypes.reaction:
        return theme.palette.mode === PRIMARY_THEME
          ? `linear-gradient(to right, ${deepPurple[300]} 30%, ${grey[900]} 60%)`
          : `linear-gradient(to right, ${deepPurple[100]} 20%, white 60%)`;

      default:
        return "transparent";
    }
  }

  function onJobClick() {
    navigate({
      to: '/editjob/$jobID',
      params: { jobID: job.jobID },
      search: { activeGroup: activeGroupID }
    });
  }

  return (
    <Card
      ref={drag}
      elevation={2}
      square
      sx={(theme) => {
        const isDarkMode = theme.palette.mode === PRIMARY_THEME;
        const backgroundColor =
          jobCardChecked || isDragging || isHighlighted
            ? isDarkMode
              ? grey[900]
              : grey[300]
            : undefined;
        const borderColor = isDarkMode ? grey[700] : grey[400];
        return {
          marginTop: "5px",
          marginBottom: "5px",
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
      <Grid container sx={{ height: "100%" }}>
        <Grid container>
          <Grid
            align="center"
            size={{
              xs: 2,
              sm: 1
            }}>
            <Checkbox
              sx={{
                color: (theme) =>
                  theme.palette.mode === PRIMARY_THEME
                    ? theme.palette.primary.main
                    : theme.palette.secondary.main,
              }}
              checked={jobCardChecked}
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
            <Typography sx={{ typography: { xs: "body2", sm: "body1" } }}>
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
          <Grid container align="center" alignItems="center" size={isMobile ? 3 : 1}>
            <Button color="primary" onClick={onJobClick}>
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
        </Grid>
        <Grid container>
          <Grid
            sx={{
              height: "2px",
              background: (theme) => getCardColor(theme, job.jobType),
            }}
            size={12} />
        </Grid>
      </Grid>
    </Card>
  );
}
