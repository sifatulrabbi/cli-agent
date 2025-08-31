if __name__ == "__main__":
    import os
    import sys

    parent_dir = os.path.join(os.path.dirname(__file__), "..")
    sys.path.append(parent_dir)

import unittest
from db.service import get_all_chat_threads, create_thread


class TestDBService(unittest.IsolatedAsyncioTestCase):
    async def test_create_threads(self):
        await create_thread()

    async def test_get_all_threads(self):
        await get_all_chat_threads()

    async def test_remove_threads(self):
        await create_thread()
