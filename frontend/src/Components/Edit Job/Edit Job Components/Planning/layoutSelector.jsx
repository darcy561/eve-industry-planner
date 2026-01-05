import { useMediaQuery } from "@mui/material";
import { Planning_StandardLayout_EditJob } from "./Standard Layout/standardLayout";
import { Planning_MobileLayout_EditJob } from "./Mobile Layout/mobileLayout";

export function LayoutSelector_EditJob_Planning(props) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  switch (deviceNotMobile) {
    case true:
      return <Planning_StandardLayout_EditJob {...props} />;
    case false:
      return <Planning_MobileLayout_EditJob {...props} />;
    default:
      return <Planning_StandardLayout_EditJob {...props} />;
  }
}
