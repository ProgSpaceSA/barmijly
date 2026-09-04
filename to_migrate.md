# To migrate

- [ ] `cd backend && npx prisma migrate deploy` — Tool + Feedback + HubGuide tables, SECURITY category, ToolTeam on tools, enums, and TOOL_*/FEEDBACK_* notification types (دليل العمل)
- [ ] Deploy backend before frontend — `/tools`, `/feedback`, and `/guides` endpoints are required by the `/hub` page; tools now require `teams`
