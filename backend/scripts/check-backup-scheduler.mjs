import 'dotenv/config'
import assert from 'node:assert/strict'

const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0]
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `select j.jobname,j.schedule,j.active,
    (select status from cron.job_run_details d where d.jobid=j.jobid order by start_time desc limit 1) as last_status,
    (select status_code from net._http_response order by created desc limit 1) as last_http_status
    from cron.job j where j.jobname='service-backup-worker'` }),
})
assert.ok(response.ok, `Scheduler status request failed: ${response.status}`)
const rows = await response.json()
assert.equal(rows[0]?.active, true)
assert.equal(rows[0]?.schedule, '* * * * *')
console.log(JSON.stringify(rows))
