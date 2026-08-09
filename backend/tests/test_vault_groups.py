import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

from backend import core
from backend.routers import system


class VaultGroupTests(unittest.TestCase):
    def setUp(self):
        self.previous_root = core._vault_state["root"]
        self.previous_dir = core._vault_state["dir"]
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.current = self.root / "Current"
        self.current.mkdir()
        (self.root / "Alpha").mkdir()
        (self.root / "Beta").mkdir()
        core._vault_state["root"] = self.root
        core._vault_state["dir"] = self.current

    def tearDown(self):
        core._vault_state["root"] = self.previous_root
        core._vault_state["dir"] = self.previous_dir
        self.temp_dir.cleanup()

    def test_groups_are_saved_separately_without_moving_vault_directories(self):
        group_id = "11111111-1111-4111-8111-111111111111"

        result = system.put_vault_groups(system.VaultGroupsBody(groups=[
            system.VaultGroupPayload(id=group_id, name="Work", vaults=["Alpha", "Beta"]),
        ]))

        self.assertEqual(result["groups"][0]["vaults"], ["Alpha", "Beta"])
        self.assertTrue((self.root / system.VAULT_GROUPS_FILENAME).is_file())
        self.assertTrue((self.root / "Alpha").is_dir())
        self.assertTrue((self.root / "Beta").is_dir())

        loaded = system.get_vault_groups()
        self.assertEqual(loaded["groups"][0]["name"], "Work")
        self.assertEqual(loaded["ungrouped"], ["Current"])

    def test_same_vault_cannot_be_assigned_to_multiple_groups(self):
        with self.assertRaises(HTTPException) as raised:
            system.put_vault_groups(system.VaultGroupsBody(groups=[
                system.VaultGroupPayload(
                    id="11111111-1111-4111-8111-111111111111",
                    name="One",
                    vaults=["Alpha"],
                ),
                system.VaultGroupPayload(
                    id="22222222-2222-4222-8222-222222222222",
                    name="Two",
                    vaults=["Alpha"],
                ),
            ]))

        self.assertEqual(raised.exception.status_code, 400)

    def test_renaming_a_vault_updates_its_group_reference(self):
        group_id = "11111111-1111-4111-8111-111111111111"
        system.put_vault_groups(system.VaultGroupsBody(groups=[
            system.VaultGroupPayload(id=group_id, name="Work", vaults=["Alpha"]),
        ]))

        system.rename_vault("Alpha", system.RenameVaultBody(new_name="Renamed"))

        loaded = system.get_vault_groups()
        self.assertEqual(loaded["groups"][0]["vaults"], ["Renamed"])
        self.assertFalse((self.root / "Alpha").exists())
        self.assertTrue((self.root / "Renamed").is_dir())


if __name__ == "__main__":
    unittest.main()
