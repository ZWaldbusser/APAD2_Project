import { useEffect, useState } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { users, projects, hardware } from "../services";

function CreateProject() {
  const [projectID, setProjectID] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
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

  // Availability check state
  const [idStatus, setIdStatus] = useState("idle"); // idle | checking | available | taken
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUser() {
      const user = await users.getCurrentUser();
      if (!user) {
        navigate("/login");
        return;
      }
      setOwner(user.id);
    }
    loadUser();
  }, [navigate]);

  // Debounced uniqueness check whenever projectID changes
  useEffect(() => {
    if (!projectID || projectCreated) {
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        // Backend should expose a cheap existence check.
        // e.g. GET /api/projects/:id returns 404 if free, 200 if taken.
        const res = await projects.getProject(projectID);
        if (!active) return;
        if (res.status === 404) {
          setIdStatus("available");
        } else if (res.ok) {
          setIdStatus("taken");
        } else {
          // Unexpected error — don't block the user, let submit-time check catch it
          setIdStatus("idle");
        }
      } catch {
        if (active) setIdStatus("idle");
      }
    }, 400); // debounce delay

    return () => { active = false; clearTimeout(timeoutId); };
  }, [projectID, projectCreated]);

  const handleCreate = async () => {
    if (submitting) return;
    setError("");

    if (!projectID) {
      setError("Project ID is required");
      return;
    }
    if (!/^[A-Za-z0-9_.:@-]{1,100}$/.test(projectID)) {
      setError("Project ID must be 1–100 characters using letters, numbers, _, ., :, @, or -.");
      return;
    }
    if (idStatus === "taken") {
      setError("Project ID must be unique");
      return;
    }

    const selectedHardware = hardwareList.filter((item) => Number(quantities[item._id] || 0) > 0 && !allocatedIds.includes(item._id));
    if (hardwareList.some((item) => {
      if (allocatedIds.includes(item._id)) return false;
      const quantity = Number(quantities[item._id] || 0);
      const unallocated = item.unallocated ?? Math.max(item.total - item.reserved, 0);
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
          projectID,
          name: projectName,
          description,
        });
        const data = await res.json();

        if (!res.ok) {
          // Backend is the final source of truth for uniqueness —
          // handle the race where someone else grabbed the ID between
          // the check above and this submit.
          if (res.status === 409) {
            setIdStatus("taken");
            setError("Project ID must be unique");
          } else {
            setError(data.error || "Could not create project");
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
    taken: "Project ID must be unique",
  }[idStatus];

  const idHelperClass = {
    idle: "",
    checking: "helper-text",
    available: "helper-text success-text",
    taken: "error-text",
  }[idStatus];

  const canSubmit = owner && projectID && idStatus !== "taken" && idStatus !== "checking" && !hardwareLoading && !hardwareError && !submitting;

  return (
    <div>
      <main className="login-page">
        <div className="login-box create-project-box">
          <h1>Create Project</h1>

          <label>Project ID</label>
          <input
            type="text"
            placeholder="Enter a unique project ID"
            value={projectID}
            disabled={submitting || projectCreated}
            maxLength={100}
            onChange={(e) => {
              const id = e.target.value.trim();
              setProjectID(id);
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
            placeholder="Enter description"
            value={description}
            disabled={submitting || projectCreated}
            onChange={(e) => setDescription(e.target.value)}
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
