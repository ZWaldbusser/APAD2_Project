import { getProjectFixture } from "./preview";

export default function MockScenarioPicker() {
  return (
    <label className="workspace-fixture-picker">
      Review scenario
      <select
        defaultValue={getProjectFixture()}
        onChange={(event) => {
          sessionStorage.setItem("haas-project-fixture", event.target.value);
          window.location.reload();
        }}
      >
        <option value="standard">Standard data</option>
        <option value="empty">Empty project list</option>
        <option value="unavailable">Projects unavailable</option>
        <option value="not-found">Project not found</option>
      </select>
    </label>
  );
}
