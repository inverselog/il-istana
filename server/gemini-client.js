/**
 * Gemini 2.5 Pro client for Iris's thinking step.
 * Uses Vertex AI endpoint with GCP service account for reliable access.
 * Function calling so Iris can query her own DB during thinking.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createSign } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERTEX_REGION = process.env.VERTEX_REGION || 'us-central1';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro-latest';
const GCP_PROJECT = process.env.GCP_PROJECT || 'inverselog';

// --- Service Account JWT Auth ---

let cachedToken = null;
let tokenExpiry = 0;

function loadServiceAccount() {
  const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(__dirname, '..', 'google-creds.json');
  return JSON.parse(readFileSync(credsPath, 'utf-8'));
}

function createJWT(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, 'base64url');

  return `${header}.${payload}.${signature}`;
}

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const sa = loadServiceAccount();
  const jwt = createJWT(sa);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 1 min early
  return cachedToken;
}

// --- Tools ---

const TOOLS = [
  {
    function_declarations: [
      {
        name: 'run_sql',
        description: 'Execute a read-only SQL query against the Iris database. Use this to look up historical data, check state, review past cycles, etc.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SQL SELECT query to execute' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_log',
        description: 'Get recent log entries',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: 'Number of entries (default 20)' },
            offset: { type: 'integer', description: 'Offset for pagination (default 0)' },
          },
        },
      },
      {
        name: 'get_task',
        description: 'Get details of a specific task by ID',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'integer', description: 'Task ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_state',
        description: 'Read a value from the state key-value store',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'State key to read' },
          },
          required: ['key'],
        },
      },
      {
        name: 'set_state',
        description: 'Write a value to the state key-value store',
        parameters: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'State key' },
            value: { type: 'string', description: 'JSON value to store' },
          },
          required: ['key', 'value'],
        },
      },
      {
        name: 'update_strategy',
        description: 'Rewrite the strategy document. Use this when your strategic thinking has evolved.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'New strategy document content (markdown)' },
          },
          required: ['content'],
        },
      },
    ],
  },
];

/**
 * Execute a tool call from Gemini
 */
async function executeTool(name, args) {
  const { getMany, getOne, query } = await import('./db.js');

  switch (name) {
    case 'run_sql': {
      const sql = args.query.trim();
      if (!/^SELECT/i.test(sql)) {
        return { error: 'Only SELECT queries are allowed during thinking.' };
      }
      try {
        const result = await getMany(sql);
        return { rows: result.slice(0, 50) };
      } catch (e) {
        return { error: e.message };
      }
    }
    case 'get_log': {
      const limit = args.limit || 20;
      const offset = args.offset || 0;
      return { rows: await getMany('SELECT * FROM log_entries ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]) };
    }
    case 'get_task': {
      const task = await getOne('SELECT * FROM tasks WHERE id = $1', [args.id]);
      return task || { error: 'Task not found' };
    }
    case 'get_state': {
      const state = await getOne('SELECT value FROM state WHERE key = $1', [args.key]);
      return state ? state.value : { value: null };
    }
    case 'set_state': {
      await query(
        'INSERT INTO state (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [args.key, args.value]
      );
      return { success: true };
    }
    case 'update_strategy': {
      const latest = await getOne('SELECT MAX(version) as v FROM strategy');
      const nextVersion = (latest?.v || 0) + 1;
      await query('INSERT INTO strategy (version, content) VALUES ($1, $2)', [nextVersion, args.content]);
      return { success: true, version: nextVersion };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Call Gemini via Vertex AI with Iris's system prompt, context, and tools.
 * Handles multi-turn tool calling automatically.
 */
export async function think(systemPrompt, briefing) {
  const token = await getAccessToken();
  const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/${VERTEX_REGION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;

  const contents = [
    { role: 'user', parts: [{ text: briefing }] },
  ];

  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: TOOLS,
        generation_config: {
          temperature: 0.7,
          max_output_tokens: 8192,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Vertex AI error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('No candidate returned from Vertex AI');

    const parts = candidate.content?.parts || [];
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      const textParts = parts.filter(p => p.text);
      return textParts.map(p => p.text).join('\n');
    }

    // Execute function calls and feed results back
    contents.push({ role: 'model', parts });

    const functionResponses = [];
    for (const fc of functionCalls) {
      console.log(`  🔧 Tool call: ${fc.functionCall.name}(${JSON.stringify(fc.functionCall.args).slice(0, 100)})`);
      const result = await executeTool(fc.functionCall.name, fc.functionCall.args);
      functionResponses.push({
        functionResponse: {
          name: fc.functionCall.name,
          response: result,
        },
      });
    }
    contents.push({ role: 'user', parts: functionResponses });
  }

  throw new Error('Gemini exceeded maximum tool-calling turns');
}
