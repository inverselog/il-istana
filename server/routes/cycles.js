import { Router } from 'express';
import { getMany, getOne, query } from '../db.js';
import { triggerCycle, approveCycle } from '../iris.js';

const router = Router();

// List all cycles
router.get('/', async (req, res) => {
  const cycles = await getMany('SELECT * FROM cycles ORDER BY created_at DESC LIMIT 50');
  res.json(cycles);
});

// Get current active cycle
router.get('/current', async (req, res) => {
  const cycle = await getOne(
    "SELECT * FROM cycles WHERE status NOT IN ('completed', 'failed') ORDER BY created_at DESC LIMIT 1"
  );
  if (!cycle) {
    return res.json(null);
  }
  // Include messages
  const messages = await getMany(
    'SELECT * FROM messages WHERE cycle_id = $1 ORDER BY created_at',
    [cycle.id]
  );
  res.json({ ...cycle, messages });
});

// Get a specific cycle
router.get('/:id', async (req, res) => {
  const cycle = await getOne('SELECT * FROM cycles WHERE id = $1', [req.params.id]);
  if (!cycle) return res.status(404).json({ error: 'Not found' });
  const messages = await getMany(
    'SELECT * FROM messages WHERE cycle_id = $1 ORDER BY created_at',
    [cycle.id]
  );
  res.json({ ...cycle, messages });
});

// Trigger a new thinking cycle
router.post('/trigger', async (req, res) => {
  try {
    const cycle = await triggerCycle();
    res.json(cycle);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message to Iris in the current cycle
router.post('/:id/message', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content required' });

  const cycle = await getOne('SELECT * FROM cycles WHERE id = $1', [req.params.id]);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });

  await query(
    "INSERT INTO messages (cycle_id, role, content) VALUES ($1, 'manager', $2)",
    [cycle.id, content]
  );

  // Update cycle status to chatting if it was proposed
  if (cycle.status === 'proposed') {
    await query("UPDATE cycles SET status = 'chatting' WHERE id = $1", [cycle.id]);
  }

  res.json({ success: true });
});

// Approve the current cycle
router.post('/:id/approve', async (req, res) => {
  try {
    const cycle = await approveCycle(parseInt(req.params.id));
    res.json(cycle);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
