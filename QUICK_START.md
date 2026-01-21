# 🚀 Quick Start Guide

Get your AI Code Review Agent up and running in 15 minutes!

## ⚡ Fast Track Setup

### 1️⃣ Set Environment Variables (2 minutes)

Create `.env.local` in the project root:

```bash
GITHUB_TOKEN=ghp_your_token_here
OPENAI_API_KEY=sk_your_key_here
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_INDEX_NAME=code-review-kb
TARGET_REPO_OWNER=your-username
TARGET_REPO_NAME=your-repo
```

### 2️⃣ Update Documentation (5 minutes)

Edit `docs/business-logic.md` with:
- Your project description
- Key features and components
- Code standards and best practices
- Security requirements
- Common patterns to follow

### 3️⃣ Index Your Knowledge Base (3 minutes)

```bash
# Index your codebase
npm run index:codebase

# Index your documentation
npm run index:docs

# Test it works (optional)
npm run test:retrieval
```

**Expected output:**
```
✅ INDEXING COMPLETE!
📈 Files processed: 45
💾 Total vectors in index: 45
```

### 4️⃣ Deploy to Vercel (3 minutes)

```bash
# Deploy
vercel

# Add environment variables when prompted:
# - GITHUB_TOKEN
# - OPENAI_API_KEY
# - PINECONE_API_KEY
# - PINECONE_INDEX_NAME
```

Copy your deployment URL: `https://your-project.vercel.app`

### 5️⃣ Set Up GitHub Webhook (2 minutes)

1. Go to your repo → **Settings** → **Webhooks** → **Add webhook**
2. Set **Payload URL**: `https://your-project.vercel.app/api/webhook`
3. Set **Content type**: `application/json`
4. Select **Just the pull_request event**
5. Click **Add webhook**

### 6️⃣ Test! (1 minute)

1. Create a test PR in your repository
2. Wait 10-30 seconds
3. Check for AI review comment! 🎉

---

## 🎯 What You Get

Your AI agent will automatically:
- ✅ Review every PR when opened or updated
- ✅ Analyze code quality, security, and performance
- ✅ Check against your business logic and patterns
- ✅ Provide specific, actionable feedback
- ✅ Learn from your codebase context

## 📊 Example Review

```markdown
## 🤖 AI Code Review (RAG-Enhanced)

**File: src/components/Login.jsx**
- ✅ Good: Proper error handling with try/catch
- ⚠️ Concern: Password should be validated before sending - Add min length check
- 🔴 Critical: API key exposed in code - Move to environment variables

**File: src/utils/api.js**
- ✅ Good: Following project's async/await pattern
- ⚠️ Concern: Missing timeout for fetch requests - Add timeout to prevent hanging

---
🧠 Powered by GPT-4 + Knowledge Base | Context-Aware Review
📚 Analyzed with 8 pieces of codebase context
```

## 🔄 Maintenance

**When your code changes:**
```bash
npm run index:codebase
```

**When your docs change:**
```bash
npm run index:docs
```

**Test retrieval:**
```bash
npm run test:retrieval -- "your search query"
```

## 💰 Costs

For ~10 PRs/month: **~$2-5/month**
- OpenAI: $2-5
- Pinecone: Free
- Vercel: Free

## 🐛 Not Working?

### Webhook not triggering?
```bash
# Check Vercel logs
vercel logs

# Test webhook
curl -X POST https://your-url.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"test":true}'
```

### No review comments?
- Check GitHub webhook "Recent Deliveries" shows 200 status
- Check Vercel function logs for errors
- Verify all environment variables are set in Vercel

### Bad context/reviews?
- Update `docs/business-logic.md` with more detail
- Re-run `npm run index:docs`
- Adjust `topK` in `api/webhook.js` (line ~60) to retrieve more/less context

---

## 📚 Need More Help?

- 📖 Full documentation: See `README.md`
- ✅ Setup checklist: See `SETUP_CHECKLIST.md`
- 🔍 Test your system: `npm run test:retrieval`

---

**You're all set! Create a PR and watch your AI agent work! 🚀**
