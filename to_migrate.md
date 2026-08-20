# To migrate

- [ ] `cd backend && npx prisma migrate deploy` — Apply pending Prisma migrations (ticket number, company logo, task status)
- [ ] Set `DAILY_DIGEST_TIME` in backend `.env` — Digest send time (`HH:mm`, default `09:00`)
- [ ] Set `DAILY_DIGEST_TIMEZONE` in backend `.env` — Digest timezone (default `Asia/Riyadh`)
- [ ] Set `DAILY_DIGEST_DAYS` in backend `.env` — Digest working days, cron day-of-week (default `0-4`, Sun–Thu)
- [ ] Set `DAILY_DIGEST_ENABLED` in backend `.env` — Digest cron on/off (default on; `"false"` to disable)
- [ ] Set `DAILY_DIGEST_LOOKBACK_HOURS` in backend `.env` — How far back the digest looks (default `24`)
