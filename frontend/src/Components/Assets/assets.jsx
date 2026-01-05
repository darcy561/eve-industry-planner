import { AssetTypeSelectPanel } from "./AssetTypeSelect";
import DefaultPageLayout from "../../Styled Components/defaultPageLayout";
import useUsersStore from "../../Zustand/usersStore";

export default function AssetLibrary() {
  const parentUser = useUsersStore.getState().users.actions.findParentUser();

  return (
    <DefaultPageLayout>
      <AssetTypeSelectPanel parentUser={parentUser} />
    </DefaultPageLayout>
  );
}
