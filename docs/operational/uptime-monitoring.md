# Uptime Monitoring Setup

Free uptime monitoring using UptimeRobot - takes about 5 minutes to configure.

## What Gets Monitored

| Endpoint | URL | Purpose |
|----------|-----|---------|
| API health | `https://api.luckystop.cliffindus.com/health` | Backend + database liveness |
| Admin portal | `https://admin.luckystop.cliffindus.com` | Frontend availability |

## Health Check Response

When the backend is healthy, `/health` returns:

```json
{
  "status": "ok",
  "version": "1.1.0",
  "timestamp": "2026-05-30T12:00:00.000Z",
  "uptime": 3600,
  "db": "ok"
}
```

HTTP `200` = healthy. HTTP `503` = database unreachable (backend up, DB down). Any other response = server down.

## UptimeRobot Setup

1. Go to [uptimerobot.com](https://uptimerobot.com) and create a free account.
2. Click **+ Add New Monitor**.

### Monitor 1 - API Backend

| Field | Value |
|-------|-------|
| Monitor Type | HTTP(s) |
| Friendly Name | Lucky Stop API |
| URL | `https://api.luckystop.cliffindus.com/health` |
| Monitoring Interval | 5 minutes |
| Alert Contacts | Your email |

Under **Advanced Settings**:
- **Keyword Monitoring**: enable, set keyword to `"status":"ok"`, set to alert if keyword is NOT present. This catches the `503 degraded` case where the server responds but the DB is down.

### Monitor 2 - Admin Portal

| Field | Value |
|-------|-------|
| Monitor Type | HTTP(s) |
| Friendly Name | Lucky Stop Admin |
| URL | `https://admin.luckystop.cliffindus.com` |
| Monitoring Interval | 5 minutes |
| Alert Contacts | Your email |

No keyword needed - just check for HTTP 200.

## Alert Notifications

- **Email**: enabled by default on the free plan
- **SMS**: available (free plan includes 10/month)
- **Slack/Discord**: available via integrations tab if you want team alerts

## Free Plan Limits

- 50 monitors (we use 2)
- 5-minute check interval (minimum on free plan)
- 2 months of data history
- Email + SMS alerts included

## What to Do When You Get an Alert

1. Check the Render dashboard at [dashboard.render.com](https://dashboard.render.com) - look for deploy failures or service crashes.
2. Check the Neon console for database connectivity issues.
3. If the API is down but Render shows it running, check logs in the Render dashboard for runtime errors.
4. If it's just slow (not down), check Render metrics for memory or CPU spikes.

## Status Page (Optional)

UptimeRobot provides a free public status page you can share with store owners:

1. Go to **My Settings** → **Status Pages**
2. Create a new page with both monitors
3. Share the URL with store owners so they can self-check during outages

URL format: `https://stats.uptimerobot.com/XXXXXXX`
