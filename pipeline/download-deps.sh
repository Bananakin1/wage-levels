#!/bin/bash
set -e

echo "Downloading O*NET 30.2..."
mkdir -p data/raw/onet
curl -L "https://www.onetcenter.org/dl_files/database/db_30_2_text.zip" -o /tmp/onet.zip
# unzip may not be available; use python3 as fallback
if command -v unzip &>/dev/null; then
  unzip -o -j /tmp/onet.zip "db_30_2_text/Job Zones.txt" -d data/raw/onet/
  unzip -o -j /tmp/onet.zip "db_30_2_text/Education, Training, and Experience.txt" -d data/raw/onet/
else
  python3 - <<'PYEOF'
import zipfile, os
targets = {"db_30_2_text/Job Zones.txt", "db_30_2_text/Education, Training, and Experience.txt"}
with zipfile.ZipFile("/tmp/onet.zip") as zf:
    for name in zf.namelist():
        if name in targets:
            data = zf.read(name)
            out = "data/raw/onet/" + os.path.basename(name)
            with open(out, "wb") as f:
                f.write(data)
            print(f"Extracted {os.path.basename(name)}")
PYEOF
fi
rm /tmp/onet.zip

echo "Downloading Census CBSA delineation (2023)..."
mkdir -p data/raw/cbsa
# Note: Census hosts this as .xlsx (not .xls) as of 2023
curl -L "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx" -o data/raw/cbsa/cbsa_delineation.xlsx

echo "Done. Place OFLC CSVs manually in data/raw/oflc/"
echo "Expected files:"
echo "  data/raw/oflc/ALC_Export.csv"
echo "  data/raw/oflc/Geography.csv"
echo "  data/raw/oflc/oes_soc_occs.csv"
echo "  data/raw/oflc/xwalk_plus.csv"
