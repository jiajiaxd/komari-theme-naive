<script setup lang="ts">
import type { HomepagePingTaskBindings, PingTaskSummary } from '@/types/komari'
import {
  NAlert,
  NButton,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NInput,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { usePingOverviewStore } from '@/stores/pingOverview'
import { getSharedApi } from '@/utils/api'
import { HOMEPAGE_MULTI_PING_TASK_COUNT, normalizeHomepagePingTaskBindings } from '@/utils/pingTasks'

defineOptions({ name: 'ThemeManageView' })

const appStore = useAppStore()
const nodesStore = useNodesStore()
const pingStore = usePingOverviewStore()
const router = useRouter()
const api = getSharedApi()

interface AdminClient {
  uuid: string
  name: string
  group?: string
  region?: string
}

// ---------- 任务列表加载 ----------
const tasksLoading = ref(false)
const tasksLoadError = ref<string | null>(null)
const allTasks = ref<PingTaskSummary[]>([])

async function loadTasks() {
  tasksLoading.value = true
  tasksLoadError.value = null
  try {
    const result = await api.getAdminPingTasks()
    // 兼容字段缺失，过滤掉无效 id
    allTasks.value = (result ?? []).filter(t => typeof t.id === 'number' && t.id > 0)
  }
  catch (e) {
    tasksLoadError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    tasksLoading.value = false
  }
}

// ---------- 节点列表（从现有 nodes store；admin 接口亦可用 /api/admin/client/list，这里简化）----------
const clientsLoading = ref(false)
const allClients = ref<AdminClient[]>([])

async function loadClients() {
  clientsLoading.value = true
  try {
    // 优先用现有 store 已加载的节点数据，避免重复请求
    if (nodesStore.nodes.length > 0) {
      allClients.value = nodesStore.nodes.map(n => ({
        uuid: n.uuid,
        name: n.name || n.uuid,
        group: n.group || undefined,
        region: n.region || undefined,
      }))
      return
    }
    // 兜底：空列表
    allClients.value = []
  }
  finally {
    clientsLoading.value = false
  }
}

// ---------- draft 数据（要保存的内容）----------
// 这里不允许直接写 publicSettings（那是 runtime），所以用一个 draft，保存后回写。
type DraftBindings = HomepagePingTaskBindings
type DraftMultiTaskIds = number[]

const draftEnableMulti = ref(false)
const draftMultiTaskIds = ref<DraftMultiTaskIds>([])
const draftBindings = ref<DraftBindings>({})
const initialized = ref(false)

// ---------- UI 搜索 ----------
const taskSearch = ref('')
const nodeSearchByTaskId = ref<Record<number, string>>({})

function getNodeSearch(taskId: number): string {
  return nodeSearchByTaskId.value[taskId] ?? ''
}
function setNodeSearch(taskId: number, v: string) {
  nodeSearchByTaskId.value = { ...nodeSearchByTaskId.value, [taskId]: v }
}

// ---------- 初始化（加载后填充 draft）----------
onMounted(async () => {
  // 未登录回首页
  if (!appStore.isLoggedIn) {
    router.replace('/')
    return
  }
  await Promise.all([loadTasks(), loadClients()])
  // 从当前 theme_settings 填充 draft
  draftEnableMulti.value = !!appStore.enableHomepageMultiPing
  draftMultiTaskIds.value = [...appStore.homepageMultiPingTaskIds]
  // 保证 multi 三槽位
  if (draftEnableMulti.value) {
    while (draftMultiTaskIds.value.length < HOMEPAGE_MULTI_PING_TASK_COUNT)
      draftMultiTaskIds.value.push(0)
  }
  draftBindings.value = JSON.parse(JSON.stringify(appStore.homepagePingBindings)) as DraftBindings
  initialized.value = true
})

// ---------- 字段间逻辑 ----------
const sortedTasks = computed(() => {
  return [...allTasks.value].sort((a, b) => a.id - b.id)
})
const filteredTasks = computed(() => {
  const s = taskSearch.value.trim().toLowerCase()
  if (!s)
    return sortedTasks.value
  return sortedTasks.value.filter(t =>
    (t.name || `#${t.id}`).toLowerCase().includes(s)
    || String(t.id).includes(s)
    || (t.type || '').toLowerCase().includes(s),
  )
})

// 反查 nodeId -> taskId（取第一个匹配，后保存端有 dedupe）
const assignedTaskByNode = computed(() => {
  const map = new Map<string, number>()
  for (const [taskId, uuids] of Object.entries(draftBindings.value)) {
    const id = Number(taskId)
    if (!Number.isFinite(id) || id <= 0)
      continue
    for (const uuid of uuids) {
      if (!map.has(uuid))
        map.set(uuid, id)
    }
  }
  return map
})

// 获取某任务下已绑节点
function getAssigned(taskId: number): string[] {
  return draftBindings.value[String(taskId)] ?? []
}
function isAssigned(taskId: number, uuid: string): boolean {
  return getAssigned(taskId).includes(uuid)
}

// 单选/取消单选
function toggleAssign(taskId: number, uuid: string, checked: boolean) {
  const key = String(taskId)
  const cur = new Set(getAssigned(taskId))
  if (checked) {
    // 移除其他任务对该 uuid 的绑定（单线路语义）
    for (const [k, list] of Object.entries(draftBindings.value)) {
      if (k === key)
        continue
      if (list.includes(uuid)) {
        const next = list.filter(u => u !== uuid)
        if (next.length === 0)
          delete draftBindings.value[k]
        else
          draftBindings.value[k] = next
      }
    }
    cur.add(uuid)
  }
  else {
    cur.delete(uuid)
  }
  const arr = Array.from(cur)
  if (arr.length === 0)
    delete draftBindings.value[key]
  else
    draftBindings.value[key] = arr
}

function clearAssignForTask(taskId: number) {
  const key = String(taskId)
  const next = { ...draftBindings.value }
  delete next[key]
  draftBindings.value = next
}

// 选择当前任务下"未被其他任务占用"的可见节点 uuid
function selectableVisibleClients(taskId: number): AdminClient[] {
  return allClients.value.filter((c) => {
    const assigned = assignedTaskByNode.value.get(c.uuid)
    return !assigned || assigned === taskId
  })
}

function selectAllVisible(taskId: number) {
  const uuids = filteredClientsForTask(taskId).map(c => c.uuid)
  const key = String(taskId)
  const set = new Set(draftBindings.value[key] ?? [])
  for (const u of uuids) {
    // 移除其他任务占用
    for (const [k, list] of Object.entries(draftBindings.value)) {
      if (k === key)
        continue
      if (list.includes(u)) {
        const next = list.filter(x => x !== u)
        if (next.length === 0)
          delete draftBindings.value[k]
        else
          draftBindings.value[k] = next
      }
    }
    set.add(u)
  }
  draftBindings.value = { ...draftBindings.value, [key]: Array.from(set) }
}

function filteredClientsForTask(taskId: number): AdminClient[] {
  const s = getNodeSearch(taskId).trim().toLowerCase()
  const list = selectableVisibleClients(taskId)
  if (!s)
    return list
  return list.filter(c =>
    (c.name || '').toLowerCase().includes(s)
    || c.uuid.toLowerCase().includes(s)
    || (c.group || '').toLowerCase().includes(s)
    || (c.region || '').toLowerCase().includes(s),
  )
}

// ---------- 三网 ----------
const multiOptions = computed(() => {
  return sortedTasks.value.map(t => ({
    label: t.name || `任务 #${t.id}`,
    value: t.id,
  }))
})

function patchMultiTask(slot: number, value: number | null) {
  const idxs = [...draftMultiTaskIds.value]
  // 长度补齐
  while (idxs.length < HOMEPAGE_MULTI_PING_TASK_COUNT)
    idxs.push(0)
  const v = value ?? 0
  // 防止重复
  for (let i = 0; i < HOMEPAGE_MULTI_PING_TASK_COUNT; i++) {
    if (i !== slot && idxs[i] === v && v !== 0)
      idxs[i] = 0
  }
  idxs[slot] = v
  draftMultiTaskIds.value = idxs
}

const draftMultiInvalid = computed(() => {
  if (!draftEnableMulti.value)
    return false
  const valid = draftMultiTaskIds.value.filter(id => id != null && id > 0)
  if (valid.length !== HOMEPAGE_MULTI_PING_TASK_COUNT)
    return true
  return new Set(valid).size !== valid.length
})

// ---------- 统计 ----------
const assignedNodeCount = computed(() => assignedTaskByNode.value.size)
const totalClientCount = computed(() => allClients.value.length)

// ---------- dirty / 保存 ----------
const saving = ref(false)
const saveError = ref<string | null>(null)
const savedOk = ref(false)

const dirty = computed(() => {
  if (!initialized.value)
    return false
  if (draftEnableMulti.value !== appStore.enableHomepageMultiPing)
    return true
  if (JSON.stringify(draftMultiTaskIds.value.filter(v => v > 0).sort())
    !== JSON.stringify(appStore.homepageMultiPingTaskIds.slice().sort())) {
    return true
  }
  // bindings 比较（normalize 后再比）
  const a = JSON.stringify(normalizeHomepagePingTaskBindings(draftBindings.value))
  const b = JSON.stringify(normalizeHomepagePingTaskBindings(appStore.homepagePingBindings))
  return a !== b
})

async function save() {
  if (!initialized.value || saving.value)
    return
  if (draftMultiInvalid.value) {
    saveError.value = '请选满 3 个不同的 Ping 任务后再保存。'
    return
  }
  saving.value = true
  saveError.value = null
  savedOk.value = false
  try {
    const normalizedBindings = normalizeHomepagePingTaskBindings(draftBindings.value)
    const multiIds = draftMultiTaskIds.value.filter(v => v > 0)
    const nextSettings: Record<string, unknown> = {
      ...appStore.publicSettings?.theme_settings,
      homepagePingBindings: JSON.stringify(normalizedBindings),
      enableHomepageMultiPing: draftEnableMulti.value,
      homepageMultiPingTaskIds: JSON.stringify(multiIds),
    }
    await api.saveThemeSettings(nextSettings)
    // 本地立即 patch，让现有 computed 重算
    if (appStore.publicSettings) {
      appStore.publicSettings = {
        ...appStore.publicSettings,
        theme_settings: nextSettings,
      }
    }
    // 主动刷新首页 ping overview
    void pingStore.doRefresh()
    savedOk.value = true
    draftBindings.value = JSON.parse(JSON.stringify(normalizedBindings)) as DraftBindings
    draftMultiTaskIds.value = [...multiIds]
    if (draftEnableMulti.value) {
      while (draftMultiTaskIds.value.length < HOMEPAGE_MULTI_PING_TASK_COUNT)
        draftMultiTaskIds.value.push(0)
    }
    setTimeout(() => {
      savedOk.value = false
    }, 2500)
  }
  catch (e) {
    saveError.value = e instanceof Error ? e.message : String(e)
  }
  finally {
    saving.value = false
  }
}

const goHome = () => router.push('/')
</script>

<template>
  <div class="theme-manage mx-auto px-4 py-6 max-w-[1100px]">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-lg font-semibold">
        主题设置 · 首页 Ping 任务绑定
      </h1>
      <div class="flex gap-2 items-center">
        <NButton quaternary size="small" @click="goHome">
          返回首页
        </NButton>
        <NButton
          type="primary"
          size="small"
          :loading="saving"
          :disabled="!initialized || (!dirty && !savedOk)"
          @click="save"
        >
          {{ savedOk ? '已保存' : dirty ? '保存' : '无变更' }}
        </NButton>
      </div>
    </div>

    <p class="text-[12px] text-[--n-text-color-3] leading-relaxed mb-6">
      可视化配置首页延迟展示。开启三网模式后所有大卡片和小卡片统一显示三项全局任务；
      关闭三网模式时下方单线路绑定继续生效（同一线路内的节点被同一任务绑定，不同任务之间节点互斥）。
      若当前还没有可用任务，请先前往后台 Ping 管理创建任务。
    </p>

    <NAlert v-if="tasksLoadError" type="error" class="mb-4" show-icon>
      加载 Ping 任务失败：{{ tasksLoadError }}
    </NAlert>
    <div v-if="tasksLoadError" class="mb-4 -mt-2">
      <NButton size="small" @click="loadTasks">
        重试
      </NButton>
    </div>

    <NAlert v-if="saveError" type="error" class="mb-4" show-icon>
      保存失败：{{ saveError }}
    </NAlert>

    <NAlert v-if="savedOk" type="success" class="mb-4" show-icon>
      已保存到 Komari 后台主题设置。
    </NAlert>

    <!-- 三网模式 -->
    <section class="panel">
      <header class="panel-head">
        <h2 class="panel-title">
          三网模式
        </h2>
        <NSwitch v-model:value="draftEnableMulti" :disabled="!initialized || tasksLoading" />
      </header>
      <p class="panel-desc">
        开启后，大卡片和小卡片统一展示以下三项全局 Ping 任务；不需要再逐节点绑定。
      </p>

      <div v-if="draftEnableMulti" class="multi-grid mt-4">
        <div v-for="slot in HOMEPAGE_MULTI_PING_TASK_COUNT" :key="slot">
          <label class="multi-grid-label">
            线路 {{ slot }}
          </label>
          <NSelect
            :value="draftMultiTaskIds[slot - 1] || null"
            :options="multiOptions"
            placeholder="选择 Ping 任务"
            clearable
            :disabled="tasksLoading || allTasks.length === 0"
            @update:value="v => patchMultiTask(slot - 1, v)"
          />
        </div>
      </div>
      <p
        class="text-[11px] mt-3"
        :class="draftMultiInvalid ? 'text-[--n-error-color]' : 'text-[--n-text-color-3]'"
      >
        {{ draftMultiInvalid
          ? '请选满 3 个不同的 Ping 任务后再保存。'
          : '三项任务按此处的顺序展示；某项任务节点无样本时仍保留该行并显示“无样本”。' }}
      </p>
    </section>

    <!-- 单线路绑定 -->
    <section class="panel mt-6">
      <header class="panel-head">
        <h2 class="panel-title">
          单线路绑定
        </h2>
        <NTag size="small" :type="dirty ? 'warning' : 'default'">
          已绑定 {{ assignedNodeCount }} / {{ totalClientCount }}
        </NTag>
      </header>
      <p v-if="draftEnableMulti" class="panel-desc">
        三网模式开启时大/小卡片使用上方三项任务；此处单线路绑定仍用于未启用三网的视图。
      </p>

      <NInput
        v-model:value="taskSearch"
        placeholder="搜索任务名称 / ID / 类型"
        class="mt-4"
        clearable
      />

      <div v-if="tasksLoading || clientsLoading" class="py-10 flex justify-center">
        <NSpin size="small" />
      </div>

      <div v-else-if="allTasks.length === 0 && !tasksLoadError" class="py-8">
        <NEmpty description="当前还没有可用于首页展示的 Ping 任务" />
      </div>

      <NCollapse v-else-if="filteredTasks.length" class="mt-4">
        <NCollapseItem
          v-for="task in filteredTasks"
          :key="task.id"
          :name="String(task.id)"
        >
          <template #header>
            <div class="flex flex-wrap gap-2 items-center">
              <span class="text-[14px] font-medium">
                {{ task.name || `任务 #${task.id}` }}
              </span>
              <NTag size="tiny" :bordered="false">
                ID {{ task.id }}
              </NTag>
              <NTag v-if="task.type" size="tiny" :bordered="false">
                {{ task.type }}
              </NTag>
              <NTag v-if="task.interval" size="tiny" :bordered="false">
                {{ task.interval }}s
              </NTag>
              <NTag size="tiny" :type="getAssigned(task.id).length > 0 ? 'success' : 'default'">
                已绑定 {{ getAssigned(task.id).length }}
              </NTag>
            </div>
          </template>

          <div class="px-1 py-2">
            <NInput
              :value="getNodeSearch(task.id)"
              placeholder="搜索节点名称 / UUID / 分组 / 地区"
              clearable
              size="small"
              class="mb-3"
              @update:value="v => setNodeSearch(task.id, v)"
            />
            <div class="mb-3 flex gap-2 items-center">
              <NButton
                size="tiny"
                :disabled="filteredClientsForTask(task.id).length === 0"
                @click="selectAllVisible(task.id)"
              >
                全选可用
              </NButton>
              <NButton
                size="tiny"
                quaternary
                :disabled="getAssigned(task.id).length === 0"
                @click="clearAssignForTask(task.id)"
              >
                清空节点
              </NButton>
            </div>
            <div class="client-grid">
              <label
                v-for="client in filteredClientsForTask(task.id)"
                :key="client.uuid"
                class="client-item"
              >
                <NCheckbox
                  :checked="isAssigned(task.id, client.uuid)"
                  @update:checked="v => toggleAssign(task.id, client.uuid, v)"
                />
                <span class="client-name" :title="client.name">{{ client.name }}</span>
                <span v-if="client.group" class="client-sub">{{ client.group }}</span>
              </label>
            </div>
            <NEmpty v-if="filteredClientsForTask(task.id).length === 0" size="small" description="无匹配节点" class="mt-2" />
          </div>
        </NCollapseItem>
      </NCollapse>
    </section>
  </div>
</template>

<style scoped lang="scss">
.panel {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 16px;
  background: color-mix(in srgb, var(--n-color) 80%, transparent);
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 15px;
  font-weight: 600;
}

.panel-desc {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-top: 4px;
  line-height: 1.5;
}

.multi-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.multi-grid-label {
  display: block;
  font-size: 12px;
  margin-bottom: 6px;
}

.client-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 4px;
}

.client-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 120ms ease;
}

.client-item:hover {
  background: color-mix(in srgb, var(--n-color-hover) 60%, transparent);
}

.client-name {
  font-size: 12px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-sub {
  font-size: 10px;
  color: var(--n-text-color-3);
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--n-border-color) 50%, transparent);
}
</style>
