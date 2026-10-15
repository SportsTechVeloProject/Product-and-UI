# Automatic processing on Azure Functions

When an athlete presses **■ Stop & save**, the recording is analyzed in the
cloud and the result appears in My training by itself (the page checks every
2 s). Nobody has to run `main.py --watch` on a laptop.

```
website: ■ Stop & save
  → raw JSON to Storage (raw-sessions) + a row in sessions
  → Supabase Database Webhook (INSERT on sessions)
  → Azure Function new_session (HTTP): puts the session id on a queue, answers at once
  (warm_up: the website wakes the analysis when sensors connect, see below)
  → Azure Function process_session (queue): main.process_waiting → reps + analyzed_at
  → My training shows the speed and the next-set suggestion
Retry: a pg_cron job in Supabase re-sends every minute any recording older than a minute with
neither a result nor an error (supabase/migrations/2026-10-14-resend-waiting-sessions.sql), so a
recording isn't lost when Azure was asleep and the webhook timed out.
Safety net: Azure Function sweep (daily) processes anything still waiting, e.g. older than the retry's one-day window.
```

The code is `python/function_app.py`. It reuses `main.py` and the data team's
files unchanged, so `main.py --session <id>` and `--watch` still work for
debugging on a laptop. **Don't run `--watch` while Azure is live**: both would
process the same recordings.

## One-time setup

### 1. Create the function app (Azure portal)

1. Go to [portal.azure.com](https://portal.azure.com) and sign in with the account that has **Azure for Students**.
2. **Create a resource** → **Function App** → hosting plan **Flex Consumption** → **Select**.
3. **Basics**
   - Subscription: *Azure for Students*
   - Resource group: **Create new** → `vlo`
   - Function App name: e.g. `vlo-processing` (must be unique worldwide; it becomes the web address)
   - Region: **Sweden Central** (if the student subscription doesn't allow it: North Europe)
   - Runtime stack: **Python**, version **3.12**
   - Instance size: **2048 MB**
4. **Storage**: let it create a new storage account (the queue lives there).
   If there's an *Authentication* tab for storage, **Secrets** (connection string) is simplest.
   With *Managed identity*, give the app's identity the **Storage Queue Data Contributor** role on that storage account, or the queue functions fail with 403.
5. **Monitoring**: Application Insights **on** (that's where the logs are).
6. **Review + create** → **Create**. Takes a couple of minutes.

### 2. Add the Supabase service key

Function app → **Settings → Environment variables** → **+ Add**:

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_KEY` | Supabase dashboard → Project Settings → API → **service_role** key |

**Apply**, then **Confirm**. The key only ever lives here (and in your local
`python/.env`). Never in the repo, never in the website.

### 3. Deploy the code (VS Code)

1. Install the **Azure Functions** extension (`ms-azuretools.vscode-azurefunctions`) and sign in to Azure (Azure icon in the sidebar).
2. Ctrl+Shift+P → **Azure Functions: Deploy to Function App…**
   - If it asks for the folder, pick **`python`** (that folder is the function app).
   - Pick the app from step 1 and confirm.
3. The first deploy takes a few minutes: Azure installs `python/requirements.txt` (numpy, scipy, pandas, matplotlib, imufusion) on Linux.
4. Function app → **Overview**: the three functions `new_session`, `process_session` and `sweep` should be listed.

Deploy again the same way whenever `main.py`, `squats.py` or the data team's files change (update those with `python/sync_data_team.py`, see its header).

(Alternative without the extension: install Azure Functions Core Tools, then in `python/` run `func azure functionapp publish <app name>`.)

### 4. Copy the function's address

Function app → **Functions** → `new_session` → **Get function URL** → copy the **default (function key)** one:

```
https://<app name>.azurewebsites.net/api/new-session?code=<key>
```

The `code=` part is what stops anyone else from calling it, so treat the whole
address like a password.

### 5. Create the Supabase webhook

Supabase dashboard → **Database → Webhooks** (enable webhooks if asked) → **Create a new hook**:

| Field | Value |
|---|---|
| Name | `process_new_session` |
| Table | `sessions` |
| Events | **Insert** only |
| Type | HTTP Request |
| Method | POST |
| URL | the address from step 4 |
| Timeout | 5000 ms |
| Headers | keep `Content-type: application/json` |

**Create webhook.**

### 6. Retry every minute (Supabase)

The webhook gets one try; waking the app can take longer than it waits. Open
`supabase/migrations/2026-10-14-resend-waiting-sessions.sql`, replace
`PASTE_FULL_URL_HERE` with the same address as in step 5 (don't commit that
change), and run it in the SQL editor. Check it's scheduled:

```sql
select jobname, schedule, active from cron.job;
select start_time, status, return_message from cron.job_run_details order by start_time desc limit 5;
```

## Test

1. Stop `main.py --watch` if it's running on a laptop.
2. Record a set in My training (one sensor: open the site with `?mirror=1`).
3. Within a few seconds, about 10–30 s if the app was asleep (cold start), the set's Speed cell fills in without a refresh.

If it doesn't:

- **Did the webhook fire?** Supabase SQL editor:
  ```sql
  select created, status_code, left(content, 200) as content
  from net._http_response order by created desc limit 5;
  ```
  `202` with "Queued …" is right. `401` means the `code=` in the URL is wrong. No row means the webhook isn't set up for Insert on `sessions`.
- **What did the function do?** Function app → **Monitoring → Log stream**, or Application Insights → **Logs**.
  Look for `Queued session …` and then `OK …`, `FAILED …` (saved as the set's analysis error; the website shows it) or `RETRY …` (temporary; Azure tries again up to 5 times).
- **Queue one recording by hand**, e.g. after fixing something. It has to be still waiting: `analyzed_at` and `analysis_error` empty.
  ```bash
  curl -X POST "https://<app name>.azurewebsites.net/api/new-session?code=<key>" -H "Content-Type: application/json" -d "{\"id\": \"<session id>\"}"
  ```

## Warm-up (avoiding the cold start)

When both real sensors connect, and again on **● Record**, the website calls
`/api/warm-up` (no key; it only wakes the app and touches no data; at most
once every 3 minutes per browser). The function puts a `warm-up` message on
the queue, so the **analysis** instance starts and loads numpy, scipy and the
data team's code while the athlete gets ready. (On Flex Consumption the queue
function runs on its own instances: waking the HTTP functions alone wouldn't
help.) By the time the set ends, the result should take a few seconds.

Check it: Function app → Functions → `process_session` → Invocations shows
`Warm-up: analysis loaded in … s` shortly after sensors connect.

Azure puts idle instances back to sleep after some minutes, so a long wait
between connecting and the first set can still mean a cold start. For a live
demo, also set **Settings → Scale and concurrency → Always ready**:
`function:process_session` = 1 for the demo week (billed every hour it's on;
remove it afterwards), and connect the sensors a few minutes before presenting.

## Cost

Flex Consumption bills only while code runs, with a monthly free grant
(100,000 GB-s and 250,000 runs). Each recorded set takes a few seconds; the
daily sweep adds ~30 short runs a month; the database retry only calls Azure when a recording is waiting. A course project should stay within
the free grant or cost cents, plus a little for storage and Application
Insights. To be safe: Azure portal → **Cost Management → Budgets**, add a
budget (e.g. $10) with an e-mail alert.

**Cold start:** the first set after a quiet period waits while Azure starts the
app and loads scipy. Flex Consumption can keep an instance *always ready*,
which removes the wait but costs for every hour it's on. Not set up for now.
