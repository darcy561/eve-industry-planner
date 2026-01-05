import { useState } from "react";
import { useMediaQuery } from "@mui/material";
import { Purchasing_StandardLayout_EditJob } from "./Standard Layout/standardLayout";
import useUsersStore from "../../../../Zustand/usersStore";

export function LayoutSelector_EditJob_Purchasing(props) {
  const defaultOrders = useUsersStore(
    (state) => state.applicationSettings.defaultOrders
  );
  const defaultMarket = useUsersStore(
    (state) => state.applicationSettings.defaultMarket
  );

  const [orderDisplay, changeOrderDisplay] = useState(
    !props.state.activeJob.layout.localOrderDisplay
      ? defaultOrders
      : props.state.activeJob.layout.localOrderDisplay
  );

  const [marketDisplay, changeMarketDisplay] = useState(
    !props.state.activeJob.layout.localMarketDisplay
      ? defaultMarket
      : props.state.activeJob.layout.localMarketDisplay
  );
  const deviceNotMobile = useMediaQuery((theme) => theme.breakpoints.up("sm"));

  switch (deviceNotMobile) {
    case true:
      return (
        <Purchasing_StandardLayout_EditJob
          {...props}
          orderDisplay={orderDisplay}
          changeOrderDisplay={changeOrderDisplay}
          marketDisplay={marketDisplay}
          changeMarketDisplay={changeMarketDisplay}
        />
      );

    case false:
      return (
        <Purchasing_StandardLayout_EditJob
          {...props}
          orderDisplay={orderDisplay}
          changeOrderDisplay={changeOrderDisplay}
          marketDisplay={marketDisplay}
          changeMarketDisplay={changeMarketDisplay}
        />
      );
    default:
      return (
        <Purchasing_StandardLayout_EditJob
          {...props}
          orderDisplay={orderDisplay}
          changeOrderDisplay={changeOrderDisplay}
          marketDisplay={marketDisplay}
          changeMarketDisplay={changeMarketDisplay}
        />
      );
  }
}
