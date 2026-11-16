import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { projects, hardware } from "../services";
import { useWorkspace } from "../context/WorkspaceContext";
import { useRead } from "../hooks/useRead";
import { agencyNames, projectPath } from "../projectContext";
import WorkspaceState from "../components/WorkspaceState";
import "../styles/ProjectCreation.css";

const hardwareId = (item) => item.id || item._id;
const stock = (item) =>
  item.unallocated ??
  Math.max((item.total ?? item.capacity ?? 0) - (item.reserved ?? 0), 0);
const allocationLimit = (item) => Math.min(stock(item), 1000000);
const fieldLabels = {
  projectId: "Project ID",
  projectName: "Project name",
  projectDesc: "Description",
  budget: "Budget (USD)",
};

function fieldError(field, value) {
  if (field === "projectId") {
    if (!value.trim()) return "Enter a project ID.";
    if (!/^[A-Za-z0-9_.:@-]{1,100}$/.test(value))
      return "Use 1–100 letters, numbers, _, ., :, @, or -.";
  }
  if (field === "projectName" && !value.trim()) return "Enter a project name.";
  if (field === "projectDesc" && !value.trim())
    return "Describe the project's purpose.";
  // Preserve current whole-dollar behavior until partner precision is confirmed.
  if (
    field === "budget" &&
    (value === "" || !Number.isInteger(Number(value)) || Number(value) < 0)
  )
    return "Enter a whole-dollar budget of 0 or greater.";
  return "";
}

function Field({
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  kind = "input",
  ...props
}) {
  const Control = kind;
  return (
    <div className="creation-field">
      <label htmlFor={name}>{label}</label>
      <Control
        {...props}
        id={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [hint && `${name}-hint`, error && `${name}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {hint && (
        <p className="creation-hint" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="creation-field-error" id={`${name}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function CreationForm({ profile }) {
  const navigate = useNavigate();
  const [values, setValues] = useState({
    orgId: profile.agencyCode,
    projectId: "",
    projectName: "",
    projectDesc: "",
    budget: "",
  });
  const [quantities, setQuantities] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const summary = useRef(null);
  const saving = useRef(false);
  const savedRequest = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [complete, setComplete] = useState(false);
  const [allocatedIds, setAllocatedIds] = useState([]);
  const [idCheck, setIdCheck] = useState(null);
  const loadHardware = useCallback(() => hardware.getAllHardware(), []);
  const inventory = useRead(loadHardware, "creation-inventory");
  const catalog = inventory.value || [];
  const idKey = JSON.stringify([values.orgId, values.projectId]);
  const idStatus =
    created || !values.projectId
      ? "idle"
      : idCheck?.key === idKey
        ? idCheck.status
        : "checking";

  useEffect(() => {
    if (attempt) summary.current?.focus();
  }, [attempt]);
  useEffect(() => {
    if (
      !values.projectId ||
      created ||
      fieldError("projectId", values.projectId)
    )
      return;
    let active = true;
    const timer = setTimeout(async () => {
      let status = "unknown";
      try {
        const res = await projects.getProject(values.projectId, values.orgId);
        status =
          res.status === 404 ? "available" : res.ok ? "taken" : "unknown";
      } catch {
        /* Submission still receives authoritative service validation. */
      }
      if (active) setIdCheck({ key: idKey, status });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [values.projectId, values.orgId, created, idKey]);

  const change = (field) => (event) =>
    setValues((current) => ({
      ...current,
      [field]:
        field === "projectId" ? event.target.value.trim() : event.target.value,
    }));
  const blur = (field) => () =>
    setErrors((current) => {
      const next = { ...current },
        error = fieldError(field, values[field]);
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });

  const submit = async (event) => {
    event.preventDefault();
    if (saving.current) return;
    setMessage("");
    if (!created) {
      const invalid = {};
      for (const field of Object.keys(fieldLabels)) {
        const error = fieldError(field, values[field]);
        if (error) invalid[field] = error;
      }
      if (idStatus === "taken")
        invalid.projectId = `This ID already exists in ${values.orgId}. Choose another ID.`;
      for (const item of catalog) {
        const quantity = Number(quantities[hardwareId(item)] || 0);
        if (
          !Number.isInteger(quantity) ||
          quantity < 0 ||
          quantity > allocationLimit(item)
        )
          invalid[`allocation-${hardwareId(item)}`] =
            `Enter a whole number from 0 to ${allocationLimit(item)} for ${item.name}.`;
      }
      setErrors(invalid);
      if (Object.keys(invalid).length) {
        setAttempt((n) => n + 1);
        return;
      }
    }
    saving.current = true;
    setSubmitting(true);
    let projectExists = created;
    try {
      if (!projectExists) {
        const items = catalog
          .filter((item) => Number(quantities[hardwareId(item)] || 0) > 0)
          .map((item) => ({
            hardwareId: hardwareId(item),
            name: item.name,
            quantity: Number(quantities[hardwareId(item)]),
          }));
        const payload = {
          ...values,
          projectName: values.projectName.trim(),
          projectDesc: values.projectDesc.trim(),
          creatorId: profile.id,
          budget: Number(values.budget),
          hardwareList: items.map((item) => ({
            hardwareId: item.hardwareId,
            allocation: item.quantity,
          })),
        };
        const res = await projects.createProject(payload);
        const data = await res.json();
        if (!res.ok || data.success === false) {
          const detail = Array.isArray(data.detail)
            ? data.detail.map((item) => item.msg).join("; ")
            : data.errorMessage || data.error;
          setMessage(
            typeof detail === "string"
              ? detail
              : res.status === 409
                ? "These details conflict with an existing project. Check the ID and name."
                : "We couldn't create the project. Check the details and try again.",
          );
          setAttempt((n) => n + 1);
          return;
        }
        savedRequest.current = { ...payload, items };
        projectExists = true;
        setCreated(true);
      }
      const saved = savedRequest.current;
      const failures = await hardware.allocateProjectHardware({
        orgId: saved.orgId,
        projectId: saved.projectId,
        items: saved.items.filter(
          (item) => !allocatedIds.includes(item.hardwareId),
        ),
        onAllocated: (id) => setAllocatedIds((current) => [...current, id]),
      });
      if (failures.length) {
        setMessage(
          `Your project is saved. Retry only the remaining allocations: ${failures.join("; ")}`,
        );
        setAttempt((n) => n + 1);
      } else setComplete(true);
    } catch (error) {
      setMessage(
        `${projectExists ? "Your project is saved. Retry only the remaining allocations. " : "We couldn't confirm project creation. "}${error.message || "Please try again."}`,
      );
      setAttempt((n) => n + 1);
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  };

  if (complete)
    return (
      <section
        className="workspace-panel creation-success"
        aria-labelledby="creation-success-title"
      >
        <span className="creation-success-mark" aria-hidden="true">
          ✓
        </span>
        <p className="workspace-eyebrow">READY FOR YOUR TEAM</p>
        <h1 id="creation-success-title">Project created</h1>
        <p>
          <strong>{values.projectName.trim()}</strong> · {values.orgId} /{" "}
          {values.projectId}
        </p>
        <p>
          {allocatedIds.length
            ? "Your initial hardware allocations are saved."
            : "No initial hardware allocation was requested."}
        </p>
        <div className="creation-success-actions">
          <Link className="workspace-button" to={projectPath(values)}>
            View project
          </Link>
          <Link className="workspace-button secondary" to="/projects">
            Back to projects
          </Link>
        </div>
      </section>
    );

  const locked = submitting || created;
  const selectedItems = catalog.filter(
    (item) => Number(quantities[hardwareId(item)] || 0) > 0,
  );
  return (
    <>
      <div className="workspace-page-heading">
        <div>
          <p className="workspace-eyebrow">PLAN YOUR TEAM'S NEXT PROJECT</p>
          <h1>Create project</h1>
          <p>A clear purpose. The right resources. One shared workspace.</p>
        </div>
      </div>
      <form
        className="creation-form"
        aria-label="Create project"
        noValidate
        onSubmit={submit}
      >
        {(Object.keys(errors).length > 0 || message) && (
          <div
            ref={summary}
            className="creation-error-summary"
            role="alert"
            aria-label="Check project details"
            tabIndex={-1}
          >
            <h2>
              {created
                ? "Project saved · allocations need attention"
                : "Check project details"}
            </h2>
            {message && <p>{message}</p>}
            {Object.keys(errors).length > 0 && (
              <ul>
                {Object.entries(errors).map(([field, error]) => (
                  <li key={field}>
                    <a href={`#${field}`}>{error}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {created && (
          <p className="creation-saved-note" role="status">
            The project already exists. Completed allocations are marked below.
            Project details and requested quantities stay locked while you
            retry.
          </p>
        )}
        <div className="creation-grid">
          <fieldset
            className="workspace-panel creation-details"
            disabled={locked}
          >
            <legend>Project details</legend>
            <p className="creation-section-intro">
              All project details are required.
            </p>
            <div className="creation-pair">
              <Field
                name="orgId"
                label="Agency"
                kind="select"
                value={values.orgId}
                onChange={change("orgId")}
                hint="Choose the agency for this project."
              >
                {Object.entries(agencyNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} ({id})
                  </option>
                ))}
              </Field>
              <Field
                name="projectId"
                label="Project ID"
                value={values.projectId}
                onChange={change("projectId")}
                onBlur={blur("projectId")}
                error={errors.projectId}
                required
                maxLength={100}
                autoComplete="off"
                hint="Use a short ID your team can recognize."
              />
            </div>
            {!created &&
              values.projectId &&
              !fieldError("projectId", values.projectId) && (
                <p className="creation-id-status" role="status">
                  {idStatus === "checking"
                    ? "Checking this ID…"
                    : idStatus === "available"
                      ? `No existing project with this ID in ${values.orgId}.`
                      : idStatus === "taken"
                        ? `This ID already exists in ${values.orgId}.`
                        : "ID availability couldn't be checked. Creation will validate it."}
                </p>
              )}
            <Field
              name="projectName"
              label="Project name"
              value={values.projectName}
              onChange={change("projectName")}
              onBlur={blur("projectName")}
              error={errors.projectName}
              required
              autoComplete="off"
              placeholder="e.g. Library workstation refresh"
            />
            <Field
              name="projectDesc"
              label="Description"
              kind="textarea"
              value={values.projectDesc}
              onChange={change("projectDesc")}
              onBlur={blur("projectDesc")}
              error={errors.projectDesc}
              required
              rows={4}
              placeholder="What will this project achieve for your agency?"
            />
            <Field
              name="budget"
              label="Budget (USD)"
              type="number"
              min="0"
              step="1"
              value={values.budget}
              onChange={change("budget")}
              onBlur={blur("budget")}
              error={errors.budget}
              required
              hint="Enter a whole-dollar amount, including 0 if applicable."
              placeholder="0"
            />
          </fieldset>
          <fieldset
            className="workspace-panel creation-hardware"
            disabled={locked}
          >
            <legend>Initial hardware</legend>
            <p className="creation-optional">OPTIONAL</p>
            <p className="creation-section-intro">
              Reserve resources now, or create your project without an initial
              allocation.
            </p>
            {inventory.status === "loading" && (
              <p role="status">Loading hardware…</p>
            )}
            {inventory.status === "error" && (
              <div role="alert">
                <p>
                  Hardware is unavailable. You can still create the project
                  without an initial allocation.
                </p>
                <button
                  type="button"
                  className="workspace-button secondary"
                  onClick={inventory.retry}
                >
                  Retry hardware
                </button>
              </div>
            )}
            {inventory.status === "ready" && catalog.length === 0 && (
              <p>
                No hardware is currently listed. You can create the project
                without an initial allocation.
              </p>
            )}
            {catalog.map((item) => {
              const id = hardwareId(item),
                allocated = allocatedIds.includes(id);
              return (
                <div className="creation-hardware-row" key={id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {id} · {stock(item)} unallocated units
                    </span>
                    {allocated && (
                      <span className="creation-allocated" role="status">
                        Allocation saved
                      </span>
                    )}
                  </div>
                  <Field
                    name={`allocation-${id}`}
                    label={`Allocate ${item.name}`}
                    type="number"
                    min="0"
                    max={allocationLimit(item)}
                    step="1"
                    value={quantities[id] ?? 0}
                    onChange={(event) =>
                      setQuantities({ ...quantities, [id]: event.target.value })
                    }
                    error={errors[`allocation-${id}`]}
                  />
                </div>
              );
            })}
            <p className="creation-selection" aria-live="polite">
              {selectedItems.length
                ? `${selectedItems.length} hardware ${selectedItems.length === 1 ? "type" : "types"} selected`
                : "No initial allocation selected"}
            </p>
          </fieldset>
        </div>
        <div className="creation-actions">
          <p>
            {created
              ? "Leaving this page ends the current allocation retry session."
              : "You’ll be recorded as the project creator."}
          </p>
          <button
            type="button"
            className="workspace-button secondary"
            disabled={submitting}
            onClick={() => navigate("/projects")}
          >
            {created ? "Back to projects" : "Cancel"}
          </button>
          <button
            className="workspace-button"
            type="submit"
            disabled={
              submitting ||
              (!created &&
                idStatus === "checking" &&
                !fieldError("projectId", values.projectId))
            }
          >
            {submitting
              ? "Saving…"
              : created
                ? "Retry remaining allocations"
                : "Create project"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function CreateProject() {
  const profile = useWorkspace();
  return (
    <main className="workspace-page creation-page">
      <Link className="workspace-back" to="/projects">
        ← Back to projects
      </Link>
      {profile.status === "loading" ? (
        <WorkspaceState headingLevel={1} title="Loading workspace…" loading>
          Checking your account and agency.
        </WorkspaceState>
      ) : profile.status === "error" ? (
        <WorkspaceState
          headingLevel={1}
          title="Workspace unavailable"
          action={
            <button className="workspace-button" onClick={profile.retry}>
              Try again
            </button>
          }
        >
          We couldn't verify your account.
        </WorkspaceState>
      ) : !profile.value.agencyCode ? (
        <WorkspaceState headingLevel={1} title="Agency unavailable">
          Confirm your account's agency with your team before creating a
          project.
        </WorkspaceState>
      ) : (
        <CreationForm profile={profile.value} />
      )}
    </main>
  );
}
