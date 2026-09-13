import { useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Link,
  TextField,
  Typography,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import VirtualisedListbox from "../../../../Styled Components/autocomplete/virtualisedListbox";
import MarketGroupIcon from "../../../../Styled Components/Avatar/MarketGroupIcon";

import ContentDialogue, {
  DialogueCloseAction,
} from "../../../../Styled Components/Dialogue/ContentDialogue";
import {
  useAncestorPath,
  useMarketGroupChildren,
  useMarketGroupTree,
} from "../../../../Hooks/Static/useMarketGroups";
import { ancestorPathIn } from "../../../../Functions/MarketData/marketGroupData";

/**
 * Every group as one searchable row, each with where it sits.
 *
 * Built from the tree rather than fetched: a reader who knows the name should not
 * have to browse to it, and 2,000 names is a list the browser can filter without
 * help. The path is what tells two similarly named groups apart.
 *
 * @param {Object<string, {name: string, parent_id?: number}>} groups
 * @returns {Array<{id: number, name: string, within: string}>}
 */
function searchableGroups(groups) {
  return Object.keys(groups)
    .map((key) => {
      const id = Number(key);
      const path = ancestorPathIn(groups, id);
      return {
        id,
        name: groups[key].name,
        iconTypeID: groups[key].icon_type_id,
        within: path
          .slice(0, -1)
          .map((step) => step.name)
          .join(" › "),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Choosing a market group to price against.
 *
 * Browsing and searching both, because they answer different questions: a reader
 * who knows "Minerals" types it, and one who does not knows it is somewhere under
 * materials. The tree is six deep at most, so a drill is never long.
 *
 * **Any level is choosable.** A default set on a group covers everything beneath
 * it, so picking "Materials" prices minerals, salvage and moon goo at once —
 * which is the point of the rung walking ancestors, and the reason this does not
 * make a reader reach a leaf.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {(groupID: number) => void} props.onChoose
 * @param {string} props.noun - What this side prices, for the title
 */
function MarketGroupPicker({ open, onClose, onChoose, noun }) {
  const { isLoading, isError, error } = useMarketGroupTree();

  return (
    <ContentDialogue
      open={open}
      onClose={onClose}
      title={`Price a market group — ${noun}`}
      componentName="MarketGroupPicker"
      useAppShellDesign
      maxWidth="sm"
      fullWidth
      isLoading={isLoading}
      isError={isError}
      error={error}
      loadingMessage="Reading market groups…"
      actions={<DialogueCloseAction onClose={onClose} />}
    >
      {/* The body, not the frame: every group is walked to build the search, and
          the shell renders nothing until it is open, so doing that here costs
          nothing while nobody is looking at it. Two of these sit on the settings
          page, one per side. */}
      <PickerBody onChoose={onChoose} onClose={onClose} />
    </ContentDialogue>
  );
}

/**
 * Browsing and searching, mounted only while the dialogue is open.
 *
 * Keeping its own `parentID` means a reader who closes mid-browse opens again at
 * the roots rather than wherever they left off — the shell unmounts this on
 * close, so that is free rather than something to reset.
 *
 * @param {object} props
 * @param {(groupID: number) => void} props.onChoose
 * @param {Function} props.onClose
 */
function PickerBody({ onChoose, onClose }) {
  const [parentID, setParentID] = useState(null);
  const virtualizerControlRef = useRef(null);
  const { groups } = useMarketGroupTree();
  const children = useMarketGroupChildren(parentID);
  const path = useAncestorPath(parentID);

  const options = useMemo(() => searchableGroups(groups), [groups]);

  const choose = (groupID) => {
    onChoose(groupID);
    onClose();
  };

  return (
    <>
      <Autocomplete
        options={options}
        getOptionLabel={(option) => option.name}
        onChange={(_event, option) => option && choose(option.id)}
        // Two thousand groups: a plain listbox mounts every one of them, which is
        // what this shared listbox exists to avoid.
        slotProps={{
          listbox: { component: VirtualisedListbox, virtualizerControlRef },
        }}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <MarketGroupIcon typeID={option.iconTypeID} size={24} />
            <ListItemText
              primary={option.name}
              secondary={option.within}
              sx={{ marginLeft: 1 }}
            />
          </Box>
        )}
        renderInput={(params) => (
          <TextField {...params} label="Search a group" size="small" />
        )}
        sx={{ marginBottom: 2 }}
      />

      <Breadcrumbs sx={{ marginBottom: 1 }}>
        <Link
          component="button"
          type="button"
          underline="hover"
          onClick={() => setParentID(null)}
        >
          All groups
        </Link>
        {path.map((step) => (
          <Link
            key={step.id}
            component="button"
            type="button"
            underline="hover"
            onClick={() => setParentID(step.id)}
          >
            {step.name}
          </Link>
        ))}
      </Breadcrumbs>

      {/* The level itself is a choice, not only what sits under it. */}
      {parentID ? (
        <Button
          size="small"
          onClick={() => choose(parentID)}
          sx={{ marginBottom: 1 }}
        >
          Price “{path.at(-1)?.name}” and everything under it
        </Button>
      ) : null}

      <List dense disablePadding>
        {children.map((group) => (
          <ListItemButton
            key={group.id}
            onClick={() =>
              group.hasChildren ? setParentID(group.id) : choose(group.id)
            }
          >
            <MarketGroupIcon typeID={group.iconTypeID} size={24} />
            <ListItemText
              primary={group.name}
              secondary={group.hasTypes ? "Holds items" : undefined}
              sx={{ marginLeft: 1 }}
            />
            {group.hasChildren ? <ChevronRightIcon fontSize="small" /> : null}
          </ListItemButton>
        ))}
        {children.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Nothing sits under this group.
          </Typography>
        ) : null}
      </List>
    </>
  );
}

export default MarketGroupPicker;
