import { FormControlLabel, FormGroup, Switch } from "@mui/material";
import useUsersStore from "../../../Zustand/usersStore";

export default function UseCorporationSelector_AssetsDialog(props) {
  const { state, actions } = props;
  const corporations = useUsersStore((state) => state.users.corporations);

  return (
    <FormGroup sx={{ marginRight: "10px" }}>
      <FormControlLabel
        label="Toggle between character and corporation assets"
        labelPlacement="start"
        control={
          <Switch
            checked={state.useCorporationAssets}
            size="small"
            onChange={() => {
              actions.toggleUseCorporationAssets();
            }}
          />
        }
      />
    </FormGroup>
  );
}
