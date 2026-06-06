import os
import sys

print("Python Version:", sys.version)

try:
    import pandas as pd
    print("pandas: installed")
except ImportError:
    print("pandas: NOT installed")

try:
    import openpyxl
    print("openpyxl: installed")
except ImportError:
    print("openpyxl: NOT installed")
