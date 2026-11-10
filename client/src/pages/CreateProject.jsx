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
    if (!projectId || projectCreated) {
      setIdStatus("idle");
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const res = await projects.getProject(projectId, orgId);
        if (!active) return;
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

    return () => { active = false; clearTimeout(timeoutId); };
  }, [projectId, orgId, projectCreated]);

  const handleCreate = async () => {
    if (submitting) return;
    setError("");

    if (!projectId) {
      setError("Project ID is required");
      return;
    }
    if (!/^[A-Za-z0-9_.:@-]{1,100}$/.test(projectId)) {
      setError("Project ID must be 1–100 characters using letters, numbers, _, ., :, @, or -.");
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

    const getId = (item) => item._id || item.id;
    const selectedHardware = hardwareList.filter((item) => Number(quantities[getId(item)] || 0) > 0 && !allocatedIds.includes(getId(item)));
    if (hardwareList.some((item) => {
      if (allocatedIds.includes(getId(item))) return false;
      const quantity = Number(quantities[getId(item)] || 0);
      const unallocated = item.unallocated ?? Math.max((item.total ?? item.capacity ?? 0) - (item.reserved ?? 0), 0);
      return !Number.isInteger(quantity) || quantity < 0 || quantity > Math.min(unallocated, 1000000);
    })) {
      setError("Allocation quantities must be whole numbers within the unallocated stock.");
      return;
    }

    setSubmitting(true);
    let created = projectCreated;
    try {
      if (!created) {
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
          return;
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
          const current = currentHardware.find((hw) => (hw._id || hw.id) === getId(item));
          if (!current) throw new Error("Hardware is no longer available");
          await hardware.responseData(await hardware.setAllocation({
            hardwareId: getId(item),
            projectId,
            expectedVersion: current.version,
            quantity: Number(quantities[getId(item)]),
            reason: `Initial allocation for project ${projectId}`,
          }));
          setAllocatedIds((ids) => [...ids, getId(item)]);
        } catch (err) {
          failures.push(`${item.name}: ${err.message}`);
        }
      }
      if (failures.length) {
        setError(`Project created. Some allocations failed: ${failures.join("; ")}. Retry to allocate the remaining hardware.`);
        return;
      }

      navigate("/projects");
    } catch (err) {
      setError(`${created ? "Project created. Retry the remaining allocations. " : ""}${err.message || "Could not reach server"}`);
    } finally {
      setSubmitting(false);
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

  const canSubmit = owner && projectId && projectName && budget !== "" && idStatus !== "taken" && idStatus !== "checking" && !hardwareLoading && !hardwareError && !submitting;

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
            disabled={submitting || projectCreated}
            maxLength={100}
            onChange={(e) => {
              const id = e.target.value.trim();
              setProjectId(id);
              setIdStatus(id ? "checking" : "idle");
            }}
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
            disabled={submitting || projectCreated}
            onChange={(e) => setProjectDesc(e.target.value)}
          />

          <label>Budget (USD)</label>
          <input
            type="number"
            placeholder="Enter budget"
            min="0"
            value={budget}
            disabled={submitting || projectCreated}
            onChange={(e) => setBudget(e.target.value)}
          />

          <h2>Hardware Allocation</h2>
          <p>Enter the quantity to allocate for each hardware item. Leave 0 for items you do not need.</p>
          {hardwareLoading && <p role="status">Loading hardware...</p>}
          {hardwareError && <div role="alert"><p className="error-text">{hardwareError}</p><button onClick={loadHardware}>Retry loading hardware</button></div>}
          {!hardwareLoading && !hardwareError && hardwareList.length === 0 && <p>No hardware is available.</p>}
          {hardwareList.map((item) => {
            const itemId = item._id || item.id;
            const unallocated = item.unallocated ?? Math.max((item.total ?? item.capacity ?? 0) - (item.reserved ?? 0), 0);
            const allocated = allocatedIds.includes(itemId);
            return (
              <div key={itemId}>
                <label htmlFor={`allocation-${itemId}`}>{item.name} ({item.asset_tag || itemId}) — {unallocated} unallocated{allocated ? " — Allocated" : ""}</label>
                <input
                  id={`allocation-${itemId}`}
                  type="number"
                  min="0"
                  max={Math.min(unallocated, 1000000)}
                  step="1"
                  value={quantities[itemId] ?? 0}
                  disabled={submitting || allocated}
                  onChange={(e) => setQuantities({ ...quantities, [itemId]: e.target.value })}
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
