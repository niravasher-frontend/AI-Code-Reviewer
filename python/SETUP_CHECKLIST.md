# Setup Checklist

Use this checklist to ensure your AI Code Reviewer is properly configured.

## Prerequisites

- [ ] Python 3.10+ installed
- [ ] pip package manager available
- [ ] Git installed
- [ ] GitHub account with repo access
- [ ] OpenAI account with API access
- [ ] Pinecone account (free tier works)

## API Keys & Accounts

### GitHub Personal Access Token
- [ ] Go to GitHub → Settings → Developer settings → Personal access tokens
- [ ] Generate new token (classic) with scopes:
  - [ ] `repo` (Full control of private repositories)
  - [ ] `read:org` (Read org membership - if using org repos)
- [ ] Copy token to `GITHUB_TOKEN` in `.env`

### OpenAI API Key
- [ ] Go to platform.openai.com → API Keys
- [ ] Create new secret key
- [ ] Copy to `OPENAI_API_KEY` in `.env`
- [ ] Verify billing is set up (required for API access)

### Pinecone API Key
- [ ] Go to pinecone.io → Create free account
- [ ] Create new project
- [ ] Go to API Keys → Copy API key
- [ ] Copy to `PINECONE_API_KEY` in `.env`

### Pinecone Index
- [ ] Create index with settings:
  - [ ] Name: `codebase-embedding-384`
  - [ ] Dimensions: `384`
  - [ ] Metric: `cosine`
  - [ ] Pod type: `starter` (free tier)
- [ ] Update `PINECONE_INDEX_NAME` in `.env` if using different name

## Environment Setup

### Install Dependencies
```bash
cd python
pip install -r requirements.txt
```
- [ ] All packages installed successfully
- [ ] No dependency conflicts

### Environment File
- [ ] Created `.env` file from `.env.example`
- [ ] `GITHUB_TOKEN` is set
- [ ] `OPENAI_API_KEY` is set
- [ ] `PINECONE_API_KEY` is set
- [ ] `PINECONE_INDEX_NAME` is set
- [ ] `TARGET_REPO_OWNER` is set (for indexing)
- [ ] `TARGET_REPO_NAME` is set (for indexing)

### Verify Configuration
```bash
python -c "from src.config import get_settings; s = get_settings(); print('Config OK')"
```
- [ ] No errors, prints "Config OK"

## Knowledge Base Setup

### Documentation
- [ ] Created `docs/` directory (if not exists)
- [ ] Added `docs/business-logic.md` with:
  - [ ] Project overview
  - [ ] Key features description
  - [ ] Code standards and conventions
  - [ ] Security requirements
  - [ ] Common patterns to follow

### Index Documentation
```bash
python scripts/index_documentation.py
```
- [ ] Script runs without errors
- [ ] Documentation sections indexed successfully

### Index Codebase
```bash
python scripts/index_codebase.py
```
- [ ] Script runs without errors
- [ ] Files processed and indexed

### Verify Indexing
```bash
python scripts/test_retrieval.py
```
- [ ] Index statistics show vector count > 0
- [ ] Test queries return relevant results

## Server Setup

### Local Testing
```bash
uvicorn src.main:app --reload
```
- [ ] Server starts without errors
- [ ] Health check works: `curl http://localhost:8000/health`
- [ ] API docs accessible: `http://localhost:8000/docs`

### Test Webhook Endpoint
```bash
curl -X POST http://localhost:8000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{}'
```
- [ ] Returns 200 response

## Deployment

### Option A: Render
- [ ] Connected GitHub repo to Render
- [ ] Set environment variables in Render dashboard:
  - [ ] `GITHUB_TOKEN`
  - [ ] `OPENAI_API_KEY`
  - [ ] `PINECONE_API_KEY`
  - [ ] `PINECONE_INDEX_NAME`
- [ ] Deployment successful
- [ ] Health check passing
- [ ] Copied deployment URL

### Option B: Docker
```bash
docker build -t ai-code-reviewer .
docker run -p 8000:8000 --env-file .env ai-code-reviewer
```
- [ ] Docker image builds successfully
- [ ] Container runs without errors
- [ ] Health check works

### Option C: Other Platforms
- [ ] Platform configured (Railway, Fly.io, etc.)
- [ ] Environment variables set
- [ ] Deployment successful

## GitHub Webhook

### Configure Webhook
- [ ] Go to target repo → Settings → Webhooks → Add webhook
- [ ] Set Payload URL: `https://your-domain/api/webhook`
- [ ] Set Content type: `application/json`
- [ ] Set Secret: (optional, matches `GITHUB_WEBHOOK_SECRET`)
- [ ] Selected events: `Pull requests` only
- [ ] Webhook is Active

### Verify Webhook
- [ ] Check "Recent Deliveries" in webhook settings
- [ ] Ping event shows green checkmark (200 response)

## Final Testing

### Create Test PR
- [ ] Create a new branch in your repo
- [ ] Make a small code change
- [ ] Open a pull request
- [ ] Wait 10-30 seconds

### Verify Review
- [ ] AI review comment appears on PR
- [ ] Review includes relevant context from knowledge base
- [ ] Review is helpful and specific

## Troubleshooting Checklist

### No Review Posted
- [ ] Check webhook delivery status in GitHub
- [ ] Check server/deployment logs
- [ ] Verify `GITHUB_TOKEN` has repo access
- [ ] Verify `OPENAI_API_KEY` is valid and has credits

### Poor Quality Reviews
- [ ] Update `docs/business-logic.md` with more context
- [ ] Re-index documentation: `python scripts/index_documentation.py`
- [ ] Re-index codebase: `python scripts/index_codebase.py`
- [ ] Test retrieval: `python scripts/test_retrieval.py "relevant query"`

### Slow Response
- [ ] Check Pinecone index region (use closest region)
- [ ] Check OpenAI API latency
- [ ] Consider upgrading deployment tier

### Webhook Signature Errors
- [ ] Verify `GITHUB_WEBHOOK_SECRET` matches webhook secret in GitHub
- [ ] Or remove secret from both places to disable verification

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pip install -r requirements.txt` | Install dependencies |
| `uvicorn src.main:app --reload` | Run development server |
| `python scripts/index_codebase.py` | Index GitHub repo |
| `python scripts/index_local_codebase.py <path>` | Index local repo |
| `python scripts/index_documentation.py` | Index docs |
| `python scripts/test_retrieval.py` | Run test suite |
| `python scripts/test_retrieval.py "query"` | Interactive search |

---

**All boxes checked? You're ready to go!**
