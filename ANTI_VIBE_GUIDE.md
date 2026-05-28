
# Anti-Vibe Coding Enforcement System

This document outlines the anti-vibe code quality enforcement system implemented for PlanningPoker.

## Overview

The Anti-Vibe system prevents "vibecoding" anti-patterns before they enter the codebase through:

- **Custom Scanner** (`scripts/anti-vibe-scanner.js`) - Detects patterns in real-time
- **ESLint Configuration** (`.eslintrc.js`) - Enforces code quality standards
- **Pre-commit Hooks** (`.husky/pre-commit`) - Validates changes before commit
- **GitHub Actions** (`.github/workflows/anti-vibe-enforcement.yml`) - CI/CD enforcement

## Critical Security Patterns (BLOCK)

These patterns **MUST NOT** be committed. The system will reject them:

### 1. Hardcoded Secrets

❌ **BAD:**
```javascript
const apiKey = "sk-1234567890abcdef";
const dbUrl = "postgres://user:password@localhost/db";
```

✅ **GOOD:**
```javascript
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error("API_KEY environment variable required");
}
```

### 2. SQL Injection Vulnerabilities

❌ **BAD:**
```javascript
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.query(query);
```

✅ **GOOD:**
```javascript
const query = "SELECT * FROM users WHERE id = ?";
db.query(query, [userId]);
```

### 3. Command Injection

❌ **BAD:**
```javascript
const cmd = `rm -rf ${userPath}`;
exec(cmd);
```

✅ **GOOD:**
```javascript
// Use file system module with path validation
const sanitizedPath = path.normalize(userPath);
if (!sanitizedPath.startsWith(allowedDir)) {
  throw new Error("Invalid path");
}
fs.rmSync(sanitizedPath, { recursive: true });
```

### 4. XSS Vulnerabilities

❌ **BAD:**
```javascript
element.innerHTML = userInput;
```

✅ **GOOD:**
```javascript
element.textContent = userInput;
// Or use DOMPurify for HTML content:
element.innerHTML = DOMPurify.sanitize(userInput);
```

### 5. Committed Sensitive Files

❌ **BAD:**
```
Committing .env, .env.local, node_modules, or .pem/.key files
```

✅ **GOOD:**
```
Add to .gitignore:
.env
.env.local
node_modules/
*.pem
*.key
.DS_Store
```

## Code Quality Patterns (WARN)

These patterns trigger warnings. While not blocking, they should be addressed:

### 6. Magic Numbers

❌ **BAD:**
```javascript
setTimeout(() => { /* ... */ }, 5000);
const MAX_ITEMS = 300;
sleep(8000);
```

✅ **GOOD:**
```javascript
const DEBOUNCE_DELAY_MS = 5000;
setTimeout(() => { /* ... */ }, DEBOUNCE_DELAY_MS);

const CACHE_TTL_MS = 300 * 1000;
const MAX_ITEMS = 300;

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 8000;
setTimeout(() => process.exit(1), GRACEFUL_SHUTDOWN_TIMEOUT_MS);
```

### 7. Console Logging

❌ **BAD:**
```javascript
console.log("User joined:", user);
console.debug("Processing request");
```

✅ **GOOD:**
```javascript
// Use structured logging
const logger = {
  info: (msg, data) => console.log(JSON.stringify({ level: "INFO", msg, ...data })),
  error: (msg, error) => console.log(JSON.stringify({ level: "ERROR", msg, error: error.message })),
};

logger.info("User joined", { userId: user.id, name: user.name });
```

### 8. Empty Catch Blocks

❌ **BAD:**
```javascript
try {
  riskyOperation();
} catch (e) {
  // Silently fail
}
```

✅ **GOOD:**
```javascript
try {
  riskyOperation();
} catch (error) {
  logger.error("Operation failed", { error: error.message });
  throw error; // or handle appropriately
}
```

### 9. Poor Error Handling

❌ **BAD:**
```javascript
const result = riskyOperation() || {};
```

✅ **GOOD:**
```javascript
let result;
try {
  result = riskyOperation();
} catch (error) {
  logger.error("Operation failed", { error: error.message });
  result = null; // or throw
}
if (!result) {
  // Handle appropriately
}
```

### 10. Code Organization Issues

❌ **BAD:**
```javascript
function processData(a, b, c, d, e, f, g) {
  if (cond1) {
    if (cond2) {
      if (cond3) {
        if (cond4) {
          // Deep nesting
        }
      }
    }
  }
  // 1000+ lines of code
}
```

✅ **GOOD:**
```javascript
// Break into smaller, focused functions (< 50 lines)
function validateInput(data) { /* ... */ }
function processData(data) { /* ... */ }
function formatOutput(result) { /* ... */ }

// Limit parameters (< 5)
function calculateTotal({ items, tax, shipping }) { /* ... */ }

// Limit nesting (< 3 levels)
if (isValid) {
  if (hasPermission) {
    processRequest();
  }
}
```

### 11. Hardcoded Paths

❌ **BAD:**
```javascript
const configPath = "C:\\Users\\Admin\\config.json";
const dataPath = "/home/user/data/file.txt";
```

✅ **GOOD:**
```javascript
const configPath = path.join(__dirname, "config.json");
const dataPath = path.join(process.env.DATA_DIR || "./data", "file.txt");
```

### 12. Accessibility Issues (Frontend)

❌ **BAD:**
```html
<img src="avatar.jpg" />
<button onclick="handleClick()">Click</button>
<div class="red-text">Error</div>
```

✅ **GOOD:**
```html
<img src="avatar.jpg" alt="User avatar" />
<button onclick="handleClick()" onkeydown="handleKeydown(event)">Click</button>
<div class="error-message" role="alert">Error: Invalid input</div>
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install --save-dev eslint lint-staged husky prettier
npx husky install
chmod +x .husky/pre-commit
```

### 2. Enable Pre-commit Hooks

```bash
npx husky install
```

### 3. Run Manual Scan

```bash
node scripts/anti-vibe-scanner.js
```

### 4. Run ESLint

```bash
npx eslint . --ext .js
```

## CI/CD Integration

The GitHub Actions workflow runs automatically on:
- **Push to main/develop**
- **Pull requests to main/develop**

It performs:
1. Anti-vibe pattern scanning
2. ESLint validation
3. Security audit
4. File integrity checks

## Code Review in PlanningPoker

### Current Code Analysis

**Server.js Review:**

✅ **GOOD PATTERNS DETECTED:**
- Named constants used throughout (MAX_NAME_LENGTH, RATE_LIMIT_MS, etc.)
- Input sanitization functions (sanitiseName, sanitiseVote, sanitiseAvatar)
- Proper rate limiting implementation
- Structured error handling with requiresRoom wrapper
- Clear comments explaining complex logic
- Proper cleanup on disconnect
- Graceful shutdown handling

⚠️ **WARNINGS TO ADDRESS:**
1. **Line 255, 259, 273:** Console.log for logging
   - Consider structured logging for production
   ```javascript
   // Current
   console.log(`${signal} received — shutting down gracefully`);
   
   // Better
   const logger = {
     info: (msg, meta) => console.log(JSON.stringify({ level: "INFO", msg, ...meta }))
   };
   logger.info("Signal received", { signal });
   ```

2. **Line 74:** Magic number in setInterval
   ```javascript
   // Current
   }, 30 * 60 * 1000);
   
   // Better
   const ROOM_PRUNE_INTERVAL_MS = 30 * 60 * 1000;
   }, ROOM_PRUNE_INTERVAL_MS);
   ```

3. **CORS Configuration (Line 10):** Open CORS policy
   ```javascript
   // Current
   const io = new Server(server, { cors: { origin: "*" } });
   
   // Better - in production
   const io = new Server(server, {
     cors: {
       origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
       methods: ["GET", "POST"]
     }
   });
   ```

### File Structure Status

| File | Status | Issues |
|------|--------|--------|
| server.js | ✅ Good | Minor logging, 2 warnings |
| package.json | ✅ Good | No issues |
| .gitignore | ✅ Now added | Prevents committed node_modules |
| .env files | ✅ Protected | Will be rejected if committed |

## Bypassing Enforcement (Not Recommended)

To skip pre-commit hooks (only when necessary):

```bash
git commit --no-verify
```

**⚠️ Note:** CI/CD checks will still run and block merges.

## Common Issues & Fixes

### Issue: `node_modules` keeps getting committed

**Solution:**
```bash
git rm -r --cached node_modules
git add .gitignore
git commit -m "Remove node_modules from tracking"
```

### Issue: `.env` file was accidentally committed

**Solution:**
```bash
git rm --cached .env
git filter-branch --tree-filter "rm -f .env" HEAD
```

### Issue: Pre-commit hook blocking legitimate code

**Solution:**
1. Review the error message
2. Fix the issue in your code
3. Stage and commit again

## Next Steps

1. **Run initial scan:** `node scripts/anti-vibe-scanner.js`
2. **Install dependencies:** `npm install --save-dev eslint husky lint-staged prettier`
3. **Setup husky:** `npx husky install`
4. **Address warnings** in server.js (logging improvements)
5. **Deploy to production** with confidence

## Future Enhancements

- [ ] Add TypeScript strict mode
- [ ] Integration with Snyk for vulnerability scanning
- [ ] Custom rule configuration per project
- [ ] Performance benchmarking rules
- [ ] Architecture linting (circular dependencies)
- [ ] API documentation generation
- [ ] Automated dependency updates

---

**Remember:** These patterns protect the codebase from common pitfalls. They're not restrictions—they're guardrails for building reliable, maintainable, and secure code! 🛡️
