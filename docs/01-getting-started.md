# Build Your Open Brain

This is the core of Open Brain — the foundation everything else builds on. Once this is running, you'll have a personal knowledge system that any AI can read from and write to. Every extension, recipe, and integration in this repo starts here.

> **Prefer video?** Watch the [Open Brain Startup Guide](https://vimeo.com/1174979042/f883f6489a) (~27 min) for a walkthrough of the original Supabase-based setup. The concepts are the same, but **this written guide covers the current Docker-based architecture** — follow this guide for the most up-to-date setup steps.

About 15 minutes. Zero coding experience. One VPS, three Docker containers:

- **PostgreSQL** (pgvector) — Your database, with schema-per-user isolation
- **Node.js app** — Your MCP server + Admin API + Slack webhook handler
- **Reverse proxy** — Caddy (included in `deploy/`), Traefik, Nginx, or Cloudflare for HTTPS

All AI access goes through **LiteLLM** (or any OpenAI-compatible endpoint) for embeddings and metadata extraction.

---

## What You'll Need

Before you start, make sure you have:

- A **VPS** with Docker and Docker Compose installed (Hetzner CX31 recommended: 4 vCPU, 8 GB RAM, ~$7/month)
- A **domain** pointed to your VPS (for HTTPS — via Caddy, Cloudflare, or your existing reverse proxy)
- A **LiteLLM instance** (or any OpenAI-compatible API endpoint) for embeddings and chat — the default is `litellm.leadetic.com`

> [!TIP]
> **Never set up a VPS before?** Hetzner's cloud console walks you through it. Create an account, spin up a CX31 server with Ubuntu 24.04, and follow [Docker's official install guide](https://docs.docker.com/engine/install/ubuntu/). The whole process takes about 5 minutes. Point your domain's A record to the server's IP address, and you're ready to go.

Everything you need to track fits in one `.env` file — no spreadsheets, no dashboards, no third-party consoles.

---

![Step 1](https://img.shields.io/badge/Step_1-Clone_and_Configure-E53935?style=for-the-badge)

SSH into your VPS, clone the repo, and set up your environment variables. This is the only configuration step — everything else is automated.

![1.1](https://img.shields.io/badge/1.1-Clone_the_Repo-555?style=for-the-badge&labelColor=E53935)

```bash
ssh root@your-server-ip
git clone https://github.com/NateBJones-Projects/OB1.git ob1
cd ob1/deploy
```

![1.2](https://img.shields.io/badge/1.2-Create_Your_Environment_File-555?style=for-the-badge&labelColor=E53935)

```bash
cp .env.example .env
```

![1.3](https://img.shields.io/badge/1.3-Generate_Secrets-555?style=for-the-badge&labelColor=E53935)

Generate a strong database password and an admin API key:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" >> .env
echo "ADMIN_API_KEY=$(openssl rand -hex 32)" >> .env
```

> [!CAUTION]
> These are generated once and written directly into your `.env` file. If you need to see them later, just `cat .env`. But treat this file like a password vault — never commit it to version control or share it publicly.

![1.4](https://img.shields.io/badge/1.4-Fill_In_the_Rest-555?style=for-the-badge&labelColor=E53935)

Open `.env` in your editor (nano, vim, whatever you prefer) and fill in the remaining values:

```bash
nano .env
```

The file should look like this when you're done:

```ini
# PostgreSQL
POSTGRES_USER=ob1
POSTGRES_PASSWORD=<already filled by Step 1.3>
POSTGRES_DB=ob1

# LiteLLM
LITELLM_BASE_URL=https://litellm.leadetic.com/v1
LITELLM_API_KEY=your-litellm-api-key

# Models (optional overrides — defaults are fine)
EMBEDDING_MODEL=text-embedding-3-small
METADATA_MODEL=gpt-4o-mini

# Admin API
ADMIN_API_KEY=<already filled by Step 1.3>

# Domain (for the reverse proxy — set to your actual domain)
DOMAIN=brain.yourdomain.com
```

> [!IMPORTANT]
> Set `DOMAIN` to the actual domain you pointed to this server. If using the included Caddy config, it will automatically provision a TLS certificate. If you're integrating into an existing reverse proxy (Traefik, Nginx, Cloudflare), configure routing there instead and the `DOMAIN` variable is used only for reference.

> [!TIP]
> You can leave `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` empty for now. Step 6 covers Slack capture as an optional add-on.

✅ **Done when:** Your `.env` file has `POSTGRES_PASSWORD`, `ADMIN_API_KEY`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`, and `DOMAIN` all filled in.

---

![Step 2](https://img.shields.io/badge/Step_2-Start_the_Services-F4511E?style=for-the-badge)

One command brings up your entire Open Brain stack — PostgreSQL with pgvector, the Node.js MCP server, and the reverse proxy. The database initializes itself automatically using the SQL scripts in `db/init/` — no manual SQL required.

```bash
docker compose up -d
```

Wait about 30 seconds for PostgreSQL to initialize, then verify everything is running:

```bash
docker compose ps
```

You should see your services — `postgres`, `app`, and your reverse proxy — all with status `Up` or `healthy`.

Test the health endpoint:

```bash
curl http://localhost:3000/health
```

> [!CAUTION]
> If `docker compose ps` shows a service as `restarting` or `exited`, check the logs:
>
> ```bash
> docker compose logs postgres   # Database issues
> docker compose logs app        # App startup issues
> docker compose logs caddy      # TLS/domain issues (if using Caddy)
> ```
>
> The most common issue is a missing or incorrect `DOMAIN`. If using Caddy, it will fail to start if it can't reach the domain or provision a certificate.

Now test HTTPS from outside the server:

```bash
curl https://brain.yourdomain.com/health
```

Replace `brain.yourdomain.com` with your actual domain. You should get a healthy response.

✅ **Done when:** `docker compose ps` shows all three services healthy, and `curl https://your-domain/health` returns a success response.

---

![Step 3](https://img.shields.io/badge/Step_3-Create_Your_First_Brain-FB8C00?style=for-the-badge)

Open Brain uses **multi-brain architecture** — each user gets their own isolated PostgreSQL schema. No shared tables, no row-level security, no `user_id` columns. Your data is physically separated from everyone else's.

Create your first brain using the Admin API:

```bash
curl -X POST https://brain.yourdomain.com/admin/brains \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"slug":"your-name","display_name":"Your Name"}'
```

Replace `brain.yourdomain.com` with your domain and `your-name`/`Your Name` with whatever you'd like.

> [!WARNING]
> The response includes an **API key that is shown only once**. Copy it immediately and save it somewhere safe. This key is what you (and your AI clients) will use to access this specific brain.

The response will look something like:

```json
{
  "slug": "your-name",
  "display_name": "Your Name",
  "api_key": "ob1_a3f8b2c1d4e5..."
}
```

Save that `api_key` value — you'll need it in the next step.

> [!TIP]
> You can create as many brains as you want. One for work, one for personal, one for a side project — each is completely isolated. Just run the same `curl` command with a different `slug` and `display_name`.

✅ **Done when:** You have your brain's API key saved somewhere safe.

---

![Step 4](https://img.shields.io/badge/Step_4-Connect_Your_AI-43A047?style=for-the-badge)

Your MCP Connection URL is:

```text
https://brain.yourdomain.com/mcp?key=your-brain-api-key
```

Replace `brain.yourdomain.com` with your domain and `your-brain-api-key` with the key from Step 3.

Pick your AI client below:

<details>
<summary>🤖 <strong>4.1 — Claude Desktop</strong></summary>

> [!NOTE]
> No JSON config files. No Node.js. No terminal. This is the simplest connection method.

1. Open Claude Desktop → **Settings** → **Connectors**
2. Click **Add custom connector**
3. Name: `Open Brain`
4. Remote MCP server URL: paste your **MCP Connection URL** (the one ending in `?key=your-brain-api-key`)
5. Click **Add**

That's it. Start a new conversation, and Claude will have access to your Open Brain tools. You can enable or disable it per conversation via the "+" button → Connectors.

</details>

<details>
<summary>🤖 <strong>4.2 — ChatGPT</strong></summary>

> [!WARNING]
> Requires a paid ChatGPT plan (Plus, Pro, Business, Enterprise, or Edu). Works on the web at [chatgpt.com](https://chatgpt.com) only — not available on mobile.

**Enable Developer Mode (one-time setup):**

1. Go to [chatgpt.com](https://chatgpt.com) → click your profile icon → **Settings**
2. Navigate to **Apps & Connectors** → **Advanced settings**
3. Toggle **Developer mode** ON

> [!CAUTION]
> Enabling Developer Mode disables ChatGPT's built-in Memory feature. Yes, that's ironic for a brain tool. Your Open Brain replaces that functionality anyway — and it works across every AI, not just ChatGPT.

**Add the connector:**

1. In Settings → **Apps & Connectors**, click **Create**
2. Name: `Open Brain`
3. Description: `Personal knowledge base with semantic search` (or whatever you want — this is just for your reference)
4. MCP endpoint URL: paste your **MCP Connection URL** (the one ending in `?key=your-brain-api-key`)
5. Authentication: select **No Authentication** (your brain key is embedded in the URL)
6. Click **Create**

> [!TIP]
> ChatGPT is less intuitive than Claude at picking the right MCP tool automatically. If it doesn't use your brain on its own, be explicit: "Use the Open Brain search_thoughts tool to find my notes about project planning." After it gets the pattern once or twice in a conversation, it usually picks up the habit.

</details>

<details>
<summary>🤖 <strong>4.3 — Claude Code</strong></summary>

One command:

```bash
claude mcp add open-brain --transport http \
  https://brain.yourdomain.com/mcp?key=your-brain-api-key
```

Replace the URL with your actual domain and brain key.

</details>

<details>
<summary>🤖 <strong>4.4 — Other Clients (Cursor, VS Code Copilot, Windsurf)</strong></summary>

Every MCP client handles remote servers slightly differently. The server accepts your brain key via the URL query parameter — pick whichever approach your client supports:

**Option A: URL with key (easiest).** If your client has a field for a remote MCP server URL, paste the full MCP Connection URL including `?key=your-brain-api-key`. This works for any client that supports remote MCP without requiring headers.

**Option B: mcp-remote bridge (required for Claude Desktop).** If your client only supports local stdio servers (configured via a JSON config file), use `mcp-remote` to bridge to the remote server. This requires Node.js installed. Claude Desktop uses this approach.

Add to your client's MCP config (e.g., `claude_desktop_config.json` for Claude Desktop):

```json
{
  "mcpServers": {
    "open-brain": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://brain.yourdomain.com/mcp?key=your-brain-api-key"
      ]
    }
  }
}
```

No environment variables or certificates needed — `mcp-remote` handles the connection automatically. This works on any machine with Node.js/npx installed.

</details>

✅ **Done when:** You can start a conversation in your AI client and it has access to Open Brain tools (search_thoughts, list_thoughts, thought_stats, capture_thought).

---

![Step 5](https://img.shields.io/badge/Step_5-Test_It-00897B?style=for-the-badge)

Ask your AI naturally. It picks the right tool automatically:

| Prompt | Tool Used |
| ------ | --------- |
| "Save this: decided to move the launch to March 15 because of the QA blockers" | 🔖 Capture thought |
| "Remember that Marcus wants to move to the platform team" | 🔖 Capture thought |
| "What did I capture about career changes?" | 🔗 Semantic search |
| "What did I capture this week?" | 🔗 Browse recent |
| "How many thoughts do I have?" | 🔗 Stats overview |
| "Find my notes about the API redesign" | 🔗 Semantic search |
| "Show me my recent ideas" | 🔗 Browse + filter |
| "Who do I mention most?" | 🔗 Stats |

Start by capturing a test thought. In your connected AI, say:

```text
Remember this: Sarah mentioned she's thinking about leaving her job to start a consulting business
```

Wait a few seconds. Your AI should confirm the capture and show you the extracted metadata (type, topics, people, action items).

Now try searching:

```text
What did I capture about Sarah?
```

Your AI should retrieve the thought you just saved.

> [!TIP]
> The capture tool works from any MCP-connected AI — Claude Desktop, ChatGPT, Claude Code, Cursor. Wherever you're working, you can save a thought without switching apps.

✅ **Done when:** You've captured a test thought and successfully searched for it.

---

![Step 6](https://img.shields.io/badge/Step_6-Set_Up_Slack_Capture_(Optional)-1E88E5?style=for-the-badge)

Want to capture thoughts straight from Slack? The Node.js app includes a built-in Slack webhook handler — no extra services needed.

![6.1](https://img.shields.io/badge/6.1-Create_a_Slack_App-555?style=for-the-badge&labelColor=1E88E5)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** → **From scratch**
2. Name it `Open Brain` and pick your workspace
3. Under **OAuth & Permissions**, add these Bot Token Scopes:
   - `channels:history` — read messages in public channels
   - `chat:write` — post confirmation replies
4. Click **Install to Workspace** and authorize
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

![6.2](https://img.shields.io/badge/6.2-Get_the_Signing_Secret-555?style=for-the-badge&labelColor=1E88E5)

Under **Basic Information** → **App Credentials**, copy the **Signing Secret**.

![6.3](https://img.shields.io/badge/6.3-Add_Secrets_to_Your_Environment-555?style=for-the-badge&labelColor=1E88E5)

SSH into your VPS and edit your `.env` file:

```bash
cd ob1/deploy
nano .env
```

Fill in the Slack values:

```ini
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
```

Restart the app to pick up the new variables:

```bash
docker compose up -d app
```

![6.4](https://img.shields.io/badge/6.4-Map_a_Channel_to_a_Brain-555?style=for-the-badge&labelColor=1E88E5)

Tell Open Brain which Slack channel should feed into which brain:

```bash
curl -X POST https://brain.yourdomain.com/admin/slack/channels \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"C0123ABCDEF","brain_slug":"your-name"}'
```

Replace `C0123ABCDEF` with your Slack channel ID (right-click a channel in Slack → **View channel details** → copy the ID at the bottom).

![6.5](https://img.shields.io/badge/6.5-Configure_the_Event_Subscription-555?style=for-the-badge&labelColor=1E88E5)

Back in the Slack app settings:

1. Go to **Event Subscriptions** → toggle **Enable Events** ON
2. Set the Request URL to: `https://brain.yourdomain.com/slack/events`
3. Slack will send a verification challenge — the app handles it automatically
4. Under **Subscribe to bot events**, add `message.channels`
5. Click **Save Changes**

> [!TIP]
> Messages posted in the mapped channel will be automatically captured as thoughts in the linked brain — with embeddings and metadata, just like thoughts captured via MCP.

✅ **Done when:** You can post a message in your Slack channel and see it appear as a thought in your brain.

---

![Step 7](https://img.shields.io/badge/Step_7-Install_Extensions_(Optional)-5C6BC0?style=for-the-badge)

Extensions add specialized schemas to your brain — structured tables for specific use cases like household management, meal planning, or job hunting. They're installed per-brain using the Admin API.

Install an extension:

```bash
curl -X POST https://brain.yourdomain.com/admin/brains/your-name/extensions/household \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

Available extensions:

| Extension | What It Adds |
| --------- | ------------ |
| `household` | Household items, inventory, and maintenance tracking |
| `maintenance` | Home/vehicle maintenance schedules and history |
| `calendar` | Events, reminders, and scheduling |
| `meals` | Meal planning, recipes, and grocery lists |
| `crm` | Contact management and relationship tracking |
| `jobhunt` | Job applications, interviews, and follow-ups |

> [!TIP]
> You can install multiple extensions on the same brain. Each one adds its own tables to the brain's schema — they don't interfere with each other or with the core thoughts table.

✅ **Done when:** The extension returns a success response and your AI can access the new tools.

---

<details>
<summary>❓ <strong>Troubleshooting</strong></summary>

**❌ Claude Desktop tools don't appear**

Make sure you added the `mcp-remote` entry in `claude_desktop_config.json` (Settings → Desktop app → Developer → Edit Config). After editing, fully quit Claude Desktop (Cmd+Q) and reopen. Check Settings → Desktop app → Developer — your server should appear in the list. If it shows "failed", click it to see the error logs. The most common issue is `npx` not being found — make sure Node.js is installed.

**❌ ChatGPT doesn't use the Open Brain tools**

First, confirm Developer Mode is enabled (Settings → Apps & Connectors → Advanced settings). Without it, ChatGPT only exposes limited MCP functionality that won't cover Open Brain's full toolset. Next, check that the connector is active for your current conversation — look for it in the tools/apps panel. If it's connected but ChatGPT ignores it, be direct: "Use the Open Brain search_thoughts tool to search for [topic]." ChatGPT often needs explicit tool references the first few times before it starts picking them up automatically.

**❌ Getting 401 errors**

The brain key doesn't match what's in the database. Double-check that the `?key=` value in your URL matches the API key returned when you created the brain in Step 3. Brain keys are case-sensitive.

**❌ `docker compose up` fails with port conflicts**

Something else is already using port 80, 443, or 5432 on your VPS. Check with `ss -tlnp` and stop the conflicting service, or adjust the port mappings in `docker-compose.yml`.

**❌ HTTPS isn't working**

If using Caddy: make sure your domain's A record points to the VPS IP address and DNS has propagated. Check `docker compose logs caddy`. If using Cloudflare: ensure the proxy is enabled (orange cloud) and the origin server has a valid certificate. If using Traefik or Nginx: check your reverse proxy logs and TLS configuration.

**❌ Search returns no results**

Make sure you've captured at least one thought first (see Step 5). Try asking the AI to "search with threshold 0.3" for a wider net. If that still returns nothing, check the app logs with `docker compose logs app` for errors.

**❌ Capture tool saves but metadata is wrong**

The metadata extraction is best-effort — the LLM is making its best guess with limited context. The embedding is what powers semantic search, and that works regardless of how the metadata gets classified. If you consistently want a specific classification, use the capture templates from the prompt kit to give the LLM clearer signals.

**❌ Health check passes locally but not via HTTPS**

Run `curl http://localhost:3000/health` on the VPS to confirm the app itself is healthy. If that works but `https://your-domain/health` doesn't, the issue is your reverse proxy or DNS. Check the reverse proxy logs and make sure your domain resolves to the correct IP.

</details>

<details>
<summary>🔍 <strong>How It Works Under the Hood</strong></summary>

**When you capture from any AI via MCP:** your AI client sends the text to the `capture_thought` tool → the Node.js app generates an embedding (1536-dimensional vector of meaning) AND extracts metadata via LiteLLM in parallel → both get stored in your brain's isolated PostgreSQL schema → confirmation returned to your AI.

**When you search your brain:** your AI client sends the query to the MCP server → the app generates an embedding of your question → PostgreSQL (pgvector) matches it against every stored thought by vector similarity → results come back ranked by meaning, not keywords.

The embedding is what makes retrieval powerful. "Sarah's thinking about leaving" and "What did I note about career changes?" match semantically even though they share zero keywords. The metadata is a bonus layer for structured filtering on top.

**Schema-per-user isolation:** Each brain gets its own PostgreSQL schema — a completely separate namespace with its own tables, indexes, and functions. There are no shared tables, no `user_id` columns, and no row-level security policies to manage. It's the simplest, strongest form of multi-tenant data isolation.

### Swapping Models

Because you're using LiteLLM (or any OpenAI-compatible endpoint), you can swap models by changing the `EMBEDDING_MODEL` and `METADATA_MODEL` values in your `.env` file and restarting the app. Just make sure embedding dimensions match (1536 for the current setup).

</details>

<details>
<summary>➕ <strong>Optional: Add More Capture Sources</strong></summary>

Your MCP server handles both reading and writing. But if you want a quick-capture channel outside your AI tools:

- **Slack Capture** (Step 6 above) — Type thoughts in a Slack channel, automatically embedded and stored
- More integrations in [`/integrations`](../integrations/)

</details>

<details>
<summary>🎉 <strong>What You Just Built — And What You Can Build Next</strong></summary>

You just deployed a self-hosted, multi-brain knowledge system with semantic search, schema-level data isolation, automatic HTTPS, and an open MCP protocol — in about 15 minutes. No third-party SaaS dependencies. No monthly platform fees. Your data lives on your own server.

Here's the thing worth noticing: because this is a standard Docker Compose stack with a PostgreSQL database, you can extend it with any tool that speaks SQL or HTTP. Want to add a new capture source? Write a webhook handler. Want to query your brain from a script? Hit the MCP endpoint. Want to back up your data? `pg_dump` the database. The whole system is transparent and hackable.

Got stuck or want to share what you've built? Join the [Open Brain Discord](https://discord.gg/Cgh9WJEkeG) — there's a `#help` channel for troubleshooting and a `#show-and-tell` channel for showing off.

</details>

---

## ➡️ Your Next Step

Your Open Brain is live. Now make it work for you. The **[Companion Prompts](02-companion-prompts.md)** cover the full lifecycle from here:

- ✅ **Memory Migration** — Pull everything your AI already knows about you into your brain so every tool starts with context instead of zero
- ✅ **Second Brain Migration** — Bring your existing notes from Notion, Obsidian, or any other system into your Open Brain without starting over
- ✅ **Open Brain Spark** — Personalized use case discovery based on your actual workflow, not generic examples
- ✅ **Quick Capture Templates** — Five patterns optimized for clean metadata extraction so your brain tags and retrieves accurately
- ✅ **The Weekly Review** — A Friday ritual that surfaces themes, forgotten action items, and connections you missed

Start with the Memory Migration. If you have an existing second brain, run the Second Brain Migration next. Then use the Spark to figure out what to capture going forward. The templates build the daily habit. The weekly review closes the loop.

### Then start importing your data

The companion prompts pull out what your AI already knows. **Recipes** go further — they connect directly to your existing services and bulk-import real data.

| Recipe | What It Does | Time |
| ------ | ------------ | ---- |
| [Email History Import](../recipes/email-history-import/) | Pull your Gmail archive into searchable thoughts | 30 min |
| [ChatGPT Conversation Import](../recipes/chatgpt-conversation-import/) | Ingest your full ChatGPT data export | 30 min |

Browse all recipes in [`/recipes`](../recipes/).

---

*Built by Nate B. Jones — companion to "Your Second Brain Is Closed. Your AI Can't Use It. Here's the Fix."*
