import { createFileRoute } from "@tanstack/react-router";
import Accounts from "../../Components/Accounts/Accounts";

export const Route = createFileRoute("/_protected/accounts")({
  staticData: { audience: "private" },
  component: Accounts,
});
