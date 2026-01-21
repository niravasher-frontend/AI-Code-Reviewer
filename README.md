# 🤖 AI Code Review Agent (RAG-Enhanced)

An intelligent AI-powered code review agent that uses **Retrieval-Augmented Generation (RAG)** to provide context-aware, intelligent code reviews on GitHub Pull Requests.

## 🌟 Features

- ✅ **Automated PR Reviews**: Automatically reviews GitHub pull requests
- 🧠 **RAG-Powered**: Uses vector database to retrieve relevant codebase context
- 📚 **Knowledge Base**: Indexes your entire codebase and documentation
- 🎯 **Context-Aware**: Understands your business logic and coding patterns
- 🔒 **Security Focused**: Reviews for security vulnerabilities and best practices
- ⚡ **Performance Optimized**: Identifies performance issues and bottlenecks
- 🚀 **Deployed on Vercel**: Serverless, scalable, and easy to maintain

## 🏗️ Architecture

```
GitHub PR Event → Webhook (Vercel) → RAG Pipeline → OpenAI GPT-4 → Review Comment
                                          ↓
                                   Pinecone Vector DB
                              (Codebase + Documentation)
```

## 📋 Prerequisites

1. **GitHub Account** with a repository to review
2. **OpenAI API Key** - [Get it here](https://platform.openai.com/api-keys)
3. **Pinecone Account** (Free tier) - [Sign up here](https://www.pinecone.io/)
4. **Vercel Account** (Free tier) - [Sign up here](https://vercel.com/)
5. **Node.js** 18+ installed locally

## 🚀 Setup Instructions

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd ai-code-reviewer

# Install dependencies
npm install
```

### Step 2: Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_your_github_token_here

# OpenAI Configuration
OPENAI_API_KEY=sk-your_openai_key_here

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX_NAME=code-review-kb

# Target Repository (the repo you want to review)
TARGET_REPO_OWNER=your-github-username
TARGET_REPO_NAME=your-repo-name
```

#### How to get these tokens:

**GitHub Token:**
1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Give it a name: "AI Code Reviewer"
4. Select scopes: `repo` (all), `read:org`
5. Generate and copy the token

**OpenAI API Key:**
1. Go to: https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with `sk-`)

**Pinecone API Key:**
1. Go to: https://app.pinecone.io/
2. Click on your project
3. Go to "API Keys" tab
4. Copy your API key

### Step 3: Set Up Pinecone Index

1. Log in to Pinecone dashboard
2. Click "Create Index"
3. Configure:
   - **Name**: `code-review-kb`
   - **Dimensions**: `1536`
   - **Metric**: `cosine`
   - **Cloud**: AWS or GCP
   - **Region**: Choose nearest to you
4. Click "Create Index"

### Step 4: Prepare Your Documentation

1. Edit `docs/business-logic.md` with your project's:
   - Business logic and requirements
   - Code standards and best practices
   - Architecture patterns
   - Security requirements
   - Common pitfalls to avoid

2. Add any additional documentation files (`.md` or `.txt`) to the `docs/` folder

### Step 5: Index Your Codebase

Run these commands to populate your knowledge base:

```bash
# Index your target repository code
npm run index:codebase

# Index your documentation
npm run index:docs

# Test the retrieval system (optional but recommended)
npm run test:retrieval
```

**Expected output:**
```
🚀 Starting Codebase Indexing...
✅ Found 45 files to index
📄 Processing: src/components/App.jsx
💾 Uploading batch of 50 vectors to Pinecone...
✅ INDEXING COMPLETE!
📈 Files processed: 45
💾 Total vectors in index: 45
```

### Step 6: Deploy to Vercel

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel
```

During deployment, Vercel will ask for environment variables. Add:
- `GITHUB_TOKEN`
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`

**Or** add them via Vercel dashboard:
1. Go to your project in Vercel
2. Settings → Environment Variables
3. Add each variable
4. Redeploy

### Step 7: Set Up GitHub Webhook

1. Go to your GitHub repository
2. Settings → Webhooks → Add webhook
3. Configure:
   - **Payload URL**: `https://your-vercel-url.vercel.app/api/webhook`
   - **Content type**: `application/json`
   - **Secret**: (leave empty or add one)
   - **Events**: Select "Pull requests" only
4. Save

## 🧪 Testing

### Test Locally

```bash
# Start local server
vercel dev

# In another terminal, test retrieval
npm run test:retrieval

# Create a test PR in your repo to trigger the webhook
```

### Test RAG System

```bash
# Run test suite
npm run test:retrieval

# Or query specific topics
npm run test:retrieval -- "React component authentication"
```

**Expected output:**
```
🔍 Query: "React component authentication"
📌 Result 1 (Similarity: 92.5%)
📄 Type: Code
📁 File: src/components/Auth/Login.jsx
📝 Content Preview: [shows relevant code]
```

## 📊 How It Works

### 1. **PR Created/Updated**
When a PR is opened or updated, GitHub sends a webhook event to your Vercel function.

### 2. **Context Retrieval** (RAG)
The system:
- Creates a semantic query from the PR title, description, and changed files
- Queries Pinecone vector database for relevant code and documentation
- Retrieves top 10 most relevant pieces of context

### 3. **AI Review**
OpenAI GPT-4 receives:
- The PR changes
- Retrieved codebase context
- Your documentation and business rules
- Generates a comprehensive, context-aware review

### 4. **Review Posted**
The review is posted as a comment on the GitHub PR with:
- File-by-file feedback
- Security concerns
- Performance suggestions
- Best practice recommendations

## 📁 Project Structure

```
ai-code-reviewer/
├── api/
│   └── webhook.js              # Vercel serverless function (webhook handler)
├── lib/
│   ├── pinecone.js             # Pinecone vector DB utilities
│   ├── embeddings.js           # OpenAI embeddings creation
│   └── promptBuilder.js        # Context-aware prompt builder
├── scripts/
│   ├── indexCodebase.js        # Index repository code
│   ├── indexDocumentation.js   # Index documentation
│   └── testRetrieval.js        # Test RAG system
├── docs/
│   └── business-logic.md       # Your project documentation
├── .env.local                  # Environment variables (not committed)
├── .gitignore                  # Git ignore file
├── package.json                # Dependencies and scripts
├── vercel.json                 # Vercel configuration
└── README.md                   # This file
```

## 🔧 Maintenance

### Update Knowledge Base

When your codebase changes significantly:

```bash
# Re-index codebase
npm run index:codebase

# Re-index documentation (if docs changed)
npm run index:docs
```

### Monitor Usage

- **OpenAI**: Check usage at https://platform.openai.com/usage
- **Pinecone**: Check dashboard for index stats
- **Vercel**: Check function logs and analytics

### Cost Estimates

For a small-medium project with ~10 PRs/month:

- **OpenAI**: ~$2-5/month
  - Embeddings: $0.0001 per 1K tokens
  - GPT-4o-mini: $0.15 per 1M input tokens
- **Pinecone**: Free tier (100K vectors)
- **Vercel**: Free tier (100GB bandwidth)

**Total**: ~$2-5/month 💰

## 🎯 Customization

### Adjust Review Focus

Edit `lib/promptBuilder.js` to customize:
- Review priorities
- Output format
- Severity levels

### Change LLM Model

Edit `api/webhook.js`:
```javascript
model: "gpt-4o-mini" // Change to "gpt-4o" for better quality
```

### Filter File Types

Edit `scripts/indexCodebase.js`:
```javascript
const VALID_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.py'];
```

### Adjust Context Amount

Edit `api/webhook.js`:
```javascript
relevantContext = await queryVectors(queryEmbedding, 10); // Change 10 to 5 or 15
```

## 🐛 Troubleshooting

### Issue: "Webhook not triggering"
- ✅ Check Vercel function logs
- ✅ Verify webhook URL in GitHub settings
- ✅ Ensure webhook is enabled for "Pull requests"

### Issue: "No context retrieved"
- ✅ Run `npm run test:retrieval` to verify index
- ✅ Check Pinecone dashboard for vector count
- ✅ Re-run indexing scripts

### Issue: "OpenAI rate limit"
- ✅ Add delays between requests
- ✅ Upgrade OpenAI plan
- ✅ Use `gpt-4o-mini` instead of `gpt-4o`

### Issue: "Vercel timeout"
- ✅ Reduce number of files reviewed
- ✅ Upgrade Vercel plan for longer timeout
- ✅ Optimize context retrieval

## 📚 Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Pinecone Documentation](https://docs.pinecone.io/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [GitHub Webhooks](https://docs.github.com/en/webhooks)

## 🤝 Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📝 License

ISC

---

**Built with ❤️ using OpenAI GPT-4, Pinecone, and Vercel**

*Happy Code Reviewing! 🚀*
