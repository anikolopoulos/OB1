# Build Your Open Brain with an AI Coding Tool

## The Short Version

Point your AI coding tool at this repo and tell it to walk you through the [setup guide](01-getting-started.md). That's it. The guide has every Docker command, every config step, every API call — your AI reads it and helps you execute each one.

This works in Cursor, Claude Code, Codex, Windsurf, OpenClaw, or any AI coding tool that can read files. You don't need to copy-paste from a browser or follow along manually. Let your AI be your pair programmer through the whole build.

## How to Start

1. Clone or open this repo in your AI coding tool
2. Tell it: **"Read `docs/01-getting-started.md` and walk me through building my Open Brain step by step."**
3. Follow along. It'll handle the code parts. You handle the infrastructure (VPS setup, DNS, Docker installation) and the clicking (Slack app settings, AI client connectors).

That's the whole workflow. The sections below cover what to watch out for.

## What Your AI Handles Well

- **CLI commands** — Docker Compose setup, `curl` commands for the Admin API, environment variable configuration. Your AI can run these directly if your tool supports terminal access.
- **Configuration** — Setting up your `.env` file, configuring LiteLLM models, and wiring everything together. The guide spells it all out and your AI can walk you through each value.
- **Debugging** — When something doesn't work, your AI can read Docker logs (`docker compose logs app`) and help diagnose the issue. This is where the AI-assisted path genuinely shines over going solo.
- **Extending** — Adding new brains via the Admin API, customizing the server, building on top of the foundation. Your AI can reference the codebase directly.

## What You Should Do Manually

Some steps involve clicking through web UIs or provisioning infrastructure where your AI can't help directly. These are fast but you need to do them yourself:

- **VPS provisioning** — Spin up a server on your preferred provider (Hetzner, DigitalOcean, AWS, etc.). Your AI can tell you the minimum specs but you need to create the account and provision the machine.
- **DNS setup** — Point your domain at your server's IP address. Your AI can tell you what records to create but you need to do it in your DNS provider's dashboard.
- **Docker installation** — Install Docker and Docker Compose on your server. Your AI can give you the exact commands for your OS.
- **Slack app configuration** — Creating the app, setting OAuth scopes, installing to workspace, enabling Event Subscriptions.
- **Connecting AI clients** — Adding the MCP connector in Claude Desktop, ChatGPT, or other clients (Settings menus in each app).

Your AI can tell you exactly what to click and where — it just can't click for you.

## Common Gotchas

### Don't let your AI improvise when it can't read the source

If your AI can't access a file or section, it will make something up rather than tell you it's stuck. This happened during early builds when the guide lived on Substack — collapsed code sections weren't visible to the AI, so it invented its own version of the code. The invented version was plausible but wrong.

Now that the full guide lives in this repo, this shouldn't happen — your AI can read everything. But the principle still applies: if your AI is generating setup code from scratch instead of referencing `docs/01-getting-started.md`, stop it and point it back to the file.

### Configuration problems need configuration fixes

When something breaks, your AI's instinct is to rewrite code. Resist this. The server code in the guide works. Problems are almost always configuration:

- An environment variable that doesn't match (check your `.env` file)
- A URL that's missing the access key
- A Slack event subscription that's missing `message.groups`
- A step that got skipped

Check application logs first (`docker compose logs app`). Paste the error to your AI and let it diagnose — but don't let it start rewriting the server code unless the logs point to an actual code problem.

## Tips

- **Go step by step.** Don't ask your AI to "set up the whole thing." Walk through Part 1 (Capture), test it, then do Part 2 (Retrieval). The guide is structured this way for a reason.
- **Test at each milestone.** The guide has specific test steps and expected responses. Do them. If capture works, you know your database, server, and Slack connection are all solid before you move on to MCP.
- **Read the [FAQ](03-faq.md) when stuck.** It covers the most common issues people hit, including the exact auth error pattern that trips up Claude Desktop and ChatGPT connections.

## After Setup

Once your Open Brain is running, check out the [Extensions learning path](../README.md#extensions--the-learning-path). Same approach works — point your AI at an extension's README and build together.

---

*This guide exists because Matt Hallett built his first Open Brain entirely through Cursor with Claude, and it worked. If you build yours with an AI coding tool, [share how it went](https://discord.gg/Cgh9WJEkeG) in the Discord `#show-and-tell` channel.*
