/**
 * Gemini 2.5 Pro client for Iris's thinking step.
 * Uses function calling so Iris can query her own DB during thinking.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent';

// Tools Iris can use during thinking
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
async function executeTool(name, args, db) {
  const { getMany, getOne, query } = await import('./db.js');

  switch (name) {
    case 'run_sql': {
      // Safety: only allow SELECT queries
      const sql = args.query.trim();
      if (!/^SELECT/i.test(sql)) {
        return { error: 'Only SELECT queries are allowed during thinking.' };
      }
      try {
        const result = await getMany(sql);
        return { rows: result.slice(0, 50) }; // Cap at 50 rows
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
 * Call Gemini with Iris's system prompt, context, and tools.
 * Handles multi-turn tool calling automatically.
 */
export async function think(systemPrompt, briefing) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const contents = [
    { role: 'user', parts: [{ text: briefing }] },
  ];

  // Multi-turn loop: Gemini may call tools, we execute and feed back
  const MAX_TURNS = 10;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      throw new Error(`Gemini API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('No candidate returned from Gemini');

    const parts = candidate.content?.parts || [];

    // Check if there are function calls
    const functionCalls = parts.filter(p => p.functionCall);

    if (functionCalls.length === 0) {
      // No more tool calls — extract the text response
      const textParts = parts.filter(p => p.text);
      const fullText = textParts.map(p => p.text).join('\n');
      return fullText;
    }

    // Execute function calls and add results
    contents.push({ role: 'model', parts });

    const functionResponses = [];
    for (const fc of functionCalls) {
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
