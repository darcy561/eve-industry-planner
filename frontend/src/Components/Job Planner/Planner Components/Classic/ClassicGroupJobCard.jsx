import {
  Avatar,
  AvatarGroup,
  Box,
  Button,
  Checkbox,
  Grid,
  Grow,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { useMemo } from "react";
import { deleteGroupWithoutJobs } from "../../../../Functions/Groups/deleteGroupWithoutJobs.js";
import DeleteIcon from "@mui/icons-material/Delete";
import { grey } from "@mui/material/colors";
import {
  plannerDragPassThroughSx,
  usePlannerGroupCardDrag,
} from "../../Hooks/useDnD";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useNavigate } from "@tanstack/react-router";
import useUsersStore from "../../../../Zustand/usersStore";
import { STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";
import ContentPanel from "../../../../Styled Components/Paper/ContentPanel";
import { useGroupLockReadOnly } from "../../../../Hooks/DocumentLock/useDocumentLockState";
import { lockReasonText } from "../../../DocumentLock/LockGatedTooltip";

export function ClassicGroupJobCard({ group }) {
  const groupLockReadOnly = useGroupLockReadOnly(group.groupID);

  const multiSelect = useUsersStore((state) => state.jobData.multiSelect);
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;

  const {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: dragStyle,
  } = usePlannerGroupCardDrag(group);
  const { PRIMARY_THEME } = GLOBAL_CONFIG;
  const theme = useTheme();
  let groupCardChecked = useMemo(() => {
    return multiSelect.some((i) => i == group.groupID);
  }, [multiSelect]);
  const navigate = useNavigate({ from: '/jobplanner' });

  const paperSxStyles = useMemo(() => {
    const isDarkMode = theme.palette.mode === PRIMARY_THEME;
    const backgroundColor =
      groupCardChecked || isDragging
        ? isDarkMode
          ? grey[900]
          : grey[300]
        : undefined;
    const borderColor = isDarkMode ? grey[700] : grey[400];
    return {
      padding: 0,
      cursor: "grab",
      backgroundColor,
      transition: "border 0.3s ease",
      border: `2px solid transparent`,
      opacity: groupLockReadOnly ? 0.94 : undefined,
      "&:hover": {
        border: `2px solid ${borderColor}`,
      },
    };
  }, [theme, groupCardChecked, isDragging, PRIMARY_THEME, groupLockReadOnly]);

  return (
    <Grid
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      sx={plannerDragPassThroughSx(isDragging)}
      size={{
        xs: 12,
        sm: 6,
        md: 4,
        lg: 3
      }}
    >
        <ContentPanel
          componentName="ClassicGroupJobCard"
          paperSx={{
            ...paperSxStyles,
            "& .MuiGrid-container": {
              display: "flex",
              flexDirection: "column",
              height: "100%",
              flex: 1,
              minHeight: 0,
            },
            "& .MuiGrid-item": {
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            },
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0 }}>
            <Box sx={{ display: "flex", flexDirection: "row", width: "100%" }}>
              <Box sx={{ flex: "0 0 auto" }}>
                <Checkbox
                  sx={{
                    color: (theme) =>
                      theme.palette.mode === PRIMARY_THEME
                        ? theme.palette.primary.main
                        : theme.palette.secondary.main,
                  }}
                  checked={groupCardChecked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      addToMultiSelect(group.groupID);
                    } else {
                      removeFromMultiSelect(group.groupID);
                    }
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }} />
              <Box sx={{ flex: "0 0 auto" }}>
                <Tooltip
                  title={
                    groupLockReadOnly
                      ? lockReasonText({
                          scope: "group",
                          action: "delete is disabled",
                        })
                      : "Remove group from planner"
                  }
                >
                  <span>
                    <IconButton
                      disabled={groupLockReadOnly}
                      sx={{
                        color: (theme) =>
                          theme.palette.mode === PRIMARY_THEME
                            ? theme.palette.primary.main
                            : theme.palette.secondary.main,
                        "&:Hover": {
                          color: "error.main",
                        },
                      }}
                      onClick={() => {
                        deleteGroupWithoutJobs(group.groupID);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
            <Box
              sx={{
                marginBottom: { xs: 0.5, sm: 1 },
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.5,
              }}
            >
              <Typography color="secondary" align="center" variant="body1">
                {group.groupName}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "center", flex: 1, minHeight: 0, width: "100%" }}>
              <AvatarGroup max={4}>
                {[...group.includedTypeIDs].map((typeID) => {
                  return (
                    <Avatar
                      key={typeID}
                      src={`https://images.evetech.net/types/${typeID}/icon?size=64`}
                      style={{
                        border: "none",
                      }}
                      sx={{
                        height: { xs: 24, sm: 32 },
                        width: { xs: 24, sm: 32 },
                      }}
                    />
                  );
                })}
              </AvatarGroup>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", marginTop: "auto", width: "100%" }}>
              <Box sx={{ display: "flex", justifyContent: "center", marginTop: 0.5 }}>
                <Tooltip
                  title={
                    groupLockReadOnly
                      ? lockReasonText({
                          scope: "group",
                          action: "opens in read-only view",
                        })
                      : ""
                  }
                  arrow
                  disableHoverListener={!groupLockReadOnly}
                >
                  <Button
                    variant="outlined"
                    color={groupLockReadOnly ? "warning" : "primary"}
                    onClick={() => navigate({
                      to: '/group/$groupID',
                      params: { groupID: group.groupID }
                    })}
                    sx={{ height: "25px", width: "100px" }}
                  >
                    View
                  </Button>
                </Tooltip>
              </Box>
              <Box
                sx={{
                  backgroundColor: "groupJob.main",
                  marginTop: 1,
                  width: "100%",
                }}>
                <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT, color: "black" }}>
                  <b>Job Group</b>
                </Typography>
              </Box>
            </Box>
          </Box>
      </ContentPanel>
    </Grid>
  );
}
