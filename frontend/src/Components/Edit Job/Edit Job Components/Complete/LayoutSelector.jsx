import { useMediaQuery } from "@mui/material";
import { Complete_StandardLayout_EditJob } from "./Standard Layout/standardLayout";

export function LayoutSelector_EditJob_Complete(props) {
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  switch (deviceNotMobile) {
    case true:
      return <Complete_StandardLayout_EditJob {...props} />;
    case false:
      return <Complete_StandardLayout_EditJob {...props} />;
    default:
      return <Complete_StandardLayout_EditJob {...props} />;
  }
}
