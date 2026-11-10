import { useEffect, useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users, projects, hardware } from "../services";

const ORG_OPTIONS = [
  { code: "AUS", label: "City of Austin" },
  { code: "DAL", label: "City of Dallas" },
  { code: "TEX", label: "State of Texas" },
];

function CreateProject() {
  const [orgId, setOrgId] = useState("AUS");
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [budget, setBudget] = useState("");
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState("");
  const [hardwareList, setHardwareList] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [hardwareLoading, setHardwareLoading] = useState(true);
  const [hardwareError, setHardwareError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);
  const [allocatedIds, setAllocatedIds] = useState([]);

  const loadHardware = async () => {
    setHardwareLoading(true);
    setHardwareError("");
    try {
      setHardwareList(await hardware.getAllHardware());
    } catch (err) {
      setHardwareError(err.message || "Could not load hardware");
    } finally {
      setHardwareLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    hardware.getAllHardware().then((items) => {
      if (active) setHardwareList(items);
    }).catch((err) => {
      if (active) setHardwareError(err.message || "Could not load hardware");
    }).finally(() => {
      if (active) setHardwareLoading(false);
    });
    return () => { active = false; };
  }, []);

  const [idStatus, setIdStatus] = useState("idle");
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const user = await users.getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setOwner(user);
    }
    loadUser();
  }, [navigate]);

  useEffect(() => {
    if (!projectId) {
      setIdStatus("idle");
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const res = await projects.getProject(projectId, orgId);
        if (res.status === 404) {
          setIdStatus("available");
        } else if (res.ok) {
          setIdStatus("taken");
        } else {
          setIdStatus("idle");
        }
      } catch {
        if (active) setIdStatus("idle");
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [projectId, orgId]);

  const handleCreate = async () => {
    if (submitting) return;
    setError("");

    if (!projectId) {
      setError("Project ID is required");
      return;
    }
    if (!projectName) {
      setError("Project Name is required");
      return;
    }
    if (idStatus === "taken") {
      setError("Project ID already exists for this agency");
      return;
    }
    if (budget === "" || Number(budget) < 0) {
      setError("Budget must be 0 or greater");
      return;
    }

    try {
      const res = await projects.createProject({
        orgId,
        projectId,
        projectName,
        projectDesc,
        creatorId: owner.userid || owner.id,
        budget: Number(budget),
        hardwareList: [],
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setIdStatus("taken");
          setError("Project ID already exists for this agency");
        } else if (res.status === 422) {
          const msg = Array.isArray(data.detail)
            ? data.detail.map((d) => d.msg).join(", ")
            : data.errorMessage || "Validation error";
          setError(msg);
        } else {
          setError(data.errorMessage || "Could not create project");
        }

        created = true;
        setProjectCreated(true);
        setIdStatus("idle");
      }

      // Refresh versions for each attempt, including retries after partial failure.
      const currentHardware = selectedHardware.length ? await hardware.getAllHardware() : [];
      const failures = [];
      for (const item of selectedHardware) {
        try {
          const current = currentHardware.find((hw) => hw._id === item._id);
          if (!current) throw new Error("Hardware is no longer available");
          await hardware.responseData(await hardware.setAllocation({
            hardwareId: item._id,
            projectId: projectID,
            expectedVersion: current.version,
            quantity: Number(quantities[item._id]),
            reason: `Initial allocation for project ${projectID}`,
          }));
          setAllocatedIds((ids) => [...ids, item._id]);
        } catch (err) {
          failures.push(`${item.name}: ${err.message}`);
        }
      }
      if (failures.length) {
        setError(`Project created. Some allocations failed: ${failures.join("; ")}. Retry to allocate the remaining hardware.`);
        return;
      }

      navigate("/projects");
    } catch {
      setError("Could not reach server");
    }
  };

  const idHelperText = {
    idle: "",
    checking: "Checking availability...",
    available: "Available",
    taken: "Project ID already exists for this agency",
  }[idStatus];

  const idHelperClass = {
    idle: "",
    checking: "helper-text",
    available: "helper-text success-text",
    taken: "error-text",
  }[idStatus];

  const canSubmit = owner && projectId && projectName && budget !== "" && idStatus !== "taken" && idStatus !== "checking";

  return (
    <div>
      <main className="login-page">
        <div className="login-box create-project-box">
          <h1>Create Project</h1>

          <label>Agency</label>
          <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {ORG_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>{o.label} ({o.code})</option>
            ))}
          </select>

          <label>Project ID</label>
          <input
            type="text"
            placeholder="Enter a unique project ID"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value.trim())}
          />
          {idHelperText && <p className={idHelperClass}>{idHelperText}</p>}

          <label>Project Name</label>
          <input
            type="text"
            placeholder="Enter project name"
            value={projectName}
            disabled={submitting || projectCreated}
            onChange={(e) => setProjectName(e.target.value)}
          />

          <label>Description</label>
          <input
            type="text"
            placeholder="Enter description (optional)"
            value={projectDesc}
            onChange={(e) => setProjectDesc(e.target.value)}
          />

          <label>Budget (USD)</label>
          <input
            type="number"
            placeholder="Enter budget"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />

          <h2>Hardware Allocation</h2>
          <p>Enter the quantity to allocate for each hardware item. Leave 0 for items you do not need.</p>
          {hardwareLoading && <p role="status">Loading hardware...</p>}
          {hardwareError && <div role="alert"><p className="error-text">{hardwareError}</p><button onClick={loadHardware}>Retry loading hardware</button></div>}
          {!hardwareLoading && !hardwareError && hardwareList.length === 0 && <p>No hardware is available.</p>}
          {hardwareList.map((item) => {
            const unallocated = item.unallocated ?? Math.max(item.total - item.reserved, 0);
            const allocated = allocatedIds.includes(item._id);
            return (
              <div key={item._id}>
                <label htmlFor={`allocation-${item._id}`}>{item.name} ({item.asset_tag || item._id}) — {unallocated} unallocated{allocated ? " — Allocated" : ""}</label>
                <input
                  id={`allocation-${item._id}`}
                  type="number"
                  min="0"
                  max={Math.min(unallocated, 1000000)}
                  step="1"
                  value={quantities[item._id] ?? 0}
                  disabled={submitting || allocated}
                  onChange={(e) => setQuantities({ ...quantities, [item._id]: e.target.value })}
                />
              </div>
            );
          })}

          {error && <p className="error-text" role="alert">{error}</p>}

          <button onClick={handleCreate} disabled={!canSubmit}>{submitting ? "Saving..." : projectCreated ? "Retry Allocations" : "Create Project"}</button>
          <button onClick={() => navigate("/projects")} disabled={submitting}>{projectCreated ? "Back to Projects" : "Cancel"}</button>
        </div>
      </main>
    </div>
  );
}

export default CreateProject;
