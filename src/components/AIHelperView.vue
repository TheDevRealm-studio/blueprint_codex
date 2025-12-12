<script setup lang="ts">
import { ref } from 'vue'
import { 
  Wand2, X, Copy, Loader, 
  ListCollapse, Sparkles, Expand, Minimize2, SpellCheck, List,
  Cpu, Code2, ShieldAlert 
} from 'lucide-vue-next'
import { useAI } from '@/services/ai'

const aiService = useAI()

const isOpen = ref(false)
const result = ref<string>('')
const error = ref<string>('')
const isLoading = ref(false)
const copied = ref(false)
const selectedAction = ref<string | null>(null)

interface AIAction {
  id: string
  label: string
  icon: any
  description: string
}

const actions: AIAction[] = [
  { id: 'summarize', label: 'Summarize', icon: ListCollapse, description: 'Create a concise summary' },
  { id: 'improve', label: 'Improve', icon: Sparkles, description: 'Enhance clarity and quality' },
  { id: 'expand', label: 'Expand', icon: Expand, description: 'Add more details' },
  { id: 'simplify', label: 'Simplify', icon: Minimize2, description: 'Make it easier to understand' },
  { id: 'grammar', label: 'Grammar', icon: SpellCheck, description: 'Fix grammar and spelling' },
  { id: 'bullets', label: 'Bullets', icon: List, description: 'Convert to bullet points' },
  { id: 'beautify', label: 'Beautify', icon: Sparkles, description: '✨ Add emojis & pretty markdown' },
  { id: 'blueprint', label: 'Explain BP', icon: Cpu, description: 'Decode Blueprint logic' },
  { id: 'cpp', label: 'Gen C++', icon: Code2, description: 'Create UE5 C++ class' },
  { id: 'audit', label: 'Audit Names', icon: ShieldAlert, description: 'Check naming conventions' },
]

const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  apply: [text: string]
}>()

const close = () => {
  isOpen.value = false
  result.value = ''
  error.value = ''
  isLoading.value = false
  selectedAction.value = null
}

const executeAction = async (actionId: string) => {
  if (!props.content || !aiService.isEnabled()) return
  
  isLoading.value = true
  error.value = ''
  result.value = ''
  selectedAction.value = actionId

  try {
    const actionMap: Record<string, () => Promise<string>> = {
      summarize: () => aiService.summarize(props.content),
      improve: () => aiService.improve(props.content),
      expand: () => aiService.expand(props.content),
      simplify: () => aiService.simplify(props.content),
      grammar: () => aiService.fixGrammar(props.content),
      bullets: () => aiService.generateBulletPoints(props.content),
      beautify: () => aiService.beautifyMarkdown(props.content),
      blueprint: () => aiService.explainBlueprint(props.content),
      cpp: () => aiService.generateCppClass(props.content),
      audit: () => aiService.auditNamingConventions(props.content),
    }

    const response = await actionMap[actionId]?.()
    result.value = response || ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to process request'
  } finally {
    isLoading.value = false
  }
}

const applyResult = () => {
  if (result.value) {
    emit('apply', result.value)
    close()
  }
}

const copyResult = () => {
  if (result.value) {
    navigator.clipboard.writeText(result.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>

<template>
  <div class="nodrag" @mousedown.stop @click.stop>
    <!-- Trigger Button -->
    <button
      v-if="!isOpen"
      @click.stop="isOpen = !aiService.isEnabled() ? false : true"
      @mousedown.stop
      :disabled="!aiService.isEnabled()"
      class="flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all"
      :class="aiService.isEnabled()
        ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-600/30 hover:border-purple-600/50'
        : 'bg-gray-900/30 text-gray-500 border border-gray-700/30 cursor-not-allowed'"
      title="AI Helper (requires OpenAI API key)"
    >
      <Wand2 class="w-3.5 h-3.5" />
      <span>AI</span>
    </button>

    <!-- AI Helper Modal -->
    <div v-if="isOpen && aiService.isEnabled()" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div class="bg-cyber-panel border border-cyber-green/30 rounded-lg w-full max-w-2xl shadow-[0_0_30px_rgba(0,255,157,0.2)] overflow-hidden flex flex-col max-h-[90vh]">
        <!-- Header -->
        <div class="bg-cyber-header px-4 py-3 border-b border-cyber-green/20 flex justify-between items-center">
          <h3 class="text-cyber-green font-bold tracking-wider flex items-center gap-2">
            <Wand2 class="w-4 h-4" />
            AI ASSISTANT
          </h3>
          <button @click.stop="close" @mousedown.stop class="text-cyber-text hover:text-cyber-green transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- Loading State -->
          <div v-if="isLoading" class="p-6 flex flex-col items-center justify-center gap-3 h-[200px]">
            <Loader class="w-8 h-8 text-cyber-green animate-spin" />
            <p class="text-xs text-cyber-text/60">Processing with AI...</p>
          </div>

          <!-- Error State -->
          <div v-else-if="error" class="p-6">
            <div class="bg-red-900/30 border border-red-600/50 rounded p-4 text-xs text-red-300">
              {{ error }}
            </div>
          </div>

          <!-- Actions Grid (when idle + no result) -->
          <div v-else-if="!result" class="p-6">
            <p class="text-xs text-cyber-text/60 mb-4">Select an action to perform:</p>
            <div class="grid grid-cols-2 gap-3">
              <button
                v-for="action in actions"
                :key="action.id"
                @click.stop="executeAction(action.id)"
                @mousedown.stop
                :disabled="isLoading"
                class="p-3 rounded border border-cyber-green/20 hover:border-cyber-green/50 hover:bg-cyber-green/5 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div class="text-lg mb-1">
                  <component :is="action.icon" class="w-5 h-5 text-cyber-green" />
                </div>
                <div class="text-xs font-bold text-cyber-green">{{ action.label }}</div>
                <div class="text-[10px] text-cyber-text/50 mt-1">{{ action.description }}</div>
              </button>
            </div>
          </div>

          <!-- Result Display -->
          <div v-else class="p-6">
            <p class="text-xs text-cyber-text/60 mb-3">AI Result:</p>
            <div class="bg-cyber-dark/50 border border-cyber-green/20 rounded p-4 text-xs text-cyber-text font-mono max-h-[300px] overflow-y-auto custom-scrollbar whitespace-pre-wrap">
              {{ result }}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-cyber-dark/30 px-4 py-3 border-t border-cyber-green/10 flex justify-between gap-2">
          <button
            v-if="result && !isLoading"
            @click.stop="copyResult"
            @mousedown.stop
            class="flex items-center gap-2 px-3 py-1.5 rounded text-xs bg-cyber-dark/50 border border-cyber-green/20 hover:border-cyber-green/50 text-cyber-text hover:text-cyber-green transition-colors"
          >
            <Copy class="w-3.5 h-3.5" />
            {{ copied ? 'COPIED!' : 'COPY' }}
          </button>
          
          <div class="flex gap-2 ml-auto">
            <button
              v-if="result && !isLoading"
              @click.stop="result = ''; selectedAction = null"
              @mousedown.stop
              class="px-3 py-1.5 rounded text-xs bg-cyber-dark/50 border border-cyber-green/20 hover:border-cyber-green/50 text-cyber-text hover:text-cyber-green transition-colors"
            >
              BACK
            </button>
            <button
              v-if="result && !isLoading"
              @click.stop="applyResult"
              @mousedown.stop
              class="px-3 py-1.5 rounded text-xs bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 transition-all hover:shadow-[0_0_10px_rgba(0,255,157,0.3)]"
            >
              APPLY
            </button>
            <button
              v-if="!result"
              @click.stop="close"
              @mousedown.stop
              class="px-3 py-1.5 rounded text-xs text-cyber-text hover:text-cyber-green transition-colors"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
