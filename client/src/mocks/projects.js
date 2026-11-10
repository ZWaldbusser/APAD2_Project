// Mock Projects service — matches Projects API v1.4 contract.

import { db, ok, err } from "./db";

const findProject = (orgId, projectId) =>
  db.projects.find((p) => p.orgId === orgId && p.projectID === projectId);

export const projectsRoutes = [
  // Search projects: POST /projects/search_project
  ["POST", /^\/projects\/search_project$/, (_m, body) => {
    let results = db.projects;

    const filterByOrg = body?.orgId && body.orgId.trim();
    const filterById = body?.projectId && body.projectId.trim();

    if (filterByOrg) {
      results = results.filter((p) => p.orgId === filterByOrg);
    }
    if (filterById) {
      results = results.filter((p) => p.projectID === filterById);
    }

    return ok({
      projectList: results.map(({ projectID, name, orgId }) => ({
        projectId: projectID,
        projectName: name,
        orgId,
      })),
    });
  }],

  // Create project: POST /projects/create_project
  ["POST", /^\/projects\/create_project$/, (_m, body) => {
    if (!body?.orgId || !body?.projectId || !body?.projectName || body.budget === undefined || !body?.creatorId) {
      return { status: 422, data: { success: false, errorMessage: "Missing required fields" } };
    }
    if (findProject(body.orgId, body.projectId)) {
      return { status: 409, data: { success: false, errorMessage: "Project already exists or another unique field conflicts" } };
    }

    db.projects.push({
      id: `p${Date.now()}`,
      orgId: body.orgId,
      projectID: body.projectId,
      name: body.projectName,
      description: body.projectDesc || "",
      creatorId: body.creatorId,
      budget: body.budget,
      hardwareList: body.hardwareList || [],
      users: [body.creatorId],
      hwSets: {},
    });
    return ok({ success: true, errorMessage: "" });
  }],

  // Join project: POST /projects/join_project
  ["POST", /^\/projects\/join_project$/, (_m, body) => {
    if (!body?.orgId || !body?.projectId || !body?.userId) {
      return { status: 422, data: { success: false, errorMessage: "Missing required fields" } };
    }
    const project = findProject(body.orgId, body.projectId);
    if (!project) return { status: 404, data: { success: false, errorMessage: "Project not found" } };
    if (project.users.includes(body.userId)) {
      return { status: 409, data: { success: false, errorMessage: "User already joined this project" } };
    }
    project.users.push(body.userId);
    return ok({ success: true, errorMessage: "" });
  }],

  // Leave project: POST /projects/leave_project
  ["POST", /^\/projects\/leave_project$/, (_m, body) => {
    if (!body?.orgId || !body?.projectId || !body?.userId) {
      return { status: 422, data: { success: false, errorMessage: "Missing required fields" } };
    }
    const project = findProject(body.orgId, body.projectId);
    if (!project) return { status: 404, data: { success: false, errorMessage: "Project not found" } };
    const idx = project.users.indexOf(body.userId);
    if (idx === -1) {
      return { status: 409, data: { success: false, errorMessage: "User is not a member of this project" } };
    }
    project.users.splice(idx, 1);
    return ok({ success: true, errorMessage: "" });
  }],

  // Project detail: GET /projects/{projectId}?orgId={orgId}
  ["GET", /^\/projects\/([^/?]+)/, (m) => {
    const projectId = decodeURIComponent(m[1]);
    const url = m.input || "";
    const params = new URLSearchParams(url.split("?")[1] || "");
    const orgId = params.get("orgId");
    if (!orgId) return err(422, "orgId is required");

    const project = findProject(orgId, projectId);
    if (!project) return { status: 404, data: { success: false, errorMessage: "Project not found" } };
    return ok({
      projectInfo: {
        orgId: project.orgId,
        projectId: project.projectID,
        projectName: project.name,
        projectDesc: project.description || "",
        creatorId: project.creatorId,
        budget: project.budget || 0,
        hardwareList: project.hardwareList || [],
        joined_users: project.users || [],
      },
    });
  }],

  // Mock price endpoints
  ["POST", /^\/get_unit_price$/, (_m, body) => {
    if (!body?.category) return { status: 400, data: { success: false, message: "category is required" } };
    return ok({
      success: true,
      category: body.category,
      unitPrice: {
        Austin: { median: 145.0, low: 98.5, high: 210.0, purchases: 42 },
        Dallas: "not available",
        Texas: "not available",
      },
    });
  }],

  ["POST", /^\/get_department_spend$/, (_m, body) => {
    if (!body?.keyword || body.keyword.length < 3) {
      return { status: 400, data: { success: false, message: "keyword must be at least 3 characters" } };
    }
    return ok({
      success: true,
      keyword: body.keyword,
      departmentSpend: {
        Austin: "not available",
        Dallas: { typicalYearly: 48210.0, low: 12400.0, high: 131900.0, departments: 18, years: [2026, 2027], matchedLabels: ["COMPUTER EQUIPMENT"] },
        Texas: "not available",
      },
    });
  }],

  ["POST", /^\/get_budget_context$/, (_m, body) => {
    if (!body?.items?.length) return { status: 400, data: { success: false, message: "items list cannot be empty" } };
    return ok({
      success: true,
      orgId: body.orgId,
      budget: body.budget,
      items: body.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        matchedCategory: item.description,
        confidence: 1.0,
        unitPrice: { median: 145.0, low: 98.5, high: 210.0, purchases: 42 },
        estimatedCost: { low: item.quantity * 98.5, typical: item.quantity * 145.0, high: item.quantity * 210.0 },
      })),
      totalEstimate: { low: 0, typical: 0, high: 0 },
      unpricedItems: 0,
      withinBudget: true,
    });
  }],
];
