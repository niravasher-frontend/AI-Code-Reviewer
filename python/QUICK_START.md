# Quick Start Guide

Get your AI Code Review Agent up and running in 15 minutes!

## Fast Track Setup

### 1. Install Dependencies (2 minutes)

```bash
cd python
pip install -r requirements.txt
```

### 2. Set Environment Variables (2 minutes)

Create `.env` in the python directory:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk_your_key_here
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX_NAME=codebase-embedding-384
TARGET_REPO_OWNER=your-username
TARGET_REPO_NAME=your-repo
```

### 3. Update Documentation (5 minutes)

Edit `docs/business-logic.md` with:
- Your project description
- Key features and components
- Code standards and best practices
- Security requirements
- Common patterns to follow

### 4. Index Your Knowledge Base (3 minutes)

```bash
# Index your codebase
python scripts/index_codebase.py

# Index your documentation
python scripts/index_documentation.py

# Test it works (optional)
python scripts/test_retrieval.py
```

**Expected output:**
```
INFO - INDEXING COMPLETE!
INFO - Files processed: 45
INFO - Total vectors in index: 45
```

### 5. Deploy (3 minutes)

**Option A: Run Locally**
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000
```

**Option B: Deploy to Render**
```bash
# Connect repo to Render and deploy
# Set environment variables in Render dashboard
```

**Option C: Deploy with Docker**
```bash
docker build -t ai-code-reviewer .
docker run -p 8000:8000 --env-file .env ai-code-reviewer
```

Copy your deployment URL: `https://your-project.onrender.com`

### 6. Set Up GitHub Webhook (2 minutes)

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. Set **Payload URL**: `https://your-project.onrender.com/api/webhook`
3. Set **Content type**: `application/json`
4. Set **Secret**: (optional, matches `GITHUB_WEBHOOK_SECRET`)
5. Select **Just the pull_request event**
6. Click **Add webhook**

### 7. Test! (1 minute)

1. Create a test PR in your repository
2. Wait 10-30 seconds
3. Check for AI review comment!

---

## What You Get

Your AI agent will automatically:
- Review every PR when opened or updated
- Analyze code quality, security, and performance
- Check against your business logic and patterns
- Provide specific, actionable feedback
- Learn from your codebase context

## Example Review

```markdown
## AI Code Review (RAG-Enhanced)

**File: src/components/Login.jsx**
- Good: Proper error handling with try/catch
- Concern: Password should be validated before sending - Add min length check
- Critical: API key exposed in code - Move to environment variables

**File: src/utils/api.js**
- Good: Following project's async/await pattern
- Concern: Missing timeout for fetch requests - Add timeout to prevent hanging

---
*Powered by GPT-4 + Knowledge Base | Context-Aware Review*
*Analyzed with 8 pieces of codebase context*
```

## Maintenance

**When your code changes:**
```bash
python scripts/index_codebase.py
```

**When your docs change:**
```bash
python scripts/index_documentation.py
```

**Test retrieval:**
```bash
python scripts/test_retrieval.py "your search query"
```

## Costs

For ~10 PRs/month: **~$2-5/month**
- OpenAI: $2-5
- Pinecone: Free (100K vectors)
- Render: Free tier available

## Not Working?

### Webhook not triggering?
```bash
# Check server logs
uvicorn src.main:app --reload

# Test webhook endpoint
curl -X POST http://localhost:8000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action": "opened", "pull_request": {}, "repository": {}}'
```

### No review comments?
- Check GitHub webhook "Recent Deliveries" shows 200 status
- Check server logs for errors
- Verify all environment variables are set

### Bad context/reviews?
- Update `docs/business-logic.md` with more detail
- Re-run `python scripts/index_documentation.py`
- Adjust `CONTEXT_TOP_K` in `src/config.py` to retrieve more/less context

---

## Need More Help?

- Full documentation: See `README.md`
- Setup checklist: See `SETUP_CHECKLIST.md`
- Test your system: `python scripts/test_retrieval.py`
- API docs: Visit `http://localhost:8000/docs`

---

**You're all set! Create a PR and watch your AI agent work!**
