# Daily Digest

> Automated daily summary of your recent thoughts, delivered via email or Slack.

## What It Does

A scheduled job that runs on a cron schedule, queries your most recent thoughts, groups them by topic, and sends you a formatted summary. You wake up to a digest of everything your brain captured yesterday — themes, connections, and highlights.

## Prerequisites

- Working Open Brain setup ([guide](../../docs/01-getting-started.md))
- Docker Compose stack running
- LiteLLM API key (for generating the summary)
- One of: email sending service (Resend, SendGrid free tier) OR existing Slack webhook

## Credential Tracker

Copy this block into a text editor and fill it in as you go.

```text
DAILY DIGEST -- CREDENTIAL TRACKER
--------------------------------------

FROM YOUR OPEN BRAIN SETUP
  DATABASE_URL:          ____________
  LiteLLM API key:       ____________

DELIVERY METHOD (choose one)
  [ ] Email service
      Service name (Resend/SendGrid): ____________
      API key:                         ____________
      Sender email:                    ____________

  [ ] Slack
      Webhook URL:                     https://hooks.slack.com/services/____________

--------------------------------------
```

## Steps

<!-- TODO: Fill in step-by-step instructions -->

1. Configure the daily digest in your Docker stack
2. Configure your environment variables (delivery method, API keys)
3. Restart the Docker stack: `docker compose up -d`
4. Set up the cron trigger via `pg_cron` in PostgreSQL
5. Test with a manual invocation
6. Verify you receive the digest

## Expected Outcome

Every morning (or at your configured time), you receive a message containing:
- A count of thoughts captured in the last 24 hours
- Top themes/topics grouped by similarity
- 2-3 "highlight" thoughts that are most unique or interesting
- A brief AI-generated narrative connecting the day's thinking

The digest arrives via your chosen delivery method (email or Slack message).

## Troubleshooting

**Issue: Digest job deploys but never fires**
Solution: Make sure pg_cron extension is enabled and the cron job is configured correctly. Check `select * from cron.job` to verify it exists.

**Issue: Digest arrives but is empty**
Solution: The function queries thoughts from the last 24 hours. If you haven't captured anything recently, there's nothing to summarize. Test by capturing a few thoughts first.

**Issue: Email delivery fails**
Solution: Check your email service API key and sender domain. Resend requires domain verification. For testing, use Slack delivery instead.
