import { Router } from 'express';
import { getMany } from '../db.js';

const router = Router();

// Get log entries
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const entries = await getMany(
    'SELECT * FROM log_entries ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  res.json(entries);
});

export default router;
