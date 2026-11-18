from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app
from hardware import hardware_pb2 as hardware
from projects import projects_pb2 as projects
from services import vendor_rankings


class VendorRankingTests(unittest.TestCase):
    def setUp(self):
        self.http = app.app.test_client()
        self.auth = self.enterContext(patch.object(
            app, "validate_access_token", return_value=("0007", "AUS"),
        ))
        self.project_call = self.enterContext(patch.object(
            vendor_rankings.projects, "call", side_effect=self.projects_response,
        ))
        self.hardware_call = self.enterContext(patch.object(
            vendor_rankings.hardware_client, "call",
        ))
        self.members = ["0007"]
        self.budget = 1000
        self.availability = hardware.AvailabilityResponse(
            hardware=hardware.Hardware(id="H1", name="Desktop PC"),
            availability="unavailable",
        )
        self.hardware_call.return_value = self.availability

    def projects_response(self, method, request):
        if method == "GetProject":
            return projects.GetProjectResponse(project_info=projects.Project(
                project_id="P1", project_name="Library", org_id="AUS",
                budget=self.budget, joined_users=self.members,
            ))
        if method == "GetBudgetContext":
            return projects.GetBudgetContextResponse(org_id="AUS", items=[
                projects.ItemEstimate(
                    description=request.items[0].description,
                    quantity=request.items[0].quantity, priced=True,
                    matched_category="Desktop Computers",
                    estimated_cost=projects.CostRange(low=750, typical=900, high=1200),
                ),
            ])
        raise AssertionError(method)

    def compare(self, **overrides):
        return self.http.post(
            "/api/integration/vendor-rankings",
            headers={"Authorization": "Bearer test"},
            json={"projectId": "P1", "hardwareId": "H1", "quantity": 10, **overrides},
        )

    def test_ranks_comparable_historical_prices_against_the_verified_budget(self):
        for name, commodity, price in (
            ("Costly", "Desktop PC", 110),
            ("Affordable", "Desktop Computers", 75),
            ("affordable", "desktop-computers", 85),
            ("Different item", "Laptops", 10),
            ("No price", "Desktop PC", None),
        ):
            record = self.availability.alternatives.add(vendor=name, commodity=commodity)
            if price is not None:
                record.unit_price = price

        response = self.compare(budget=5000, userId="other")
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual(result["projectBudget"], "1000.00")
        self.assertEqual(result["benchmark"]["estimate"]["typical"], "900.00")
        best, second = result["rankedVendors"]
        self.assertEqual(best["vendor"], "Affordable")
        self.assertEqual(best["estimatedTotal"], "800.00")
        self.assertEqual(best["differenceFromTypical"], "-100.00")
        self.assertTrue(best["recommended"])
        self.assertEqual(second["overBudgetBy"], "100.00")
        self.assertFalse(second["recommended"])
        self.assertEqual(best["priceBasis"], "category")
        self.assertEqual(best["priceRecordCount"], 2)
        self.assertEqual(second["priceBasis"], "model")
        self.assertEqual(result["unpricedVendors"], ["No price"])
        self.assertEqual(result["excludedRecordCount"], 1)
        self.assertEqual(result["procurementTags"], [])
        budget_request = self.project_call.call_args.args[1]
        self.assertEqual((budget_request.org_id, budget_request.budget), ("AUS", 1000))
        self.assertEqual(budget_request.items[0].quantity, 10)
        self.assertEqual(self.hardware_call.call_args.args[1].hardware_id, "H1")

    def test_uses_server_commodity_prices_without_a_projects_benchmark(self):
        self.availability.hardware.name = "ThinkSystem ST250 V3 Tower Server"
        for vendor, commodity, price in (
            ("Category supplier", "SERVERS, FILE, MICROCOMPUTER", 1200),
            ("Category supplier", "SERVERS, FILE, MICROCOMPUTER, Environmentally Certified", 1600),
            ("Model supplier", "SERVERS, FILE, MICROCOMPUTER", 100),
            ("Model supplier", "ThinkSystem ST250 V3 Tower Server", 1800),
            ("Unrelated supplier", "Life Preservers", 24),
            ("Bundled supplier", "Integrated Hardware-Software IT, Turnkey Solution, Server an", 200),
        ):
            self.availability.alternatives.add(vendor=vendor, commodity=commodity, unit_price=price)

        def projects_without_benchmark(method, request):
            if method == "GetBudgetContext":
                return projects.GetBudgetContextResponse(org_id="AUS", items=[
                    projects.ItemEstimate(
                        description=request.items[0].description,
                        quantity=request.items[0].quantity,
                        priced=False,
                    ),
                ])
            return self.projects_response(method, request)

        self.budget = 20000
        self.project_call.side_effect = projects_without_benchmark
        response = self.compare(quantity=1)
        self.assertEqual(response.status_code, 200)
        result = response.json
        self.assertEqual(result["benchmark"]["status"], "unpriced")
        category, model = result["rankedVendors"]
        self.assertEqual((category["vendor"], category["unitPrice"], category["priceBasis"]),
                         ("Category supplier", "1400.0", "category"))
        self.assertEqual(category["priceRecordCount"], 2)
        self.assertEqual((model["vendor"], model["unitPrice"], model["priceBasis"]),
                         ("Model supplier", "1800.0", "model"))
        self.assertEqual(model["priceRecordCount"], 1)
        self.assertEqual(result["unpricedVendors"], [])
        self.assertEqual(result["excludedRecordCount"], 2)

    def test_tag_preferences_preserve_prices_and_identify_matching_vendors(self):
        self.availability.hardware.name = "ThinkSystem ST250 V3 Tower Server"
        self.budget = 1500
        for vendor, commodity, price in (
            ("Flexible supplier", "SERVERS, FILE, MICROCOMPUTER", 400),
            ("Flexible supplier", "SERVERS, FILE, MICROCOMPUTER, Environmentally Certified", 1600),
            ("Certified supplier", "SERVERS, FILE, MICROCOMPUTER, Environmentally Certified", 1300),
            ("Friendly supplier", "SERVERS, FILE, MICROCOMPUTER (Environmentally friendly)", None),
            ("Unrelated supplier", "Life Preservers, Environmentally Certified", 100),
            ("Negative claim", "SERVERS, FILE, MICROCOMPUTER, Not Environmentally Certified", 100),
        ):
            record = self.availability.alternatives.add(vendor=vendor, commodity=commodity)
            if price is not None:
                record.unit_price = price

        response = self.compare(quantity=1)
        self.assertEqual(response.status_code, 200)
        result = response.json
        first, second = result["rankedVendors"]
        self.assertEqual((first["vendor"], first["estimatedTotal"]), ("Flexible supplier", "1000.00"))
        self.assertEqual((second["vendor"], second["estimatedTotal"]), ("Certified supplier", "1300.00"))
        self.assertTrue(first["recommended"])
        self.assertEqual(result["unpricedVendors"], ["Friendly supplier"])
        self.assertEqual(result["procurementTags"], [
            {"tag": "Environmentally certified", "vendors": ["Certified supplier", "Flexible supplier"]},
            {"tag": "Environmentally friendly", "vendors": ["Friendly supplier"]},
        ])
        self.assertEqual(result["excludedRecordCount"], 2)
        self.hardware_call.assert_called_once()

    def test_rejects_nonmembers_before_contacting_hardware(self):
        self.members = ["different-user"]
        self.assertEqual(self.compare(userId="different-user").status_code, 403)
        self.hardware_call.assert_not_called()

    def test_rejects_invalid_quantity_and_foreign_agency_before_forwarding(self):
        self.assertEqual(self.compare(quantity=True).status_code, 400)
        self.assertEqual(self.compare(orgId="DAL").status_code, 403)
        self.project_call.assert_not_called()
        self.hardware_call.assert_not_called()

    def test_distinguishes_a_failed_lookup_from_no_alternatives(self):
        self.assertEqual(self.compare().json["availability"], "unavailable")
        self.availability.alternative_lookup_status = "temporarily_unavailable"
        result = self.compare().json
        self.assertEqual(result["availability"], "temporarily_unavailable")
        self.assertEqual(result["rankedVendors"], [])
        self.assertEqual(result["benchmark"]["status"], "priced")

    def test_uses_the_project_budget_when_the_benchmark_is_unavailable(self):
        def unavailable_benchmark(method, request):
            if method == "GetBudgetContext":
                raise vendor_rankings.projects.ProjectsServiceError("Unavailable")
            return self.projects_response(method, request)

        self.project_call.side_effect = unavailable_benchmark
        self.availability.alternatives.add(vendor="Example", commodity="Desktop PC", unit_price=80)
        result = self.compare().json
        self.assertEqual(result["benchmark"]["status"], "unavailable")
        self.assertTrue(result["rankedVendors"][0]["recommended"])
        self.assertIsNone(result["rankedVendors"][0]["differenceFromTypical"])

    def test_keeps_real_zero_budget_and_ignores_alternatives_while_in_stock(self):
        self.budget = 0
        self.availability.alternatives.add(vendor="Example", commodity="Desktop PC", unit_price=80)
        result = self.compare().json
        self.assertEqual(result["projectBudget"], "0.00")
        self.assertFalse(result["rankedVendors"][0]["recommended"])

        self.availability.availability = "available"
        result = self.compare().json
        self.assertEqual(result["availability"], "available")
        self.assertEqual(result["rankedVendors"], [])
