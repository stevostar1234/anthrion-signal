"""Read-only verification of a small selection of official monthly feed partitions."""
from anthrion_signal.collectors import Http

http = Http()
for source, types in [("sell2wales.gov.wales", [51, 52, 53]), ("publiccontractsscotland.gov.uk", [1, 7, 14])]:
    for notice_type in types:
        response = http.client.get(f"https://api.{source}/v1/Notices", params={"dateFrom": "09-2026", "noticeType": notice_type, "outputType": 0})
        print(source, notice_type, response.status_code)
        if response.status_code == 200:
            data = response.json()
            print(type(data).__name__, list(data)[:8] if isinstance(data, dict) else "list", len(data.get("releases", [])) if isinstance(data, dict) else len(data))
        http.sleeper(2)
http.close()
