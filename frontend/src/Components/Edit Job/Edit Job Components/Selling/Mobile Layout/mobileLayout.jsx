import { useState } from "react";
import { Grid } from "@mui/material";

export function Selling_MobileLayout_EditJob({
  activeJob,
  updateActiveJob,
  setJobModified,
  esiDataToLink,
  updateEsiDataToLink
}) {
  const [showAvailableOrders, updateShowAvailableOrders] = useState(false);
  const [activeOrder, updateActiveOrder] = useState([]);
  return <Grid container spacing={2}></Grid>;
}
