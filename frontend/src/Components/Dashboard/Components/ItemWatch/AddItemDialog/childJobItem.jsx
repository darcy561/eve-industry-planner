import { Typography, Grid } from "@mui/material";


export function ChildJobItem({ job, itemToModify, updateItemToModify }) {
  return (
    <Grid
      container
      align="center"
      sx={{
        marginBottom: "10px",
        paddingLeft: "5px",
        paddingRight: "5px",
      }}
      onClick={() => {
        updateItemToModify(job.itemID);
      }}
      size={{
        xs: 6,
        sm: 3
      }}>
      <Grid align="center" sx={{ minHeight: "35px", minWidth: "35px" }} size={12}>
        <img
          src={`https://images.evetech.net/types/${job.itemID}/icon?size=32`}
          alt=""
        />
      </Grid>
      <Grid align="center" size={12}>
        <Typography
          align="center"
          variant="caption"
          color={itemToModify === job.itemID ? "primary" : null}
          sx={{
            textDecoration: itemToModify === job.itemID ? "underline" : null,
          }}
        >
          {job.name}
        </Typography>
      </Grid>
    </Grid>
  );
}
