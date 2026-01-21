# 📋 Setup Checklist

Use this checklist to ensure you've completed all setup steps correctly.

## ✅ Pre-Deployment Checklist

### 1. Environment Setup
- [ ] Node.js 18+ installed
- [ ] Repository cloned
- [ ] Dependencies installed (`npm install`)

### 2. API Keys & Accounts
- [ ] GitHub Personal Access Token created
  - Scope: `repo` (all), `read:org`
  - Saved securely
- [ ] OpenAI API Key obtained
  - Key starts with `sk-`
  - Billing set up
- [ ] Pinecone account created (free tier)
  - API key obtained
  - Index created: `code-review-kb`
  - Dimensions: 1536
  - Metric: cosine

### 3. Environment Variables
- [ ] `.env.local` file created
- [ ] `GITHUB_TOKEN` added
- [ ] `OPENAI_API_KEY` added
- [ ] `PINECONE_API_KEY` added
- [ ] `PINECONE_INDEX_NAME` added (should be: `code-review-kb`)
- [ ] `TARGET_REPO_OWNER` added (your GitHub username)
- [ ] `TARGET_REPO_NAME` added (repo to review)

### 4. Documentation
- [ ] `docs/business-logic.md` edited with your project info
- [ ] Additional documentation files added (if any)

### 5. Knowledge Base Indexing
- [ ] Run `npm run index:codebase` - completed successfully
- [ ] Run `npm run index:docs` - completed successfully
- [ ] Run `npm run test:retrieval` - returns results
- [ ] Verified vector count in Pinecone dashboard

### 6. Vercel Deployment
- [ ] Vercel CLI installed (`npm install -g vercel`)
- [ ] Logged into Vercel (`vercel login`)
- [ ] Project deployed (`vercel`)
- [ ] Environment variables added in Vercel dashboard:
  - [ ] GITHUB_TOKEN
  - [ ] OPENAI_API_KEY
  - [ ] PINECONE_API_KEY
  - [ ] PINECONE_INDEX_NAME
- [ ] Deployment URL obtained (e.g., `https://your-project.vercel.app`)

### 7. GitHub Webhook Setup
- [ ] Went to GitHub repo → Settings → Webhooks
- [ ] Added webhook with:
  - [ ] Payload URL: `https://your-vercel-url.vercel.app/api/webhook`
  - [ ] Content type: `application/json`
  - [ ] Events: "Pull requests" selected
  - [ ] Webhook active
- [ ] Verified webhook shows green checkmark (Recent Deliveries)

## ✅ Testing Checklist

### Local Testing
- [ ] Run `vercel dev` locally
- [ ] Test retrieval: `npm run test:retrieval`
- [ ] Check local webhook responds to test requests

### Production Testing
- [ ] Create a test PR in target repository
- [ ] Wait 10-30 seconds
- [ ] Check PR for AI review comment
- [ ] Verify review includes:
  - [ ] File-by-file feedback
  - [ ] Mentions "RAG-Enhanced"
  - [ ] Shows context count
- [ ] Check Vercel function logs for any errors

### Verification
- [ ] Review quality is good
- [ ] Context is relevant
- [ ] No rate limit errors
- [ ] Response time < 60 seconds

## 🐛 Troubleshooting Quick Reference

### Webhook Not Triggering
```bash
# Check Vercel logs
vercel logs

# Test webhook manually
curl -X POST https://your-vercel-url.vercel.app/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d '{"action":"opened","pull_request":{"number":1}}'
```

### No Context Retrieved
```bash
# Verify index has vectors
npm run test:retrieval

# Re-index if needed
npm run index:codebase
npm run index:docs
```

### OpenAI Errors
- Check API key is valid
- Verify billing is set up
- Check rate limits: https://platform.openai.com/usage

### Pinecone Errors
- Verify index name matches `.env.local`
- Check API key is valid
- Verify index dimensions are 1536

## 📊 Success Metrics

After successful setup, you should see:

- ✅ Webhook deliveries showing 200 status in GitHub
- ✅ AI comments appearing on PRs within 30 seconds
- ✅ Relevant context being retrieved (check comment footer)
- ✅ No errors in Vercel function logs
- ✅ Pinecone dashboard showing query activity

## 🎯 Next Steps After Setup

1. **Monitor First Few PRs**: Check if reviews are accurate and helpful
2. **Adjust Context**: If reviews miss important info, update documentation
3. **Tune Parameters**: Adjust `topK` in `api/webhook.js` for more/less context
4. **Update Knowledge Base**: Re-run indexing when codebase changes
5. **Optimize Costs**: Monitor OpenAI usage and adjust model if needed

## 📝 Maintenance Schedule

- **Weekly**: Check Vercel and OpenAI usage/costs
- **When major code changes**: Re-run `npm run index:codebase`
- **When docs updated**: Re-run `npm run index:docs`
- **Monthly**: Review accuracy and adjust prompts if needed

---

**Setup complete? Start creating PRs and watch your AI agent work! 🚀**
