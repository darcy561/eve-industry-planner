import useUsersStore from "../../Zustand/usersStore";
import { SectionPanel } from "../../Styled Components/Paper/SectionPanel";
import CorporationEsiSection from "./CorporationEsiSection";

/**
 * The corporations the account's characters belong to, and what is held for each.
 *
 * A section of its own rather than a block under the roster: a corporation is not a linked
 * character, and its data is fetched once for the corporation rather than once per member.
 */
export function CorporationsPanel() {
  const corporations = useUsersStore((state) => state.account.corporations);

  if (!corporations?.length) return null;

  return (
    <SectionPanel
      title="Corporations"
      subtitle="Fetched once for the corporation, through whichever of your characters holds the role."
      componentName="Corporations"
    >
      <CorporationEsiSection />
    </SectionPanel>
  );
}
