#!/usr/bin/env python3
import json
import urllib.request

api_key = "mc_agent_b90e00ceacd7c243f3e32d94a872896c"
agent_id = "cmm3r2kt60000u2trwgxr1ji7"
base_url = "http://10.0.0.206:3000"

headers = {
    "X-API-Key": api_key,
}

# List flows
url = f"{base_url}/api/agents/{agent_id}/flows"
req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode('utf-8'))
        print(f"Flows ({len(result)}):")
        for flow in result:
            print(f"  - {flow['name']} (id: {flow['id']}, active: {flow['isActive']})")
except Exception as e:
    print(f"Error: {e}")
