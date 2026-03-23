# Common Troubleshooting

Solutions for issues that come up across any Open Brain extension. If your problem is specific to one extension (e.g., a particular table or tool), check that extension's README instead.

## Connection Issues

**"Cannot connect to the database"**
- Verify your Docker stack is running: `docker compose ps`
- Check that `DATABASE_URL` is correctly set in your `.env` file
- Verify the PostgreSQL container is healthy: `docker compose logs postgres`
- Ensure schema-per-brain isolation is set up correctly

**"Getting 401 Unauthorized"**
- The access key doesn't match what's stored in your `.env` file
- Double-check that the `?key=` value in your Connection URL matches your MCP Access Key exactly
- If using header-based auth (Claude Code or mcp-remote), the header must be `x-access-key` (lowercase, with the dash)
- Verify the key is set in your `.env` file
- Try regenerating the key: `openssl rand -hex 32`, then update `MCP_ACCESS_KEY` in `.env` and restart with `docker compose up -d`

**"Tools don't appear in Claude Desktop"**
- Verify the connector is enabled for your conversation — click the "+" button at the bottom of the chat → Connectors → check the toggle
- Check that the MCP Connection URL is correct and includes `?key=your-access-key`
- Try removing and re-adding the connector in Settings → Connectors
- Start a new conversation after adding the connector
- Restart Claude Desktop after making changes

**"ChatGPT doesn't use the tools"**
- Confirm Developer Mode is enabled (Settings → Apps & Connectors → Advanced settings)
- Check that the connector is active for your current conversation in the tools/apps panel
- Be explicit: "Use the [tool_name] tool to [do thing]." ChatGPT often needs direct tool references the first few times before it picks up the habit.

## Deployment Issues

**Docker stack won't start**
- Verify Docker is installed and running: `docker --version`
- Check for port conflicts: `docker compose logs`
- Verify your `.env` file exists and has the required variables
- Run `docker compose up -d` and check logs: `docker compose logs app`

**MCP server returns errors**
- Check server logs: `docker compose logs app`
- Look for missing environment variables in the logs
- Verify your `.env` file has all required values
- Check the PostgreSQL container is healthy: `docker compose logs postgres`

## Database Issues

**"relation 'table_name' does not exist"**
- The extension's `schema.sql` wasn't run successfully
- Re-run the SQL via `psql` or `docker compose exec postgres psql`
- Check for errors in the SQL output — common issues include missing the pgvector extension or running statements out of order

**"permission denied" or RLS errors**
- Check that the `DATABASE_URL` in your `.env` file is correct
- For extensions using RLS (Extensions 4-6), verify the RLS policies were created by the schema.sql
- Check that `user_id` values are valid UUIDs
- Ensure all RLS-enabled tables have policies created correctly

**"Foreign key violation" errors**
- Parent records must exist before creating child records (e.g., create a company before adding a job posting)
- Verify the referenced ID exists and belongs to the same `user_id`
- Check that you're using the correct UUID — copy-paste rather than typing
- Ensure foreign key constraints are not blocking inserts

## Performance Issues

**Tools work but responses are slow**
- First request may take a moment if the server is starting up — this is normal
- Subsequent calls within the same session are faster
- Check your VPS location — pick the one closest to you
- If consistently slow, check the server logs for query performance issues: `docker compose logs app`

**Search returns no results**
- Make sure you've added data first (the extension starts empty)
- Try broader search terms — most search tools use ILIKE which requires partial matches
- Check date ranges and filters — a common issue is filtering by a date range that doesn't include your data
- For semantic search, try asking the AI to "search with threshold 0.3" for a wider net

## Data Issues

**"Date parsing errors"**
- Ensure dates are in ISO 8601 format: `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`
- The MCP server expects date strings, which PostgreSQL will parse
- For "N days from now" calculations, let the tool compute the date

**"Auto-calculated fields not updating"**
- Verify that the database trigger exists (check the schema.sql was run completely)
- Check that the tool completed successfully (look at the server logs via `docker compose logs app`)
- For date calculations, ensure the frequency/interval field has a value set
- For one-time tasks (null frequency), auto-calculated fields may remain null by design

## Getting More Help

- **OB1 Discord**: Join the [Open Brain Discord](https://discord.gg/Cgh9WJEkeG) — there's a `#help` channel for troubleshooting.

## Extensions That Use This

All extensions reference this guide for common issues:

- [Household Knowledge Base](../../extensions/household-knowledge/) (Extension 1)
- [Home Maintenance Tracker](../../extensions/home-maintenance/) (Extension 2)
- [Family Calendar](../../extensions/family-calendar/) (Extension 3)
- [Meal Planning](../../extensions/meal-planning/) (Extension 4)
- [Professional CRM](../../extensions/professional-crm/) (Extension 5)
- [Job Hunt Pipeline](../../extensions/job-hunt/) (Extension 6)
