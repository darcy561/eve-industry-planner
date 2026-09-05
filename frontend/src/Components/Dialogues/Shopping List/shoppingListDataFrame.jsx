import { Typography, Grid } from "@mui/material";

import { STANDARD_TEXT_FORMAT } from "../../../Context/defaultValues";
import { ShoppingListItem_ShoppingListDialogue } from "./shoppingListItem";

export function ListDataFrame_ShoppingListDialogue({
  state,
  actions,
}) {
  if (state.isLoading || !state.shoppingList) return null;
  return state.shoppingList.items.some((item) => item.isVisible) ? (
    <ListItems state={state} actions={actions} />
  ) : (
    <EmptyList />
  );
}

function ListItems({ state, actions }) {
  const visibleItems = state.shoppingList.items.filter((item) => item.isVisible);
  
  return (
    <Grid container>
      {visibleItems.map((item, index) => {
        return (
          <ShoppingListItem_ShoppingListDialogue
            key={item.typeID}
            item={item}
            actions={actions}
            isEven={index % 2 === 0}
          />
        );
      })}
    </Grid>
  );
}

function EmptyList() {
  return (
    <Grid container>
      <Grid size={12}>
        <Typography align="center" sx={{ typography: STANDARD_TEXT_FORMAT }}>
          No Items Required
        </Typography>
      </Grid>
    </Grid>
  );
}
