const patterns = [
  {
    type: "JWT",
    regex: /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/
  },
  {
    type: "AWS Access Key",
    regex: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    type: "Private Key",
    regex: /-----BEGIN .*PRIVATE KEY-----/
  },
  {
    type: "Bearer Token",
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i
  },
  {
    type: "API Key",
    regex: /(api[_-]?key|secret[_-]?key)\s*[:=]\s*["']?[\w\-]+/i
  },
  {
    type: "Password",
    regex: /(password|passwd|pwd)\s*[:=]\s*["']?[^"' \n]+/i
  },
  {
    type: "Connection String",
    regex: /(Server|Data Source)=.+;(Database|Initial Catalog)=/i
  },
  {
    type: "SSH Key Fingerprint",
    regex: /SHA256:[A-Za-z0-9+/=]{20,}/
  },
  {
    type: "Slack Token",
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/
  },
  {
    type: "GitHub Token",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/
  }
];

function detectSensitiveContent(text) {
  if (!text || typeof text !== "string") {
    return {
      sensitive: false,
      matches: []
    };
  }

  const matches = [];

  for (const pattern of patterns) {
    if (pattern.regex.test(text)) {
      matches.push(pattern.type);
    }
  }

  return {
    sensitive: matches.length > 0,
    matches
  };
}

function isSensitive(text) {
  return detectSensitiveContent(text).sensitive;
}

function getProtectedTypes() {
  return patterns.map((pattern) => pattern.type);
}

module.exports = {
  detectSensitiveContent,
  isSensitive,
  getProtectedTypes
};
