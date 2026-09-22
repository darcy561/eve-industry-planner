import { useMediaQuery } from "@mui/material";
import { Planning_StandardLayout_EditJob } from "./Standard Layout/standardLayout";
import { Planning_MobileLayout_EditJob } from "./Mobile Layout/mobileLayout";

export function LayoutSelector_EditJob_Planning() {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  return deviceNotMobile ? (
    <Planning_StandardLayout_EditJob />
  ) : (
    <Planning_MobileLayout_EditJob />
  );
}
