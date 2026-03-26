import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchSecretsAndSetEnv } from './src/gcp-secrets.js';

try {
  await fetchSecretsAndSetEnv();
} catch (error) {
  console.error('Failed to load secrets from Google Secret Manager:', error);
  process.exit(1);
}

const [
  { default: express },
  { default: cors },
  { default: cyclesRouter },
  { default: logRouter },
  { default: tasksRouter },
  { checkTasks, triggerCycle },
  { getOne },
] = await Promise.all([
  import('express'),
  import('cors'),
  import('./routes/cycles.js'),
  import('./routes/log.js'),
  import('./routes/tasks.js'),
  import('./iris.js'),
  import('./db.js'),
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/cycles', cyclesRouter);
app.use('/api/log', logRouter);
app.use('/api/tasks', tasksRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', agent: 'Iris', version: '0.1.0' });
});

// Serve Vue dashboard (production)
const dashboardPath = join(__dirname, '..', 'dashboard', 'dist');
app.use(express.static(dashboardPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(dashboardPath, 'index.html'));
  }
});

// Poll running tasks every 30 seconds
setInterval(() => {
  checkTasks().catch(e => console.error('Task check error:', e));
}, 30_000);

app.listen(PORT, async () => {
  console.log(`🌸 Iris is awake on port ${PORT}`);
  console.log(`   API: http://localhost:${PORT}/api/health`);
  console.log(`   Dashboard: http://localhost:${PORT}`);

  // Auto-trigger first cycle if no active cycle exists
  const active = await getOne("SELECT id FROM cycles WHERE status NOT IN ('completed', 'failed') LIMIT 1");
  if (!active) {
    console.log('   No active cycle found — Iris is starting to think...');
    triggerCycle().catch(e => console.error('Auto-trigger failed:', e));
  }
});
