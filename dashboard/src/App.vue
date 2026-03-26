<template>
  <div class="app">
    <header class="header">
      <div class="status-dot"></div>
      <h1>Iris</h1>
      <div class="tabs">
        <button class="tab" :class="{ active: view === 'cycle' }" @click="view = 'cycle'">Current Cycle</button>
        <button class="tab" :class="{ active: view === 'log' }" @click="view = 'log'; fetchLog()">Activity Log</button>
        <button class="tab" :class="{ active: view === 'tasks' }" @click="view = 'tasks'; fetchTasks()">Tasks</button>
        <button class="tab" :class="{ active: view === 'history' }" @click="view = 'history'; fetchCycles()">History</button>
      </div>
    </header>

    <main class="main">
      <!-- Cycle View -->
      <div class="panel" v-if="view === 'cycle'" style="max-width: 800px; margin: 0 auto;">
        <div v-if="!currentCycle" class="empty">
          <h3>🌸 No active cycle</h3>
          <p>Iris is idle. Trigger a new thinking cycle to get started.</p>
          <div style="margin-top: 20px;">
            <button class="btn btn-primary" @click="triggerCycle" :disabled="loading">
              {{ loading ? 'Thinking...' : '✨ Trigger Thinking Cycle' }}
            </button>
          </div>
        </div>

        <div v-else>
          <div class="card">
            <div class="card-header">
              <span class="card-title">Cycle #{{ currentCycle.id }}</span>
              <span class="badge" :class="'badge-' + currentCycle.type">{{ currentCycle.type }}</span>
              <span class="badge" :class="'badge-' + currentCycle.status">{{ currentCycle.status }}</span>
            </div>

            <!-- Messages -->
            <div v-if="currentCycle.messages?.length">
              <div
                v-for="msg in currentCycle.messages"
                :key="msg.id"
                class="message"
                :class="'message-' + msg.role"
              >
                <div class="message-label">{{ msg.role === 'iris' ? '🌸 Iris' : '👤 You' }}</div>
                {{ msg.content }}
              </div>
            </div>

            <!-- Actions -->
            <div class="actions" v-if="currentCycle.status === 'proposed' || currentCycle.status === 'chatting'">
              <div class="input-area" style="flex: 1;">
                <textarea
                  v-model="messageText"
                  placeholder="Chat with Iris..."
                  rows="2"
                  @keydown.enter.meta="sendMessage"
                  @keydown.enter.ctrl="sendMessage"
                ></textarea>
                <button class="btn btn-outline" @click="sendMessage" :disabled="!messageText.trim()">Send</button>
              </div>
            </div>
            <div class="actions" v-if="currentCycle.status === 'proposed' || currentCycle.status === 'chatting'">
              <button class="btn btn-success" @click="approveCycle">✓ Approve</button>
              <button class="btn btn-primary" @click="triggerCycle" :disabled="loading" style="margin-left: auto;">
                ✨ New Cycle
              </button>
            </div>
            <div class="actions" v-else-if="currentCycle.status === 'completed' || currentCycle.status === 'failed'">
              <button class="btn btn-primary" @click="triggerCycle" :disabled="loading">
                ✨ Next Cycle
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Log View -->
      <div class="panel" v-if="view === 'log'">
        <div class="section-header">Activity Log</div>
        <div v-if="!logEntries.length" class="empty">
          <h3>No activity yet</h3>
        </div>
        <div v-else>
          <div class="log-entry" v-for="entry in logEntries" :key="entry.id">
            <span class="log-time">{{ formatTime(entry.created_at) }}</span>
            <span class="log-level" :class="'log-level-' + entry.level">{{ entry.level }}</span>
            <span class="log-message">{{ entry.message }}</span>
          </div>
        </div>
      </div>

      <!-- Tasks View -->
      <div class="panel" v-if="view === 'tasks'">
        <div class="section-header">Cursor Cloud Tasks</div>
        <div v-if="!tasks.length" class="empty">
          <h3>No tasks yet</h3>
          <p>Tasks appear when Iris executes approved proposals.</p>
        </div>
        <div v-else>
          <div class="card" v-for="task in tasks" :key="task.id">
            <div class="card-header">
              <span class="card-title">Task #{{ task.id }}</span>
              <span class="badge" :class="'badge-' + task.status">{{ task.status }}</span>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5;">
              {{ task.description }}
            </p>
          </div>
        </div>
        <div style="margin-top: 12px;">
          <button class="btn btn-outline" @click="checkTasks">🔄 Check Task Status</button>
        </div>
      </div>

      <!-- History View -->
      <div class="panel" v-if="view === 'history'">
        <div class="section-header">Cycle History</div>
        <div v-if="!allCycles.length" class="empty">
          <h3>No cycles yet</h3>
        </div>
        <div v-else>
          <div class="card" v-for="cycle in allCycles" :key="cycle.id" @click="viewCycle(cycle)" style="cursor: pointer;">
            <div class="card-header">
              <span class="card-title">Cycle #{{ cycle.id }}</span>
              <span class="badge" :class="'badge-' + cycle.type">{{ cycle.type }}</span>
              <span class="badge" :class="'badge-' + cycle.status">{{ cycle.status }}</span>
              <span style="margin-left: auto; font-size: 12px; color: var(--text-muted);">
                {{ formatTime(cycle.created_at) }}
              </span>
            </div>
            <p style="font-size: 13px; color: var(--text-secondary);">
              {{ (cycle.proposal_text || '').slice(0, 150) }}{{ (cycle.proposal_text || '').length > 150 ? '...' : '' }}
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script>
const API = '/api';

export default {
  data() {
    return {
      view: 'cycle',
      currentCycle: null,
      allCycles: [],
      logEntries: [],
      tasks: [],
      messageText: '',
      loading: false,
      pollInterval: null,
    };
  },
  async mounted() {
    await this.fetchCurrentCycle();
    // Poll for updates every 5 seconds
    this.pollInterval = setInterval(() => {
      if (this.view === 'cycle') this.fetchCurrentCycle();
    }, 5000);
  },
  beforeUnmount() {
    clearInterval(this.pollInterval);
  },
  methods: {
    async fetchCurrentCycle() {
      try {
        const res = await fetch(`${API}/cycles/current`);
        this.currentCycle = await res.json();
      } catch (e) {
        console.error('Failed to fetch current cycle:', e);
      }
    },
    async fetchCycles() {
      const res = await fetch(`${API}/cycles`);
      this.allCycles = await res.json();
    },
    async fetchLog() {
      const res = await fetch(`${API}/log`);
      this.logEntries = await res.json();
    },
    async fetchTasks() {
      const res = await fetch(`${API}/tasks`);
      this.tasks = await res.json();
    },
    async triggerCycle() {
      this.loading = true;
      try {
        const res = await fetch(`${API}/cycles/trigger`, { method: 'POST' });
        const cycle = await res.json();
        if (cycle.error) {
          alert(`Error: ${cycle.error}`);
        } else {
          await this.fetchCurrentCycle();
        }
      } catch (e) {
        alert(`Failed: ${e.message}`);
      } finally {
        this.loading = false;
      }
    },
    async sendMessage() {
      if (!this.messageText.trim() || !this.currentCycle) return;
      await fetch(`${API}/cycles/${this.currentCycle.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: this.messageText }),
      });
      this.messageText = '';
      await this.fetchCurrentCycle();
    },
    async approveCycle() {
      if (!this.currentCycle) return;
      try {
        const res = await fetch(`${API}/cycles/${this.currentCycle.id}/approve`, { method: 'POST' });
        const result = await res.json();
        if (result.error) {
          alert(`Error: ${result.error}`);
        } else {
          await this.fetchCurrentCycle();
        }
      } catch (e) {
        alert(`Failed to approve: ${e.message}`);
      }
    },
    async checkTasks() {
      await fetch(`${API}/tasks/check`, { method: 'POST' });
      await this.fetchTasks();
    },
    viewCycle(cycle) {
      this.currentCycle = cycle;
      this.view = 'cycle';
      this.fetchCurrentCycle();
    },
    formatTime(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
  },
};
</script>
