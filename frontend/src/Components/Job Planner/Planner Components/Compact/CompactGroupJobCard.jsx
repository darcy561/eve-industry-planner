import {
  plannerDragPassThroughSx,
  usePlannerGroupCardDrag,
} from "../../../../Hooks/usePlannerCardDrag";
import {
  Button,
  Card,
  Checkbox,
  Grid,
  IconButton,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import { useMemo } from "react";
import { grey, yellow } from "@mui/material/colors";
import { useGroupManagement } from "../../../../Hooks/useGroupManagement";
import GLOBAL_CONFIG from "../../../../global-config-app";
import { useNavigate } from "@tanstack/react-router";
import { useMediaQuery } from "@mui/material";
import useUsersStore from "../../../../Zustand/usersStore";
import { STANDARD_TEXT_FORMAT } from "../../../../Context/defaultValues";

export function CompactGroupJobCard({ group }) {
  const multiSelect = useUsersStore((state) => state.jobData.multiSelect);
  const { addToMultiSelect, removeFromMultiSelect } =
    useUsersStore.getState().jobData.actions;
  const { deleteGroupWithoutJobs } = useGroupManagement();
  const {
    setNodeRef,
    attributes,
    listeners,
    isDragging,
    style: dragStyle,
  } = usePlannerGroupCardDrag(group);
  const navigate = useNavigate({ from: '/jobplanner' });
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const isMobile = useMediaQuery((theme) => theme.breakpoints.down("sm"));

  const groupCardChecked = useMemo(
    () => multiSelect.includes(group.groupID),
    [multiSelect]
  );

  return (
    <Card
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      square
      sx={(theme) => {
        const isDarkMode = theme.palette.mode === PRIMARY_THEME;
        const backgroundColor =
          groupCardChecked || isDragging
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
          ...plannerDragPassThroughSx(isDragging),
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
        </Grid>
        <Grid
          container
          size={{
            xs: 7,
            sm: 9
          }}
          sx={{
            alignItems: "center"
          }}>
          <Typography sx={{ typography: STANDARD_TEXT_FORMAT  }}>
            {group.groupName}
          </Typography>
        </Grid>
        <Grid
          container
          align="center"
          size={{
            xs: 3,
            sm: 1
          }}
          sx={{
            alignItems: "center",
            justifyContent: "center"
          }}>
          <Button
            color="primary"
            onClick={() => navigate({ 
              to: '/group/$groupID', 
              params: { groupID: group.groupID } 
            })}
          >
            View
          </Button>
        </Grid>
        {!isMobile && (
          <Grid
            container
            align="center"
            size={{
              sm: 1
            }}
            sx={{
              alignItems: "center"
            }}>
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
              onClick={() => {
                deleteGroupWithoutJobs(group.groupID);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Grid>
        )}
        <Grid
          sx={{
            height: "2px",
            background: (theme) =>
              theme.palette.mode === PRIMARY_THEME
                ? `linear-gradient(to right, ${yellow[600]} 30%, ${grey[900]} 60%)`
                : `linear-gradient(to right, ${yellow[600]} 20%, white 60%)`,
          }}
          size={12} />
      </Grid>
    </Card>
  );
}
