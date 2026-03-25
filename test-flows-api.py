#!/usr/bin/env python3
import json
import urllib.request

api_key = "mc_agent_b90e00ceacd7c243f3e32d94a872896c"
agent_id = "cmm3r2kt60000u2trwgxr1ji7"
base_url = "http://10.0.0.206:3000"

# Create a test flow
payload = json.dumps({
    "name": "Test Flow",
    "description": "A test flow created by Rico"
}).encode('utf-8')

headers = {
    "X-API-Key": api_key,
    "Content-Type": "application/json"
}

url = f"{base_url}/api/agents/{agent_id}/flows"

req = urllib.request.Request(url, data=payload, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        result = response.read().decode('utf-8')
        print(f"Success! Response: {result}")
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Error: {e}")
