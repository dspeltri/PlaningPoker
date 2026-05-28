// .eslintrc.js - Anti-Vibe Coding Enforcement System
module.exports = {
  env: {
    node: true,
    es2021: true,
    browser: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  rules: {
    // ════════════════════════════════════════════════════════════════════════════
    // CRITICAL SECURITY PATTERNS (BLOCK) - These cause failures
    // ════════════════════════════════════════════════════════════════════════════

    // 1. Hardcoded Secrets Detection
    "no-hardcoded-secrets": [
      "error",
      {
        patterns: [
          /sk-[a-zA-Z0-9]{20,}/,
          /AKIA[0-9A-Z]{16}/,
          /password\s*[:=]\s*["'][^"']*["']/i,
          /api[_-]?key\s*[:=]\s*["'][^"']*["']/i,
        ],
      },
    ],

    // 2. SQL Injection Prevention
    "no-sql-concat": "error", // Prevent string concatenation in queries
    "no-eval": "error", // Block eval() usage
    "no-implied-eval": "error", // Block implied eval patterns

    // 3. Command Injection Prevention
    "no-exec-shell": "error", // Prevent shell execution

    // 4. XSS Prevention
    "react/no-danger": "error", // Block dangerouslySetInnerHTML
    "no-inner-html": "error", // Block innerHTML assignments

    // ════════════════════════════════════════════════════════════════════════════
    // CODE QUALITY PATTERNS (WARN)
    // ════════════════════════════════════════════════════════════════════════════

    // 5. No debug code in production
    "no-console": "warn", // Warn on console.log (not error, since needed for logging)
    "no-debugger": "error", // Block debugger statements
    "no-debug": "warn",

    // 6. Magic Numbers
    "no-magic-numbers": [
      "warn",
      {
        ignore: [0, 1, -1, 2, 100, 200, 404, 500], // Common values
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
      },
    ],

    // 7. Code Organization
    "max-lines": ["warn", { max: 1000, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": [
      "warn",
      { max: 50, skipBlankLines: true, skipComments: true },
    ],
    "max-params": ["warn", 5],
    "max-depth": ["warn", 3],
    "max-nested-callbacks": ["warn", 3],
    complexity: ["warn", 10],

    // 8. Error Handling
    "no-empty": "error", // Block empty catch/finally blocks
    "no-fallthrough": "error", // Prevent switch case fallthrough
    "no-outer-catch": "error", // Prevent catching outer scope errors

    // 9. Performance
    "no-infinite-loops": "warn",

    // 10. Documentation & Naming
    "no-var": "error", // Enforce let/const
    "prefer-const": "warn",
    "id-length": ["warn", { min: 2, exceptions: ["_", "i", "j", "k"] }],
    semi: ["error", "always"],
    "indent": ["error", 2],

    // 11. File System Anti-Patterns
    "no-hardcoded-paths": [
      "warn",
      { patterns: ["C:\\\\", "/home/", "/Users/", "/root/"] },
    ],

    // 12. Unused code
    "no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // 13. Accessibility (for HTML/client-side code)
    "jsx-a11y/alt-text": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",

    // ════════════════════════════════════════════════════════════════════════════
    // STANDARD BEST PRACTICES
    // ════════════════════════════════════════════════════════════════════════════
    eqeqeq: ["error", "always"],
    "strict": "error",
    "no-implicit-coercion": "error",
    "prefer-template": "warn",
  },
  overrides: [
    {
      files: ["*.test.js", "*.spec.js"],
      env: { jest: true },
      rules: {
        "no-console": "off",
        "no-magic-numbers": "off",
      },
    },
  ],
};
