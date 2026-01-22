# AI Code Reviewer (Python)

RAG-enhanced AI-powered code review system for GitHub pull requests.

## Features

- Automatic code review on GitHub PRs
- RAG (Retrieval-Augmented Generation) for context-aware reviews
- Semantic search using Pinecone vector database
- Local embedding model (all-MiniLM-L6-v2)
- GPT-4 powered code analysis

## Quick Start

### 1. Install Dependencies

```bash
cd python
pip install -r requirements.txt
```

### 2. Configure Environment

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
GITHUB_TOKEN=ghp_xxxx
OPENAI_API_KEY=sk-xxxx
PINECONE_API_KEY=xxxx
PINECONE_INDEX_NAME=codebase-embedding-384
TARGET_REPO_OWNER=your-org
TARGET_REPO_NAME=your-repo
```

### 3. Index Your Knowledge Base

```bash
# Index a GitHub repository
python scripts/index_codebase.py

# OR index a local repository
python scripts/index_local_codebase.py /path/to/repo

# Index documentation
python scripts/index_documentation.py

# Test retrieval
python scripts/test_retrieval.py "your search query"
```

### 4. Run the Server

```bash
uvicorn src.main:app --reload
```

The API will be available at `http://localhost:8000`

### 5. Configure GitHub Webhook

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL**: `https://your-domain.com/api/webhook`
3. **Content type**: `application/json`
4. **Secret**: (optional, set `GITHUB_WEBHOOK_SECRET` in env)
5. Select **Just the pull_request event**
6. Click **Add webhook**

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check |
| `/health` | GET | Health check |
| `/api/webhook` | POST | GitHub webhook handler |
| `/docs` | GET | OpenAPI documentation |

## Project Structure

```
python/
├── src/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Configuration
│   ├── api/
│   │   ├── webhook.py       # Webhook handler
│   │   └── schemas.py       # Pydantic models
│   ├── core/
│   │   ├── embeddings.py    # Embedding model
│   │   ├── pinecone_client.py  # Vector DB
│   │   ├── prompt_builder.py   # Prompt construction
│   │   └── github_client.py    # GitHub API
│   └── services/
│       └── code_reviewer.py # Review orchestration
├── scripts/
│   ├── index_codebase.py    # Index GitHub repo
│   ├── index_local_codebase.py  # Index local repo
│   ├── index_documentation.py   # Index docs
│   └── test_retrieval.py    # Test RAG
├── requirements.txt
├── Dockerfile
└── render.yaml
```

## Deployment

### Render

```bash
# Deploy using Render Blueprint
render blueprint launch
```

Or manually:
1. Connect your GitHub repo to Render
2. Set environment variables in Render dashboard
3. Deploy

### Docker

```bash
# Build
docker build -t ai-code-reviewer .

# Run
docker run -p 8000:8000 \
  -e GITHUB_TOKEN=xxx \
  -e OPENAI_API_KEY=xxx \
  -e PINECONE_API_KEY=xxx \
  ai-code-reviewer
```

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes | GitHub personal access token |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `PINECONE_API_KEY` | Yes | Pinecone API key |
| `PINECONE_INDEX_NAME` | No | Index name (default: codebase-embedding-384) |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook signature secret |
| `TARGET_REPO_OWNER` | No | Default repo owner for indexing |
| `TARGET_REPO_NAME` | No | Default repo name for indexing |
| `LOCAL_REPO_PATH` | No | Local repo path for indexing |

## Scripts

```bash
# Index GitHub repository
python scripts/index_codebase.py

# Index local repository
python scripts/index_local_codebase.py /path/to/repo

# Index documentation files
python scripts/index_documentation.py

# Test retrieval (interactive)
python scripts/test_retrieval.py "authentication flow"

# Test retrieval (full test suite)
python scripts/test_retrieval.py
```

## Technology Stack

- **Web Framework**: FastAPI
- **Embeddings**: sentence-transformers (all-MiniLM-L6-v2)
- **Vector DB**: Pinecone
- **LLM**: OpenAI GPT-4o-mini
- **GitHub API**: PyGithub
