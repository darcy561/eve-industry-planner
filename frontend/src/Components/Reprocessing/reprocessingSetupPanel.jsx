import { useState } from "react";
import { Box, Link, Stack, Typography } from "@mui/material";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import InsetSurface from "../../Styled Components/Paper/InsetSurface";
import {
  Disclosure,
  FigureCaption,
  FigureRow,
} from "../../Styled Components/Typography/figures";
import StatusChip, {
  STATUS_TONE,
} from "../../Styled Components/Chip/statusChip";
import { FormField } from "../../Styled Components/Textfield/FormField";
import {
  StructureField,
  fieldsFor,
} from "../../Styled Components/Structure/structureFields";
import { useStructureFieldContext } from "../../Styled Components/Structure/useStructureFieldContext";
import { SkillLevelRow } from "../../Styled Components/Skills/SkillLevelRow";
import AssignUsersSelect from "../../Styled Components/Select/users";
import CustomStructureSelect from "../../Styled Components/Select/customStructure";
import { useItemList } from "../../Hooks/Static/useItems";
import useUsersStore from "../../Zustand/usersStore";
import { itemNameFrom } from "../../Functions/Static/items";
import {
  getImplantFromID,
  getStructureInfoFromID,
  getSystemTypeFromID,
} from "../../Functions/Industry Facilities/getStructureInfo";
import { rigSlotLabel } from "../../Functions/Industry Facilities/rigs";
import {
  fieldsForKind,
  structureFromDocument,
} from "../../Functions/Custom Structures/customStructure";
import { changeStructure } from "../../Functions/Custom Structures/structureChanges";
import { yieldFor } from "../../Functions/Reprocessing/engine/reprocessingSetup";
import {
  allReprocessingSkillIDs,
  yieldKindsFor,
  itemTypeRaisedBy,
  reprocessingSkillIDsFor,
} from "../../Functions/Reprocessing/reprocessingSkills";
import {
  jobTypes,
  reprocessingItemTypeLabels,
} from "../../Context/defaultValues";
import { reprocessingDirections } from "./Hooks/reprocessingReducer";

const FIELD_ORDER = [
  "structureType",
  "systemType",
  "rigSlot1",
  "rigSlot2",
  "implant",
  "tax",
];
const REPROCESSING_FIELDS = fieldsFor(
  fieldsForKind(jobTypes.reprocessing),
).toSorted((a, b) => FIELD_ORDER.indexOf(a.id) - FIELD_ORDER.indexOf(b.id));

/**
 * The setup the page reprocesses in — structure, rigs, implant, tax, character and the skills the
 * input uses — with the yield it gives; From minerals shows a summary and keeps the controls folded.
 */
export default function ReprocessingSetupPanel({
  pageState,
  pageActions,
  skills,
  trainedSkills,
  skillsStatus,
  answers,
}) {
  const characters = useUsersStore((state) => state.account.characters);
  const { records: itemRecords } = useItemList();
  const [showAllSkills, setShowAllSkills] = useState(false);
  const structure = pageState.currentStructure;
  const character = characters?.find(
    (entry) => entry.CharacterHash === pageState.selectedUser,
  );

  const listedSkills = showAllSkills
    ? allReprocessingSkillIDs()
    : reprocessingSkillIDsFor(answers.itemTypeIDs);
  const skillName = (id) => itemNameFrom(id, itemRecords);

  const controls = (
    <SetupControls
      structure={structure}
      pageState={pageState}
      pageActions={pageActions}
      trainedSkills={trainedSkills}
      listedSkills={listedSkills}
      skillName={skillName}
      showAllSkills={showAllSkills}
      onShowAllSkills={() => setShowAllSkills((shown) => !shown)}
      characterName={character?.CharacterName}
      skillsStatus={skillsStatus}
      hasInput={Boolean(pageState.pastes[pageState.direction].committed)}
    />
  );

  return (
    <SectionPanel title="Reprocessing setup">
      {pageState.direction === reprocessingDirections.fromMinerals ? (
        <>
          <SetupSummary structure={structure} character={character} />
          <Disclosure
            heading
            label="Structure, rigs, implant and the skills this ore uses"
          >
            {controls}
          </Disclosure>
        </>
      ) : (
        controls
      )}
      <FigureCaption>Yield with this setup</FigureCaption>
      <InsetSurface>
        {yieldKindsFor(answers.itemTypeIDs).map(({ itemType, skillIDs }) => (
          <YieldRow
            key={itemType}
            itemType={itemType}
            skillIDs={skillIDs}
            setup={answers.setup}
            skills={skills}
            skillName={skillName}
          />
        ))}
        <FigureRow
          label="Tax"
          value={`${Number(structure.tax ?? 0).toFixed(1)}%`}
        />
      </InsetSurface>
    </SectionPanel>
  );
}

/**
 * One kind's yield: a single figure, or the span where its items' processing skills differ, and the
 * skill below V that holds it back.
 */
function YieldRow({ itemType, skillIDs, setup, skills, skillName }) {
  const yields = skillIDs.map((skillID) =>
    yieldFor(setup, { itemType, reprocessingSkill: skillID }),
  );
  const low = Math.min(...yields);
  const high = Math.max(...yields);
  const short = skillIDs.filter((skillID) => (skills[skillID] ?? 0) < 5);
  return (
    <FigureRow
      label={reprocessingItemTypeLabels[itemType]}
      sublabel={
        short.length === 1
          ? `${skillName(short[0])} at ${skills[short[0]] ?? 0}`
          : short.length > 1
            ? `${short.length} skills below V`
            : null
      }
      value={
        low === high
          ? `${low.toFixed(1)}%`
          : `${low.toFixed(1)}–${high.toFixed(1)}%`
      }
    />
  );
}

/** One line each for the structure and its rigs, and the character, implant and tax, for a setup folded away. */
function SetupSummary({ structure, character }) {
  const jobType = jobTypes.reprocessing;
  const structureLabel =
    getStructureInfoFromID(jobType, structure.structureType)?.label ?? "";
  const securityLabel =
    getSystemTypeFromID(jobType, structure.systemType)?.label ?? "";
  const implant = getImplantFromID(jobType, structure.implant);

  return (
    <InsetSurface>
      <FigureRow
        label={`${structureLabel} · ${securityLabel}`}
        value={rigSlotLabel(jobType, structure.rigSlot1, structure.rigSlot2)}
      />
      <FigureRow
        label={
          [character?.CharacterName, implant?.id ? implant.label : null]
            .filter(Boolean)
            .join(" · ") || "No character"
        }
        value={`tax ${Number(structure.tax ?? 0).toFixed(1)}%`}
      />
    </InsetSurface>
  );
}

/** The setup's own controls, and the skills the input uses inside a disclosure. */
function SetupControls({
  structure,
  pageState,
  pageActions,
  trainedSkills,
  listedSkills,
  skillName,
  showAllSkills,
  onShowAllSkills,
  characterName,
  skillsStatus,
  hasInput,
}) {
  const isLoggedIn = useUsersStore((state) => state.account.isLoggedIn);
  const context = useStructureFieldContext({
    structure,
    jobType: jobTypes.reprocessing,
    change: (fields) =>
      pageActions.setCurrentStructure(changeStructure(structure, fields)),
  });

  return (
    <Stack spacing={1.5}>
      {isLoggedIn ? (
        <FormField title="Saved structure">
          <CustomStructureSelect
            {...context.fieldProps}
            value={structure.id}
            jobType={jobTypes.reprocessing}
            onChange={(selectedEntry) =>
              pageActions.setCurrentStructure(
                structureFromDocument(
                  useUsersStore
                    .getState()
                    .applicationSettings.actions.getCustomStructureWithID(
                      selectedEntry,
                    ),
                ),
              )
            }
          />
        </FormField>
      ) : null}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {REPROCESSING_FIELDS.map((entry) => (
          <StructureField
            key={entry.id}
            entry={entry}
            context={context}
            compact
          />
        ))}
      </Box>
      {isLoggedIn ? (
        <FormField title="Character">
          <AssignUsersSelect
            {...context.fieldProps}
            value={pageState.selectedUser}
            onChange={(hash) => pageActions.setSelectedUser(hash)}
          />
        </FormField>
      ) : null}
      <Disclosure
        key={hasInput ? "read" : "empty"}
        heading
        defaultOpen={hasInput}
        label={
          hasInput
            ? `Skills these items use${characterName ? ` · ${characterName}` : ""}`
            : `Skills${characterName ? ` · ${characterName}'s trained levels` : ""}`
        }
      >
        {skillsStatus.isLoading ? (
          <Typography variant="caption" color="text.secondary" component="p">
            Reading {characterName ?? "the character"}&apos;s skills
          </Typography>
        ) : null}
        {skillsStatus.isError ? (
          <StatusChip
            tone={STATUS_TONE.WARN}
            label={`Could not read ${characterName ?? "the character"}'s skills; set them here`}
          />
        ) : null}
        {listedSkills.map((id) => {
          const trained = trainedSkills[id] ?? 0;
          const proposed = pageState.skillOverrides[id] ?? null;
          const itemType = itemTypeRaisedBy(id);
          return (
            <SkillLevelRow
              key={id}
              name={skillName(id)}
              caption={
                itemType === undefined
                  ? "Every yield"
                  : `${reprocessingItemTypeLabels[itemType]} yield`
              }
              level={trained}
              proposed={proposed}
              onPropose={(level) => pageActions.setSkillLevel(id, level)}
              value={
                proposed === null ? String(trained) : `${trained} → ${proposed}`
              }
            />
          );
        })}
        <Link
          component="button"
          type="button"
          variant="body2"
          onClick={onShowAllSkills}
          sx={{ mt: 1 }}
        >
          {showAllSkills
            ? "Show only the skills this input uses"
            : "Show all reprocessing skills"}
        </Link>
      </Disclosure>
    </Stack>
  );
}
