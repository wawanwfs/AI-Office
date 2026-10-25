import unittest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from database import init_db, list_agents, list_projects, get_db
from docker_sandbox import DockerSandboxManager
from orchestrator import TaskOrchestrator

class TestSoftwareHouseBackend(unittest.TestCase):
    def setUp(self):
        init_db()

    def test_database_and_agents_seeded(self):
        agents = list_agents()
        self.assertGreaterEqual(len(agents), 11)
        roles = [a["role"] for a in agents]
        self.assertTrue(any("Product" in r for r in roles))
        self.assertTrue(any("Architect" in r for r in roles))
        self.assertTrue(any("Frontend" in r for r in roles))
        self.assertTrue(any("DevOps" in r for r in roles))
        self.assertTrue(any("QA" in r for r in roles))

    def test_docker_port_allocation(self):
        port = DockerSandboxManager.allocate_port()
        self.assertGreaterEqual(port, 3100)
        self.assertLess(port, 3900)

    def test_path_traversal_prevention(self):
        with self.assertRaises(PermissionError):
            DockerSandboxManager.get_workspace_path("../../../etc")

    def test_task_orchestration_planning(self):
        plan = TaskOrchestrator.plan_task(
            "Buatkan REST API e-commerce dengan authentication dan database",
            project_name="E-Commerce API",
            task_type="api"
        )
        self.assertIn("task_id", plan)
        self.assertEqual(plan["project"]["name"], "E-Commerce API")
        self.assertGreaterEqual(len(plan["subtasks"]), 5)

if __name__ == "__main__":
    unittest.main()
