<script setup lang="ts">
import { ref } from 'vue'
import { Wand2, X, Copy, Loader } from 'lucide-vue-next'
import { useAI } from '@/services/ai'

const aiService = useAI()

const isOpen = ref(false)
const result = ref<string>('')
const error = ref<string>('')
const isLoading = ref(false)
const copied = ref(false)
const showCustomInput = ref(false)
const customPrompt = ref<string>('')

interface AIAction {
  id: string
  label: string
  description: string
}

const actions: AIAction[] = [
  { id: 'summarize', label: 'Summarize', description: 'Concise summary' },
  { id: 'improve', label: 'Improve', description: 'Enhance quality' },
  { id: 'expand', label: 'Expand', description: 'Add details' },
  { id: 'custom', label: 'Custom Prompt', description: 'Write your own' },
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
  showCustomInput.value = false
  customPrompt.value = ''
}

const executeAction = async (actionId: string) => {
  if (!props.content || !aiService.isEnabled()) return
  
  isLoading.value = true
  error.value = ''
  result.value = ''

  try {
    if (actionId === 'custom') {
      if (!customPrompt.value) {
        error.value = 'Please enter a prompt'
        isLoading.value = false
        return
      }
      result.value = await aiService.executeCustomPrompt(props.content, customPrompt.value)
      showCustomInput.value = false
    } else {
      const actionMap: Record<string, () => Promise<string>> = {
        summarize: () => aiService.summarize(props.content),
        improve: () => aiService.improve(props.content),
        expand: () => aiService.expand(props.content),
      }
      result.value = await actionMap[actionId]?.() || ''
    }
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
      class="flex items-center gap-2 px-2 py-1 rounded text-xs transition-all nodrag"
      :class="aiService.isEnabled()
        ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-600/30 hover:border-purple-600/50'
        : 'bg-gray-900/30 text-gray-500 border border-gray-700/30 cursor-not-allowed'"
      title="AI Helper"
    >
      <Wand2 class="w-3 h-3" />
      AI
    </button>

    <!-- AI Helper Modal -->
    <div v-if="isOpen && aiService.isEnabled()" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div class="bg-cyber-panel border border-cyber-green/30 rounded-lg w-full max-w-xl shadow-[0_0_30px_rgba(0,255,157,0.2)] overflow-hidden flex flex-col max-h-[80vh]">
        <!-- Header -->
        <div class="bg-cyber-header px-4 py-3 border-b border-cyber-green/20 flex justify-between items-center">
          <h3 class="text-cyber-green font-bold tracking-wider text-sm">NODE AI ASSISTANT</h3>
          <button @click.stop="close" @mousedown.stop class="text-cyber-text hover:text-cyber-green transition-colors">
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <!-- Actions Grid -->
          <div v-if="!result && !showCustomInput" class="p-4 space-y-2">
            <p class="text-xs text-cyber-text/60 mb-3">Quick Actions:</p>
            <button
              v-for="action in actions"
              :key="action.id"
              @click.stop="action.id === 'custom' ? showCustomInput = true : executeAction(action.id)"
              @mousedown.stop
              :disabled="isLoading"
              class="w-full p-2 rounded border border-cyber-green/20 hover:border-cyber-green/50 hover:bg-cyber-green/5 transition-all text-left text-xs disabled:opacity-50"
            >
              <div class="font-bold text-cyber-green">{{ action.label }}</div>
              <div class="text-[10px] text-cyber-text/50">{{ action.description }}</div>
            </button>
          </div>

          <!-- Custom Prompt Input -->
          <div v-if="showCustomInput && !result" class="p-4 space-y-3">
            <p class="text-xs text-cyber-text/60">Enter your prompt:</p>
            <textarea
              v-model="customPrompt"
              placeholder="e.g., Make this more technical..."
              class="w-full h-24 bg-cyber-dark/50 border border-cyber-green/20 rounded px-2 py-1 text-xs text-cyber-text placeholder-cyber-text/30 focus:border-cyber-green/50 focus:outline-none"
            ></textarea>
            <div class="flex gap-2">
              <button
                @click.stop="executeAction('custom')"
                @mousedown.stop
                class="flex-1 px-2 py-1 bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 rounded text-xs"
              >
                GENERATE
              </button>
              <button
                @click.stop="showCustomInput = false"
                @mousedown.stop
                class="px-2 py-1 bg-cyber-dark/50 border border-cyber-green/20 rounded text-xs text-cyber-text"
              >
                CANCEL
              </button>
            </div>
          </div>

          <!-- Result Display -->
          <div v-if="result && !isLoading" class="p-4">
            <p class="text-xs text-cyber-text/60 mb-2">Result:</p>
            <div class="bg-cyber-dark/50 border border-cyber-green/20 rounded p-3 text-xs text-cyber-text font-mono max-h-64 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
              {{ result }}
            </div>
          </div>

          <!-- Loading -->
          <div v-if="isLoading" class="p-6 flex flex-col items-center justify-center gap-3 h-32">
            <Loader class="w-6 h-6 text-cyber-green animate-spin" />
            <p class="text-xs text-cyber-text/60">Processing...</p>
          </div>

          <!-- Error -->
          <div v-if="error" class="p-4">
            <div class="bg-red-900/30 border border-red-600/50 rounded p-3 text-xs text-red-300">
              {{ error }}
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="bg-cyber-dark/30 px-4 py-3 border-t border-cyber-green/10 flex justify-between gap-2">
          <button
            v-if="result"
            @click.stop="copyResult"
            @mousedown.stop
            class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-cyber-dark/50 border border-cyber-green/20 hover:border-cyber-green/50 text-cyber-text"
          >
            <Copy class="w-3 h-3" />
            {{ copied ? 'COPIED!' : 'COPY' }}
          </button>
          
          <div class="flex gap-2 ml-auto">
            <button
              v-if="result"
              @click.stop="result = ''"
              @mousedown.stop
              class="px-2 py-1 rounded text-xs bg-cyber-dark/50 border border-cyber-green/20 hover:border-cyber-green/50 text-cyber-text"
            >
              BACK
            </button>
            <button
              v-if="result"
              @click.stop="applyResult"
              @mousedown.stop
              class="px-2 py-1 rounded text-xs bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30"
            >
              APPLY
            </button>
            <button
              v-if="!result"
              @click.stop="close"
              @mousedown.stop
              class="px-2 py-1 rounded text-xs text-cyber-text hover:text-cyber-green"
            >
              CLOSE
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
