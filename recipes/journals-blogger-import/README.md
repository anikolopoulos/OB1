# Journals/Blogger Import

<div align="center">

![Community Contribution](https://img.shields.io/badge/OB1_COMMUNITY-Approved_Contribution-2ea44f?style=for-the-badge&logo=github)

**Created by [@alanshurafa](https://github.com/alanshurafa)**

*Reviewed and merged by the Open Brain maintainer team — thank you for building the future of AI memory!*

</div>

> Import blog posts from Google Blogger Atom XML exports into Open Brain.

## What It Does

Parses Google Blogger's Atom XML export format and imports blog posts and comments as thoughts with embeddings. Works with any standard Atom feed export. Blog posts are stored as thoughts with `source_type: blogger_import`.

## Prerequisites

- Working Open Brain setup ([guide](../../docs/01-getting-started.md))
- **Blogger export files** — `.atom` files from Google Blogger
- **Node.js 18+** installed
- **LiteLLM API key** for embedding generation

## Credential Tracker

```text
JOURNALS/BLOGGER IMPORT -- CREDENTIAL TRACKER
--------------------------------------

FROM YOUR OPEN BRAIN SETUP
  DATABASE_URL:          ____________
  LiteLLM API Key:       ____________

--------------------------------------
```

## Steps

1. **Export your blog data:**
   - Go to your Blogger Dashboard → Settings → Manage Blog → Back up content
   - Download the `.atom` file
   - If you have multiple blogs, export each one

2. **Place all `.atom` files in a folder:**
   ```
   blogger-exports/
   ├── my-tech-blog.atom
   ├── personal-journal.atom
   └── travel-blog.atom
   ```

3. **Copy this recipe folder** and install dependencies:
   ```bash
   cd journals-blogger-import
   npm install
   ```

4. **Create `.env`** with your credentials (see `.env.example`):
   ```env
   DATABASE_URL=postgresql://ob1:password@localhost:5432/ob1
   LITELLM_BASE_URL=http://localhost:4000/v1
   LITELLM_API_KEY=your-litellm-api-key
   ```

5. **Preview what will be imported** (dry run):
   ```bash
   node import-blogger.mjs /path/to/blogger-exports --dry-run
   ```

6. **Run the import:**
   ```bash
   node import-blogger.mjs /path/to/blogger-exports
   ```

## Expected Outcome

After running the import:
- Each blog post becomes a thought with `source_type: blogger_import`
- Post titles and publication dates are preserved
- HTML content is stripped to plain text (line breaks preserved)
- Blog comments are imported separately
- Settings and template entries are automatically filtered out
- All content deduplicated via SHA-256 content fingerprint — re-running is safe

**Scale reference:** Tested with 3,000+ blog posts across multiple blogs imported successfully.

## Troubleshooting

**Issue: No entries found in .atom file**
The parser looks for `<entry>` tags with `kind#post` or `kind#comment` categories. Blogger settings and template entries are filtered out. If your Atom file uses a different schema, check the XML structure.

**Issue: HTML tags appearing in imported text**
The HTML stripper handles common tags and entities. If you see raw HTML in your thoughts, the post may use unusual HTML structures. The content is still searchable.

**Issue: Wrong dates on posts**
The parser uses the `<published>` tag from the Atom feed. If dates look wrong, check the timezone in your Blogger export settings.

**Issue: Embedding errors**
Check that `LITELLM_API_KEY` is valid and your LiteLLM instance is reachable at `LITELLM_BASE_URL`. Test with: `curl $LITELLM_BASE_URL/models -H "Authorization: Bearer $LITELLM_API_KEY"`.

**Issue: Database connection errors**
Verify `DATABASE_URL` is correct and PostgreSQL is running. Test with: `psql $DATABASE_URL -c "SELECT 1;"`.
