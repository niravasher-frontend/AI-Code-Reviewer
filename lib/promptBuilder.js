/**
 * Build a context-aware prompt for code review
 * @param {Object} params - Prompt parameters
 * @param {Object} params.pullRequest - GitHub PR object
 * @param {Array} params.files - Array of changed files with content
 * @param {Array} params.relevantContext - Relevant code/docs from knowledge base
 * @returns {string} Formatted prompt for LLM
 */
export function buildReviewPrompt({ pullRequest, files, relevantContext }) {
  const contextSection = buildContextSection(relevantContext);
  const filesSection = buildFilesSection(files);

  return `You are a senior software engineer performing a comprehensive code review. You have access to the existing codebase context and documentation to make informed decisions.

## REVIEW GUIDELINES
Focus on these key areas:
1. **Code Quality**: Logic errors, potential bugs, edge cases, error handling
2. **Security**: Vulnerabilities, input validation, authentication/authorization issues
3. **Performance**: Inefficiencies, unnecessary re-renders, memory leaks, optimization opportunities
4. **Best Practices**: Design patterns, SOLID principles, DRY, maintainability
5. **React/JS Specific**: Hook usage, component structure, state management, prop drilling
6. **Style & Readability**: Naming conventions, code organization, documentation
7. **Business Logic**: Alignment with documented requirements and patterns

## EXISTING CODEBASE CONTEXT
${contextSection}

## PULL REQUEST DETAILS
**Title**: ${pullRequest.title}
**Description**: ${pullRequest.body || 'No description provided'}
**Author**: ${pullRequest.user?.login || 'Unknown'}

## FILES CHANGED
${filesSection}

## REVIEW INSTRUCTIONS
1. Analyze each file in the context of the existing codebase patterns
2. Provide specific, actionable feedback with line references where possible
3. If code follows existing patterns and is good, acknowledge it briefly
4. Be constructive and helpful, not just critical
5. Prioritize security and correctness over style preferences

## OUTPUT FORMAT
Structure your review as follows:

**File: [filename]**
- ✅ **Good**: [What's done well]
- ⚠️ **Concern**: [Issue description] - [Suggestion for fix]
- 🔴 **Critical**: [Serious issue] - [Required fix]

Only include files that need feedback. Be concise but specific.`;
}

/**
 * Build the context section from retrieved knowledge base results
 * @param {Array} relevantContext - Array of context objects from Pinecone
 * @returns {string} Formatted context section
 */
function buildContextSection(relevantContext) {
  if (!relevantContext || relevantContext.length === 0) {
    return 'No specific codebase context available for this change.';
  }

  const contextPieces = relevantContext.map((ctx, index) => {
    const metadata = ctx.metadata || {};
    const score = ctx.score ? (ctx.score * 100).toFixed(1) : 'N/A';
    
    let piece = `### Context ${index + 1} (Relevance: ${score}%)`;
    
    if (metadata.type === 'code') {
      piece += `\n**File**: ${metadata.filename || 'Unknown'}`;
      piece += `\n**Type**: Code\n`;
    } else if (metadata.type === 'documentation') {
      piece += `\n**Source**: ${metadata.title || 'Documentation'}`;
      piece += `\n**Type**: Documentation\n`;
    }
    
    if (metadata.content) {
      // Truncate context if too long
      const content = metadata.content.length > 1000 
        ? metadata.content.substring(0, 1000) + '...' 
        : metadata.content;
      piece += `\n${content}`;
    }
    
    return piece;
  }).join('\n\n---\n\n');

  return contextPieces;
}

/**
 * Build the files section with PR changes
 * @param {Array} files - Array of file objects
 * @returns {string} Formatted files section
 */
function buildFilesSection(files) {
  return files.map(file => {
    let section = `### ${file.filename}`;
    
    if (file.status) {
      section += ` (${file.status})`;
    }
    
    section += '\n';
    
    // Prefer patch (shows only changes) over full content
    if (file.patch) {
      section += '```diff\n' + file.patch + '\n```';
    } else if (file.content) {
      // If no patch available, show truncated content
      const content = file.content.length > 2000 
        ? file.content.substring(0, 2000) + '\n... (truncated)' 
        : file.content;
      section += '```' + getLanguageFromFilename(file.filename) + '\n' + content + '\n```';
    }
    
    return section;
  }).join('\n\n');
}

/**
 * Get language identifier for syntax highlighting based on filename
 * @param {string} filename - File name
 * @returns {string} Language identifier
 */
function getLanguageFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  
  const langMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rb': 'ruby',
    'php': 'php',
    'css': 'css',
    'scss': 'scss',
    'html': 'html',
    'json': 'json',
    'md': 'markdown',
  };
  
  return langMap[ext] || '';
}

/**
 * Build query text for retrieving relevant context from knowledge base
 * @param {Object} pullRequest - GitHub PR object
 * @param {Array} files - Array of changed files
 * @returns {string} Query text for semantic search
 */
export function buildContextQuery(pullRequest, files) {
  const title = pullRequest.title || '';
  const description = pullRequest.body || '';
  const filenames = files.map(f => f.filename).join(', ');
  
  // Combine PR info to create a semantic query
  return `${title}\n${description}\nFiles changed: ${filenames}`;
}
