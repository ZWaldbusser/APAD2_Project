import { users } from "../services";
import { useRead } from "../hooks/useRead";
import { WorkspaceContext } from "./WorkspaceContext";
import { agencyNames, isIdentifier } from "../projectContext";

async function loadProfile() {
  // Do not use the legacy dev-user fallback as identity or agency evidence.
  const res = await users.me();
  if (!res.ok) throw new Error("Profile unavailable");
  const profile = await res.json();
  const id = profile.id ?? profile.user_id;
  if (!isIdentifier(id)) throw new Error("Missing user ID");
  const agency = profile.agencyCode ?? profile.agency_code;
  return {
    id: String(id),
    name:
      [profile.userid, profile.username].find(
        (value) => typeof value === "string" && value.trim() !== "",
      ) || "Account",
    agencyCode: Object.hasOwn(agencyNames, agency) ? agency : null,
  };
}

export default function WorkspaceProvider({ children }) {
  const profile = useRead(loadProfile, "profile");
  return (
    <WorkspaceContext.Provider value={profile}>
      {children}
    </WorkspaceContext.Provider>
  );
}
