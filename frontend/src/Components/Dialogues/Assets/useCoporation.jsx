import { FormControlLabel, FormGroup, Switch } from "@mui/material";

export default function UseCorporationSelector_AssetsDialog(props) {
  const { state, actions } = props;

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
