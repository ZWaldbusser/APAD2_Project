"""Loopback Projects provider for adapter/protobuf behavior tests."""
import os
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
import grpc
from projects import projects_pb2 as messages
from projects import projects_pb2_grpc as services


class ProjectsProvider(services.ProjectsServiceServicer):
    def __init__(self, records):
        self.records = {(p.org_id, p.project_id): p for p in records}
        self.calls = []
        self.failure = None

    def record(self, method, request, context):
        self.calls.append((method, request))
        if self.failure:
            context.abort(self.failure, "Provider rejected the request")

    def GetProject(self, request, context):
        self.record("GetProject", request, context)
        project = self.records.get((request.org_id, request.project_id))
        if project is None:
            context.abort(grpc.StatusCode.NOT_FOUND, "Project not found")
        return messages.GetProjectResponse(project_info=project)

    def SearchProjects(self, request, context):
        self.record("SearchProjects", request, context)
        return messages.SearchProjectsResponse(project_list=[
            messages.ProjectSummary(org_id=p.org_id, project_id=p.project_id,
                                    project_name=p.project_name, joined_users=p.joined_users)
            for p in self.records.values()
            if (not request.org_id or request.org_id == p.org_id)
            and (not request.project_id or request.project_id == p.project_id)
            and (not request.user_id or request.user_id in p.joined_users)
        ])

    def CreateProject(self, request, context):
        self.record("CreateProject", request, context)
        self.records[(request.org_id, request.project_id)] = messages.Project(
            org_id=request.org_id, project_id=request.project_id,
            project_name=request.project_name, project_desc=request.project_desc,
            creator_id=request.creator_id, budget=request.budget,
            hardware_list=request.hardware_list, joined_users=[request.creator_id],
        )
        return messages.CreateProjectResponse()


def start_projects(test, records):
    provider = ProjectsProvider(records)
    server = grpc.server(ThreadPoolExecutor(max_workers=2))
    services.add_ProjectsServiceServicer_to_server(provider, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    test.addCleanup(lambda: server.stop(0).wait())
    env = patch.dict(os.environ, {"PROJECTS_GRPC_TARGET": f"http://127.0.0.1:{port}",
                                 "PROJECTS_API_TIMEOUT_SECONDS": "2"})
    env.start()
    test.addCleanup(env.stop)
    return provider
