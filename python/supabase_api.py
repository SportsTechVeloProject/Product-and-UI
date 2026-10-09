"""supabase_api.py — the few Supabase calls main.py needs, over plain HTTP.

No extra packages: just Python's urllib. Every call runs as the logged-in
user, so Row Level Security decides what is allowed, exactly as in the app.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://amxrrodzdvizndchfeqy.supabase.co")
# Public anon key (the same one the website ships); access is limited by Row Level Security.
SUPABASE_ANON_KEY = os.environ.get(
    "SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteHJyb2R6ZHZpem5kY2hmZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MzY2MjgsImV4cCI6MjEwNTExMjYyOH0.DK_3jMp83K1DQKW6NVaSK77UNYBtXwfamjkZ3svewO4",
)
RAW_BUCKET = "raw-sessions"


class SupabaseError(Exception):
    pass


def _request(method, path, token=None, json_body=None, raw_body=None, headers=None):
    req = urllib.request.Request(SUPABASE_URL + path, method=method)
    req.add_header("apikey", SUPABASE_ANON_KEY)
    req.add_header("Authorization", "Bearer " + (token or SUPABASE_ANON_KEY))
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = raw_body
    if json_body is not None:
        data = json.dumps(json_body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data) as res:
            text = res.read().decode()
            return json.loads(text) if text else None
    except urllib.error.HTTPError as err:
        raise SupabaseError("%s %s failed (%s): %s" % (
            method, path.split("?")[0], err.code, err.read().decode()[:400])) from None


def log_in(email, password):
    """Returns (access_token, user_id)."""
    res = _request("POST", "/auth/v1/token?grant_type=password",
                   json_body={"email": email, "password": password})
    return res["access_token"], res["user"]["id"]


# ---------------- Storage: raw recordings ----------------

def upload_raw(token, path, samples):
    _request("POST", "/storage/v1/object/%s/%s" % (RAW_BUCKET, urllib.parse.quote(path)), token,
             raw_body=json.dumps(samples).encode(), headers={"Content-Type": "application/json"})


def download_raw(token, path):
    path = path.lstrip("/")
    if path.startswith(RAW_BUCKET + "/"):
        path = path[len(RAW_BUCKET) + 1:]
    return _request("GET", "/storage/v1/object/authenticated/%s/%s" % (RAW_BUCKET, urllib.parse.quote(path)), token)


def delete_raw(token, path):
    _request("DELETE", "/storage/v1/object/%s/%s" % (RAW_BUCKET, urllib.parse.quote(path)), token)


# ---------------- Tables ----------------

def insert(token, table, rows):
    return _request("POST", "/rest/v1/" + table, token, json_body=rows,
                    headers={"Prefer": "return=representation"})


def select(token, table, query):
    return _request("GET", "/rest/v1/%s?%s" % (table, query), token)


def delete(token, table, query):
    _request("DELETE", "/rest/v1/%s?%s" % (table, query), token)
