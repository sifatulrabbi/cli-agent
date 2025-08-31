import asyncio
import os
import sys
import unittest
from dotenv import load_dotenv

parent_dir = os.path.join(os.path.dirname(__file__), "..")
sys.path.append(parent_dir)

load_dotenv()

from db import init_db
from tests.test_services import *

asyncio.run(init_db())

unittest.main()
