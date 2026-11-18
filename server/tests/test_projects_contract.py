"""Public adapter behavior for the supplied Projects contract."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from projects import client
from projects import projects_pb2 as messages


class ProjectsContractTests(unittest.TestCase):
    def test_user_filter_is_forwarded_with_agency_and_project_filters(self):
        with patch.object(client, "call", return_value=messages.SearchProjectsResponse()) as provider:
            status, payload = client.search_projects({
                "orgId": "AUS", "projectId": "P1", "userId": "user-1",
            })
        self.assertEqual((status, payload), (200, {"projectList": []}))
        request = provider.call_args.args[1]
        self.assertEqual(getattr(request, "user_id", None), "user-1")
        self.assertEqual((request.org_id, request.project_id), ("AUS", "P1"))

    def test_search_preserves_membership_ids_without_numeric_conversion(self):
        result = messages.SearchProjectsResponse(project_list=[messages.ProjectSummary(
            org_id="AUS", project_id="P1", project_name="Library",
            joined_users=["0007", "user-2"],
        )])
        with patch.object(client, "call", return_value=result):
            status, payload = client.search_projects({"orgId": "AUS"})
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"projectList": [{
            "orgId": "AUS", "projectId": "P1", "projectName": "Library",
            "joined_users": ["0007", "user-2"],
        }]})
