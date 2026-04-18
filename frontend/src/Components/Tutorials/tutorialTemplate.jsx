import { useEffect, useState } from "react";
import {
  Grid,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Fade,
  Box,
} from "@mui/material";
import GLOBAL_CONFIG from "../../global-config-app";
import { saveApplicationSettings } from "../../Functions/Endpoints/Pirivate/userDocument";
import useUsersStore from "../../Zustand/usersStore";
import { useGlobalDebounce } from "../../Hooks/GeneralHooks/useGlobalDebounce";
import { DEBOUNCE_KEYS } from "../../Context/debounceKeys";
import ContentPanel from "../../Styled Components/Paper/ContentPanel";

function TutorialTemplate({ TutorialContent, updateExpandedMenu, paperSx, onFadeOutComplete }) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const displayHelpCards = useUsersStore(
    (state) => state.applicationSettings.displayHelpCards
  );
  const { toggleHideTutorials } = useUsersStore(
    (state) => state.applicationSettings.actions
  );
  const { PRIMARY_THEME } = GLOBAL_CONFIG;

  const shouldBeVisible = !isLoggedIn || displayHelpCards;
  const [shouldMount, setShouldMount] = useState(shouldBeVisible);

  async function handleCheckBox() {
    toggleHideTutorials();
    if (updateExpandedMenu) {
      updateExpandedMenu((prev) => !prev);
    }
    debouncedSaveSettings();
  }

  const debouncedSaveSettings = useGlobalDebounce(
    DEBOUNCE_KEYS.APP_SETTINGS_SAVE,
    async () => {
      await saveApplicationSettings();
    },
    2000
  );

  useEffect(() => {
    if (shouldBeVisible) {
      setShouldMount(true);
    } else if (shouldMount) {
      // Was visible, now hiding - unmount after fade completes
      const timeout = setTimeout(() => {
        setShouldMount(false);
        // Notify parent that fade-out animation has completed
        if (onFadeOutComplete) {
          onFadeOutComplete();
        }
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [shouldBeVisible, shouldMount, onFadeOutComplete]);

  if (!shouldMount) return null;

  return (
    <Fade in={shouldBeVisible} timeout={1000} appear={false}>
      <Box sx={{ width: "100%", height: "100%" }}>
        <ContentPanel componentName="Tutorial Template"
          paperSx={{
            padding: 2,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            ...paperSx,
          }}
        >
          <Grid container sx={{ flex: 1, minHeight: 0, flexDirection: "column" }}>
            <Grid size={12} sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
              {TutorialContent}
            </Grid>
            {isLoggedIn && (
              <Grid sx={{ marginTop: "auto" }}>
                <FormGroup>
                  <FormControlLabel
                    label={"Hide Tutorials"}
                    sx={{
                      "& .MuiFormControlLabel-label": {
                        fontSize: "12px",
                      },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        checked={!displayHelpCards}
                        onChange={handleCheckBox}
                        sx={{
                          color: PRIMARY_THEME,
                          "&.Mui-checked": {
                            color: PRIMARY_THEME,
                          },
                        }}
                      />
                    }
                  />
                </FormGroup>
              </Grid>
            )}
          </Grid>
        </ContentPanel>
      </Box>
    </Fade>
  );
}

export default TutorialTemplate;
