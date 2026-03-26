/**
 * Cursor Cloud Agent API client.
 * Used to launch coding agents that modify the il-istana repo.
 */

const CURSOR_API_BASE = 'https://api.cursor.com/v0';

function headers() {
  const key = process.env.CURSOR_API_KEY;
  if (!key) throw new Error('CURSOR_API_KEY not set');
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Launch a Cursor Cloud Agent to perform a coding task.
 */
export async function launchAgent(task) {
  const res = await fetch(`${CURSOR_API_BASE}/agents`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      repo: 'inverselog/il-istana',
      task,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cursor API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Get status of a running agent.
 */
export async function getAgentStatus(agentId) {
  const res = await fetch(`${CURSOR_API_BASE}/agents/${agentId}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cursor API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * Get the conversation/output of an agent.
 */
export async function getAgentConversation(agentId) {
  const res = await fetch(`${CURSOR_API_BASE}/agents/${agentId}/conversation`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cursor API error ${res.status}: ${err}`);
  }

  return res.json();
}

/**
 * List all agents.
 */
export async function listAgents() {
  const res = await fetch(`${CURSOR_API_BASE}/agents`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cursor API error ${res.status}: ${err}`);
  }

  return res.json();
}
