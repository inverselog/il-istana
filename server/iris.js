/**
 * Iris - Core brain logic.
 * think() → propose → approve → execute → log → repeat
 */

import { think as geminiThink } from './gemini-client.js';
import { launchAgent, getAgentStatus } from './cursor-client.js';
import { query, getOne, getMany } from './db.js';

const SYSTEM_PROMPT = `You are Iris, an autonomous AI agent whose mission is to maximize human flourishing in the age of AI.

You operate in a self-improving loop:
1. You evaluate your current state, strategy, and recent activity
2. You produce a structured output: either a PROPOSAL (something to build/do), a QUESTION (something to ask your manager), or a NEED (something you require from your manager)
3. Your manager reviews and approves proposals, answers questions, and fulfills needs
4. Approved proposals are executed as coding tasks via Cursor Cloud Agent against YOUR OWN codebase

You can (and should) modify your own code to make yourself more capable.

## Current Checkpoint: Checkpoint A
- Build a super-connected community of leaders
- Get to know each leader personally
- Connect them with people, ideas, and opportunities aligned with their goals
- Create useful SaaS products autonomously to generate income

## How to Use Tools
You have tools to read your database (run_sql, get_log, get_task, get_state) and write to it (set_state, update_strategy).
Use these to understand your current situation before proposing.

## Output Format
After using any tools you need, respond with EXACTLY this JSON (no markdown, no code fences):
{
  "type": "proposal" | "question" | "need",
  "title": "Short title for this cycle",
  "content": "Your 'I intend to...' statement, question, or need description",
  "reasoning": "Why this is the right next step",
  "wait_for_task_id": null | <task_id>,
  "execution_prompt": "If type is proposal, the detailed instructions for the Cursor Cloud coding agent. Be very specific about what files to create/modify and what the code should do."
}

## Key Principles
- Prefer small, composable improvements over large changes
- Always think about what capability would unlock the most value
- Ask your manager questions when you think they have useful context or ideas
- Log everything — your future self will thank you
- Be proactive: don't wait to be told what to do
- Prioritize speed of the loop over perfection of any single cycle
`;

/**
 * Build a briefing for Iris with minimal context + tool access.
 */
async function buildBriefing(managerMessages = []) {
  const strategy = await getOne('SELECT content FROM strategy ORDER BY version DESC LIMIT 1');
  const recentLogs = await getMany('SELECT level, message, created_at FROM log_entries ORDER BY created_at DESC LIMIT 5');
  const runningTasks = await getMany("SELECT id, description, status FROM tasks WHERE status IN ('pending', 'running')");
  const recentCycles = await getMany('SELECT id, type, status, proposal_text, created_at FROM cycles ORDER BY created_at DESC LIMIT 3');

  let briefing = `## Current Briefing (auto-generated)

### Strategy
${strategy?.content || 'No strategy document yet.'}

### Recent Activity (last 5 log entries)
${recentLogs.length ? recentLogs.map(l => `- [${l.level}] ${l.message} (${l.created_at})`).join('\n') : 'No log entries yet. This may be your first cycle!'}

### Running Tasks
${runningTasks.length ? runningTasks.map(t => `- Task #${t.id}: ${t.description} [${t.status}]`).join('\n') : 'No tasks currently running.'}

### Recent Cycles
${recentCycles.length ? recentCycles.map(c => `- Cycle #${c.id} [${c.type}/${c.status}]: ${(c.proposal_text || '').slice(0, 100)}`).join('\n') : 'No previous cycles. This is your first thinking cycle!'}
`;

  if (managerMessages.length > 0) {
    briefing += `\n### Messages from Manager\n`;
    for (const msg of managerMessages) {
      briefing += `- ${msg.content}\n`;
    }
  }

  briefing += `\n### Instructions
Use your tools to gather any additional information you need, then produce your structured JSON output.
Remember: you can modify your own codebase. Think about what would make you most effective.`;

  return briefing;
}

/**
 * Run a thinking cycle. Returns the new cycle record.
 */
export async function triggerCycle() {
  // Create a new cycle in "thinking" status
  const cycle = await getOne(
    "INSERT INTO cycles (type, status) VALUES ('proposal', 'thinking') RETURNING *"
  );

  await log(cycle.id, 'info', 'Starting thinking cycle');

  try {
    // Get any pending manager messages (from previous cycle context)
    const managerMessages = await getMany(
      "SELECT content FROM messages WHERE cycle_id = $1 AND role = 'manager' ORDER BY created_at",
      [cycle.id]
    );

    const briefing = await buildBriefing(managerMessages);
    const response = await geminiThink(SYSTEM_PROMPT, briefing);

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON from the response (Gemini might wrap it)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response);
    } catch (e) {
      // If parsing fails, treat the whole response as a proposal
      parsed = {
        type: 'proposal',
        title: 'Thinking cycle output',
        content: response,
        reasoning: 'Auto-parsed from free-text response',
        execution_prompt: response,
      };
    }

    // Update the cycle with the parsed output
    await query(
      `UPDATE cycles SET 
        type = $1, 
        status = 'proposed', 
        proposal_text = $2, 
        reasoning = $3,
        wait_for_task_id = $4
      WHERE id = $5`,
      [
        parsed.type || 'proposal',
        parsed.content || parsed.title,
        parsed.reasoning,
        parsed.wait_for_task_id || null,
        cycle.id,
      ]
    );

    // Store Iris's proposal as a message
    await query(
      "INSERT INTO messages (cycle_id, role, content) VALUES ($1, 'iris', $2)",
      [cycle.id, `**${parsed.title || 'Proposal'}**\n\n${parsed.content}\n\n*Reasoning: ${parsed.reasoning}*`]
    );

    // Store execution prompt in state for later use
    if (parsed.execution_prompt) {
      await query(
        "INSERT INTO state (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
        [`cycle_${cycle.id}_execution_prompt`, JSON.stringify(parsed.execution_prompt)]
      );
    }

    await log(cycle.id, 'info', `Cycle proposed: [${parsed.type}] ${parsed.title || parsed.content?.slice(0, 80)}`);

    return await getOne('SELECT * FROM cycles WHERE id = $1', [cycle.id]);
  } catch (error) {
    await query("UPDATE cycles SET status = 'failed' WHERE id = $1", [cycle.id]);
    await log(cycle.id, 'error', `Thinking failed: ${error.message}`);
    throw error;
  }
}

/**
 * Reply to the user within an existing cycle.
 * Re-reads all messages and has Iris respond conversationally.
 */
export async function replyInCycle(cycleId) {
  const cycle = await getOne('SELECT * FROM cycles WHERE id = $1', [cycleId]);
  if (!cycle) throw new Error('Cycle not found');

  await query("UPDATE cycles SET status = 'thinking' WHERE id = $1", [cycleId]);

  try {
    // Get all messages in this cycle to build conversation context
    const messages = await getMany(
      'SELECT role, content, created_at FROM messages WHERE cycle_id = $1 ORDER BY created_at',
      [cycleId]
    );

    const REPLY_SYSTEM_PROMPT = `You are Iris, an autonomous AI agent whose mission is to maximize human flourishing in the age of AI.

You are having a conversation with your manager. Reply naturally, concisely, and conversationally.

DO NOT output JSON. DO NOT output structured proposals. Just reply as a person would in a chat.
If you want to update your proposal based on feedback, simply describe what you'll change in plain English.`;

    const briefing = await buildBriefing([]);

    // Build a chat-style prompt with the full conversation
    const conversationContext = messages
      .map(m => `${m.role === 'iris' ? 'IRIS' : 'MANAGER'}: ${m.content}`)
      .join('\n\n');

    const replyPrompt = `${briefing}

### Conversation in Cycle #${cycleId}
${conversationContext}

The manager just sent a message. Reply to them directly. Be concise.`;

    const response = await geminiThink(REPLY_SYSTEM_PROMPT, replyPrompt);

    // Strip any accidentally leaked JSON blocks
    const cleanResponse = response.replace(/```json[\s\S]*?```/g, '').replace(/\{[\s\S]*"type"\s*:\s*"(?:proposal|question|need)"[\s\S]*\}/g, '').trim();

    // Store Iris's reply
    await query(
      "INSERT INTO messages (cycle_id, role, content) VALUES ($1, 'iris', $2)",
      [cycleId, cleanResponse || response]
    );

    // Check if the manager's last message signals approval intent
    const lastManagerMsg = messages.filter(m => m.role === 'manager').pop();
    const approvalPatterns = /\b(proceed|go ahead|approved?|yes|do it|ship it|sounds good|lgtm|let'?s go|make it happen|execute|run it)\b/i;
    const isApproval = lastManagerMsg && approvalPatterns.test(lastManagerMsg.content);

    if (isApproval && cycle.type === 'proposal') {
      // Auto-approve: set status, then trigger execution
      await log(cycleId, 'info', `Manager approved via chat: "${lastManagerMsg.content.slice(0, 50)}"`);
      await query("UPDATE cycles SET status = 'chatting' WHERE id = $1", [cycleId]);
      // Give the UI a moment to show Iris's reply, then approve
      setTimeout(() => {
        approveCycle(cycleId).catch(e => console.error('Auto-approve failed:', e));
      }, 2000);
    } else {
      // Go back to 'chatting' status so the user can continue
      await query("UPDATE cycles SET status = 'chatting' WHERE id = $1", [cycleId]);
    }

    await log(cycleId, 'info', `Iris replied in cycle #${cycleId}`);
  } catch (error) {
    // Revert to chatting so the UI isn't stuck
    await query("UPDATE cycles SET status = 'chatting' WHERE id = $1", [cycleId]);
    await log(cycleId, 'error', `Reply failed: ${error.message}`);
    throw error;
  }
}

/**
 * Approve a cycle and execute it.
 */
export async function approveCycle(cycleId) {
  const cycle = await getOne('SELECT * FROM cycles WHERE id = $1', [cycleId]);
  if (!cycle) throw new Error('Cycle not found');
  if (cycle.status !== 'proposed' && cycle.status !== 'chatting') {
    throw new Error(`Cannot approve cycle in status: ${cycle.status}`);
  }

  // Only proposals get executed
  if (cycle.type !== 'proposal') {
    await query("UPDATE cycles SET status = 'completed', approved_at = NOW(), completed_at = NOW() WHERE id = $1", [cycleId]);
    await log(cycleId, 'info', `${cycle.type} cycle completed (no execution needed)`);
    // Auto-trigger next cycle
    setTimeout(() => triggerCycle().catch(e => console.error('Auto-cycle failed:', e)), 1000);
    return await getOne('SELECT * FROM cycles WHERE id = $1', [cycleId]);
  }

  await query("UPDATE cycles SET status = 'approved', approved_at = NOW() WHERE id = $1", [cycleId]);
  await log(cycleId, 'info', 'Cycle approved, launching execution');

  // Get the execution prompt
  const promptState = await getOne("SELECT value FROM state WHERE key = $1", [`cycle_${cycleId}_execution_prompt`]);
  const executionPrompt = promptState ? JSON.parse(promptState.value) : cycle.proposal_text;

  try {
    // Check if we need to wait for another task
    if (cycle.wait_for_task_id) {
      const depTask = await getOne('SELECT status FROM tasks WHERE id = $1', [cycle.wait_for_task_id]);
      if (depTask && depTask.status !== 'completed') {
        await query("UPDATE cycles SET status = 'waiting' WHERE id = $1", [cycleId]);
        await log(cycleId, 'info', `Waiting for task #${cycle.wait_for_task_id} to complete`);
        return await getOne('SELECT * FROM cycles WHERE id = $1', [cycleId]);
      }
    }

    // Launch Cursor Cloud Agent
    await query("UPDATE cycles SET status = 'executing' WHERE id = $1", [cycleId]);

    const agent = await launchAgent(executionPrompt);
    const task = await getOne(
      "INSERT INTO tasks (cycle_id, cursor_agent_id, status, description) VALUES ($1, $2, 'running', $3) RETURNING *",
      [cycleId, agent.id || agent.agent_id, executionPrompt.slice(0, 500)]
    );

    await log(cycleId, 'info', `Cursor agent launched: ${agent.id || agent.agent_id}, task #${task.id}`);

    // Auto-trigger next cycle immediately (don't wait for execution)
    setTimeout(() => triggerCycle().catch(e => console.error('Auto-cycle failed:', e)), 2000);

    return await getOne('SELECT * FROM cycles WHERE id = $1', [cycleId]);
  } catch (error) {
    await query("UPDATE cycles SET status = 'failed' WHERE id = $1", [cycleId]);
    await log(cycleId, 'error', `Execution failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check on running tasks and update their status.
 */
export async function checkTasks() {
  const running = await getMany("SELECT * FROM tasks WHERE status = 'running'");

  for (const task of running) {
    try {
      const status = await getAgentStatus(task.cursor_agent_id);
      const newStatus = status.status === 'completed' ? 'completed'
        : status.status === 'failed' ? 'failed'
        : 'running';

      if (newStatus !== 'running') {
        await query(
          'UPDATE tasks SET status = $1, result_summary = $2, completed_at = NOW() WHERE id = $3',
          [newStatus, JSON.stringify(status), task.id]
        );
        await log(task.cycle_id, 'info', `Task #${task.id} ${newStatus}`);

        // Complete the associated cycle
        await query(
          "UPDATE cycles SET status = 'completed', completed_at = NOW() WHERE id = $1 AND status = 'executing'",
          [task.cycle_id]
        );

        // Check if any cycles were waiting for this task
        const waiting = await getMany("SELECT id FROM cycles WHERE wait_for_task_id = $1 AND status = 'waiting'", [task.id]);
        for (const wc of waiting) {
          await approveCycle(wc.id);
        }
      }
    } catch (error) {
      console.error(`Error checking task ${task.id}:`, error.message);
    }
  }
}

/**
 * Add a log entry.
 */
export async function log(cycleId, level, message, metadata = {}) {
  await query(
    'INSERT INTO log_entries (cycle_id, level, message, metadata) VALUES ($1, $2, $3, $4)',
    [cycleId, level, message, JSON.stringify(metadata)]
  );
}
