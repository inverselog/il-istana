import { Router } from 'express';
import { getMany, getOne } from '../db.js';
import { checkTasks } from '../iris.js';

const router = Router();

// List tasks
router.get('/', async (req, res) => {
  const tasks = await getMany('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50');
  res.json(tasks);
});

// Get a specific task
router.get('/:id', async (req, res) => {
  const task = await getOne('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.json(task);
});

// Manually trigger task status check
router.post('/check', async (req, res) => {
  try {
    await checkTasks();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
