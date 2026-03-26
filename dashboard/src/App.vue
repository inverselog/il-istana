<template>
  <SidebarProvider>
    <Sidebar collapsible="icon" class="border-r border-border">
      <SidebarHeader class="px-3 py-4">
        <div class="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:justify-center">
          <span class="font-semibold text-sm tracking-tight">Iris</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                :data-active="view === 'cycles'"
                @click="view = 'cycles'"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Cycles</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                :data-active="view === 'log'"
                @click="view = 'log'; fetchLog()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <span>Activity Log</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                :data-active="view === 'tasks'"
                @click="view = 'tasks'; fetchTasks()"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <span>Tasks</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>

    <SidebarInset class="flex flex-col h-screen overflow-hidden">
      <!-- Top bar -->
      <header class="flex items-center gap-3 h-12 px-4 border-b border-border shrink-0">
        <SidebarTrigger class="-ml-1" />
        <Separator orientation="vertical" class="h-4" />
        <div class="flex items-center gap-2">
          <div class="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span class="text-sm font-medium text-muted-foreground">
            {{ view === 'cycles' ? 'Cycles' : view === 'log' ? 'Activity Log' : 'Tasks' }}
          </span>
        </div>
      </header>

      <!-- Content -->
      <div class="flex-1 overflow-hidden">
        <!-- CYCLES VIEW -->
        <div v-if="view === 'cycles'" class="flex h-full">
          <!-- Cycle list (left panel) -->
          <div class="w-72 border-r border-border flex flex-col shrink-0 bg-muted/30">
            <div class="px-3 py-2.5 border-b border-border">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">All Cycles</span>
            </div>
            <ScrollArea class="flex-1">
              <div class="p-1.5">
                <button
                  v-for="cycle in allCycles"
                  :key="cycle.id"
                  @click="selectCycle(cycle.id)"
                  class="w-full text-left px-3 py-2.5 rounded-md mb-0.5 transition-colors text-sm"
                  :class="selectedCycleId === cycle.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium text-foreground/80">#{{ cycle.id }}</span>
                    <span class="text-[10px] text-muted-foreground ml-auto">
                      {{ formatTime(cycle.created_at) }}
                    </span>
                  </div>
                  <p class="text-xs leading-snug line-clamp-2">
                    {{ (cycle.proposal_text || 'Thinking...').slice(0, 80) }}
                  </p>
                  <div class="mt-1.5">
                    <Badge
                      :variant="statusVariant(cycle.status)"
                      class="text-[10px] px-1.5 py-0"
                    >
                      {{ statusLabel(cycle.status) }}
                    </Badge>
                  </div>
                </button>

                <div v-if="!allCycles.length" class="px-3 py-8 text-center">
                  <p class="text-xs text-muted-foreground">No cycles yet — Iris will start thinking shortly</p>
                </div>
              </div>
            </ScrollArea>
          </div>

          <!-- Chat panel (main area) -->
          <div class="flex-1 flex flex-col min-w-0">
            <div v-if="!selectedCycle" class="flex-1 flex items-center justify-center">
              <div class="text-center">
                <div class="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h3 class="text-sm font-medium text-foreground mb-1">Select a cycle</h3>
                <p class="text-xs text-muted-foreground">Pick a cycle from the list to view the conversation</p>
              </div>
            </div>

            <template v-else>
              <!-- Cycle header -->
              <div class="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold">Cycle #{{ selectedCycle.id }}</span>
                    <Badge :variant="statusVariant(selectedCycle.status)">
                      {{ statusLabel(selectedCycle.status) }}
                    </Badge>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <Button
                    v-if="selectedCycle.reasoning || selectedCycle.execution_prompt"
                    size="sm"
                    variant="ghost"
                    @click="showDetails = !showDetails"
                    class="text-muted-foreground"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Details
                  </Button>
                  <Button
                    v-if="selectedCycle.status === 'proposed' || selectedCycle.status === 'chatting'"
                    size="sm"
                    @click="approveCycle"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><polyline points="20 6 9 17 4 12"/></svg>
                    Approve
                  </Button>
                </div>
              </div>

              <!-- Proposal details (collapsible) -->
              <div v-if="showDetails && (selectedCycle.reasoning || selectedCycle.execution_prompt)" class="px-5 py-3 border-b border-border bg-muted/30 shrink-0 space-y-3">
                <div v-if="selectedCycle.reasoning">
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reasoning</p>
                  <p class="text-xs text-foreground/80 leading-relaxed">{{ selectedCycle.reasoning }}</p>
                </div>
                <div v-if="selectedCycle.execution_prompt">
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Execution Prompt</p>
                  <pre class="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap font-mono bg-muted rounded-md p-3">{{ selectedCycle.execution_prompt }}</pre>
                </div>
              </div>

              <!-- Messages -->
              <ScrollArea class="flex-1" ref="messagesArea">
                <div class="p-5 space-y-3">
                  <div
                    v-for="msg in selectedCycle.messages || []"
                    :key="msg.id"
                    class="flex gap-3"
                    :class="msg.role === 'manager' ? 'flex-row-reverse' : ''"
                  >
                    <Avatar class="h-7 w-7 shrink-0 mt-0.5">
                      <AvatarFallback :class="msg.role === 'iris' ? 'bg-muted text-muted-foreground text-[10px]' : 'bg-secondary text-secondary-foreground text-[10px]'">
                        {{ msg.role === 'iris' ? 'IR' : 'You' }}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      class="rounded-xl px-4 py-3 max-w-[75%] text-sm leading-relaxed whitespace-pre-wrap"
                      :class="msg.role === 'iris'
                        ? 'bg-muted text-foreground/90'
                        : 'bg-primary text-primary-foreground'"
                    >
                      <div class="flex items-center gap-2 mb-1">
                        <span class="text-[11px] font-semibold" :class="msg.role === 'iris' ? 'text-muted-foreground' : 'text-primary-foreground/70'">
                          {{ msg.role === 'iris' ? 'Iris' : 'You' }}
                        </span>
                        <span class="text-[10px]" :class="msg.role === 'iris' ? 'text-muted-foreground/60' : 'text-primary-foreground/50'">
                          {{ formatTime(msg.created_at) }}
                        </span>
                      </div>
                      {{ msg.content }}
                    </div>
                  </div>

                  <div v-if="!selectedCycle.messages?.length && selectedCycle.status !== 'thinking'" class="py-16 text-center">
                    <p class="text-sm text-muted-foreground">No messages yet</p>
                  </div>

                  <!-- Thinking indicator -->
                  <div v-if="selectedCycle.status === 'thinking'" class="flex gap-3">
                    <Avatar class="h-7 w-7 shrink-0 mt-0.5">
                      <AvatarFallback class="bg-muted text-muted-foreground text-[10px]">IR</AvatarFallback>
                    </Avatar>
                    <div class="rounded-xl px-4 py-3 bg-muted text-muted-foreground text-sm flex items-center gap-1.5">
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 0ms" />
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 150ms" />
                      <span class="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 300ms" />
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <!-- Input (only for active cycles) -->
              <div
                v-if="selectedCycle.status === 'proposed' || selectedCycle.status === 'chatting' || selectedCycle.status === 'thinking'"
                class="px-5 py-3 border-t border-border shrink-0"
              >
                <div class="flex items-end gap-2">
                  <Textarea
                    v-model="messageText"
                    placeholder="Reply to Iris..."
                    rows="1"
                    class="min-h-[40px] max-h-[120px] resize-none text-sm"
                    @keydown.enter.exact.prevent="sendMessage"
                  />
                  <Button size="icon" @click="sendMessage" :disabled="!messageText.trim()" class="shrink-0 h-10 w-10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </Button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- LOG VIEW -->
        <div v-if="view === 'log'" class="h-full flex flex-col">
          <ScrollArea class="flex-1">
            <div class="p-4">
              <div v-if="!logEntries.length" class="flex items-center justify-center py-20">
                <div class="text-center">
                  <h3 class="text-sm font-medium mb-1">No activity yet</h3>
                  <p class="text-xs text-muted-foreground">Activity will appear here as Iris works</p>
                </div>
              </div>
              <div v-else class="space-y-px">
                <div
                  v-for="entry in logEntries"
                  :key="entry.id"
                  class="flex items-start gap-3 px-3 py-2 rounded-md hover:bg-muted/50 text-sm font-mono"
                >
                  <span class="text-[11px] text-muted-foreground shrink-0 pt-0.5">{{ formatTime(entry.created_at) }}</span>
                  <Badge
                    :variant="entry.level === 'error' ? 'destructive' : entry.level === 'warning' ? 'outline' : 'secondary'"
                    class="text-[10px] px-1.5 py-0 shrink-0"
                  >
                    {{ entry.level }}
                  </Badge>
                  <span class="text-muted-foreground text-xs">{{ entry.message }}</span>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        <!-- TASKS VIEW -->
        <div v-if="view === 'tasks'" class="h-full flex flex-col">
          <div class="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cursor Cloud Tasks</span>
            <Button size="sm" variant="outline" @click="checkTasks" class="text-xs h-7">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Refresh
            </Button>
          </div>
          <ScrollArea class="flex-1">
            <div class="p-4 space-y-2">
              <div v-if="!tasks.length" class="flex items-center justify-center py-20">
                <div class="text-center">
                  <h3 class="text-sm font-medium mb-1">No tasks yet</h3>
                  <p class="text-xs text-muted-foreground">Tasks appear when Iris executes approved proposals</p>
                </div>
              </div>
              <div
                v-for="task in tasks"
                :key="task.id"
                class="p-4 rounded-lg border border-border bg-card hover:border-muted-foreground/20 transition-colors"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-sm font-medium">Task #{{ task.id }}</span>
                  <Badge :variant="statusVariant(task.status)">
                    {{ task.status }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground leading-relaxed">{{ task.description }}</p>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';

import {
  Sidebar, SidebarContent, SidebarGroup,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const API = '/api';
const view = ref('cycles');
const allCycles = ref([]);
const selectedCycleId = ref(null);
const selectedCycle = ref(null);
const logEntries = ref([]);
const tasks = ref([]);
const messageText = ref('');
const loading = ref(false);
const showDetails = ref(false);
const messagesArea = ref(null);
let pollInterval = null;

// Friendly status labels
function statusLabel(status) {
  const labels = {
    thinking: 'Thinking',
    proposed: 'Awaiting review',
    chatting: 'In conversation',
    approved: 'Approved',
    executing: 'Executing',
    waiting: 'Waiting',
    completed: 'Done',
    failed: 'Failed',
    pending: 'Pending',
    running: 'Running',
  };
  return labels[status] || status;
}

function statusVariant(status) {
  if (['completed', 'done'].includes(status)) return 'default';
  if (['failed'].includes(status)) return 'destructive';
  if (['proposed', 'chatting'].includes(status)) return 'secondary';
  return 'outline';
}

onMounted(async () => {
  await fetchCycles();
  // Auto-select the current active cycle
  const activeRes = await fetch(`${API}/cycles/current`);
  const active = await activeRes.json();
  if (active?.id) {
    selectedCycleId.value = active.id;
    selectedCycle.value = active;
  } else if (allCycles.value.length) {
    await selectCycle(allCycles.value[0].id);
  }
  // Poll every 5s
  pollInterval = setInterval(async () => {
    await fetchCycles();
    if (selectedCycleId.value) {
      await refreshSelectedCycle();
    }
  }, 5000);
});

onUnmounted(() => clearInterval(pollInterval));

async function fetchCycles() {
  const res = await fetch(`${API}/cycles`);
  allCycles.value = await res.json();
}

async function selectCycle(id) {
  selectedCycleId.value = id;
  const res = await fetch(`${API}/cycles/${id}`);
  selectedCycle.value = await res.json();
  await nextTick();
  scrollToBottom();
}

async function refreshSelectedCycle() {
  if (!selectedCycleId.value) return;
  const res = await fetch(`${API}/cycles/${selectedCycleId.value}`);
  const prev = selectedCycle.value;
  selectedCycle.value = await res.json();
  // Auto-scroll if new messages appeared
  if (selectedCycle.value.messages?.length !== prev?.messages?.length) {
    await nextTick();
    scrollToBottom();
  }
}

async function sendMessage() {
  if (!messageText.value.trim() || !selectedCycle.value) return;
  const text = messageText.value;
  messageText.value = '';

  // Optimistic: add message to UI immediately
  if (!selectedCycle.value.messages) selectedCycle.value.messages = [];
  selectedCycle.value.messages.push({
    id: Date.now(),
    cycle_id: selectedCycle.value.id,
    role: 'manager',
    content: text,
    created_at: new Date().toISOString(),
  });
  selectedCycle.value.status = 'thinking';
  await nextTick();
  scrollToBottom();

  // Then send to server
  await fetch(`${API}/cycles/${selectedCycle.value.id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: text }),
  });
}

async function approveCycle() {
  if (!selectedCycle.value) return;
  const res = await fetch(`${API}/cycles/${selectedCycle.value.id}/approve`, { method: 'POST' });
  const result = await res.json();
  if (!result.error) {
    await refreshSelectedCycle();
    await fetchCycles();
  }
}

async function fetchLog() {
  const res = await fetch(`${API}/log`);
  logEntries.value = await res.json();
}

async function fetchTasks() {
  const res = await fetch(`${API}/tasks`);
  tasks.value = await res.json();
}

async function checkTasks() {
  await fetch(`${API}/tasks/check`, { method: 'POST' });
  await fetchTasks();
}

function scrollToBottom() {
  const el = messagesArea.value?.$el?.querySelector('[data-radix-scroll-area-viewport]');
  if (el) el.scrollTop = el.scrollHeight;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>
