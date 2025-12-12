<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { open } from '@tauri-apps/api/dialog';
import { storage } from '../services/storage';
import { aiService } from '../services/ai';
import { TauriStorage } from '../services/storage/TauriStorage';
import { X, Eye, EyeOff } from 'lucide-vue-next';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits(['close']);

const currentPath = ref('');
const isLoading = ref(false);
const apiKey = ref('');
const aiModel = ref<string>('gpt-5.2');
const showApiKey = ref(false);
const aiInitialized = ref(false);
const testingAPI = ref(false);
const testMessage = ref('');
const availableModels = ref<any[]>([]);
const modelsByType = ref<Record<string, any[]>>({});
const loadingModels = ref(false);

onMounted(async () => {
  // Load library path
  const adapter = storage.currentAdapter;
  if (adapter instanceof TauriStorage) {
    currentPath.value = await adapter.getLibraryPath();
  }

  // Load AI config from localStorage
  const savedConfig = localStorage.getItem('codex-ai-config');
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      apiKey.value = config.apiKey || '';
      aiModel.value = config.model || 'gpt-5.2';
      aiInitialized.value = !!apiKey.value;
    } catch (e) {
      console.error('Failed to load AI config', e);
    }
  }
});

async function selectFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select Library Location'
    });

    if (selected && typeof selected === 'string') {
      const adapter = storage.currentAdapter;
      if (adapter instanceof TauriStorage) {
        isLoading.value = true;
        await adapter.setLibraryPath(selected);
        currentPath.value = selected;
        // Reload window to refresh everything cleanly
        window.location.reload();
      }
    }
  } catch (e) {
    console.error('Failed to select folder', e);
  } finally {
    isLoading.value = false;
  }
}

async function saveAIConfig() {
  if (!apiKey.value.trim()) {
    testMessage.value = 'API key cannot be empty';
    return;
  }

  testingAPI.value = true;
  testMessage.value = 'Initializing AI service...';

  try {
    const success = await aiService.init(apiKey.value, aiModel.value);
    
    if (success) {
      localStorage.setItem('codex-ai-config', JSON.stringify({
        apiKey: apiKey.value,
        model: aiModel.value
      }));
      aiInitialized.value = true;
      
      // Load available models after successful initialization
      await loadAvailableModels();
      
      testMessage.value = '✓ AI service initialized successfully!';
      setTimeout(() => {
        testMessage.value = '';
      }, 3000);
    } else {
      testMessage.value = '✗ Failed to initialize AI service';
    }
  } catch (e) {
    testMessage.value = `✗ Error: ${(e as any).message}`;
  } finally {
    testingAPI.value = false;
  }
}

async function loadAvailableModels() {
  if (!aiService.isEnabled()) return;
  
  loadingModels.value = true;
  try {
    const models = aiService.getAvailableModels();
    if (models.length === 0) {
      await aiService.fetchAvailableModels();
      const newModels = aiService.getAvailableModels();
      availableModels.value = newModels;
      modelsByType.value = aiService.getModelsByType();
    } else {
      availableModels.value = models;
      modelsByType.value = aiService.getModelsByType();
    }
  } catch (e) {
    console.error('Failed to load models', e);
  } finally {
    loadingModels.value = false;
  }
}

function clearAIConfig() {
  if (confirm('Clear OpenAI API key?')) {
    apiKey.value = '';
    localStorage.removeItem('codex-ai-config');
    aiInitialized.value = false;
    testMessage.value = '';
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
    <div class="bg-cyber-panel border border-cyber-green/30 rounded-lg w-[500px] shadow-[0_0_30px_rgba(0,255,157,0.2)] overflow-hidden max-h-[80vh] overflow-y-auto">
      <div class="bg-cyber-header px-4 py-3 border-b border-cyber-green/20 flex justify-between items-center sticky top-0 z-10">
        <h3 class="text-cyber-green font-bold tracking-wider">SETTINGS</h3>
        <button @click="$emit('close')" class="text-cyber-text hover:text-cyber-green transition-colors">
            <X class="w-4 h-4" />
        </button>
      </div>
      
      <div class="p-6 space-y-6">
        <!-- Library Location Section -->
        <div>
          <h4 class="text-xs text-cyber-green mb-3 uppercase tracking-wider font-bold">📁 Library Location</h4>
          <div class="flex gap-2">
            <div class="flex-1 bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text font-mono truncate" :title="currentPath">
              {{ currentPath || 'Loading...' }}
            </div>
            <button 
              @click="selectFolder"
              class="bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 rounded px-3 py-1 text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,157,0.3)]"
              :disabled="isLoading"
            >
              {{ isLoading ? '...' : 'CHANGE' }}
            </button>
          </div>
          <p class="text-[10px] text-cyber-text/40 mt-2">
            Select a folder to store your projects and assets. Keep documentation inside your Unreal Engine project.
          </p>
        </div>

        <div class="border-t border-cyber-green/10"></div>

        <!-- AI Settings Section -->
        <div>
          <h4 class="text-xs text-cyber-green mb-3 uppercase tracking-wider font-bold">🤖 OpenAI Integration</h4>
          
          <!-- Status -->
          <div class="mb-4 p-3 rounded border" :class="aiInitialized ? 'bg-green-900/20 border-green-600/50 text-green-300' : 'bg-yellow-900/20 border-yellow-600/50 text-yellow-300'">
            <p class="text-xs font-mono">
              {{ aiInitialized ? '✓ AI Service Active' : '○ AI Service Inactive' }}
            </p>
          </div>

          <!-- API Key Input -->
          <div class="mb-4">
            <label class="block text-xs text-cyber-text/70 mb-1 uppercase tracking-wider">API Key</label>
            <div class="flex gap-2">
              <input
                :type="showApiKey ? 'text' : 'password'"
                v-model="apiKey"
                placeholder="sk-..."
                class="flex-1 bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text placeholder-cyber-text/30 focus:border-cyber-green/50 focus:outline-none transition-colors"
              />
              <button
                @click="showApiKey = !showApiKey"
                class="bg-cyber-dark/50 border border-cyber-green/20 hover:border-cyber-green/50 rounded px-2 py-2 text-cyber-text/50 hover:text-cyber-green transition-colors"
              >
                <Eye v-if="!showApiKey" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
            <p class="text-[10px] text-cyber-text/40 mt-1">
              Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" class="text-cyber-green hover:underline">OpenAI Platform</a>
            </p>
          </div>

          <!-- Model Selection -->
          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs text-cyber-text/70 uppercase tracking-wider">Model</label>
              <button
                v-if="aiInitialized && !loadingModels"
                @click="loadAvailableModels"
                class="text-[10px] text-cyber-green hover:text-cyber-orange transition-colors underline"
              >
                Refresh Models
              </button>
              <span v-else-if="loadingModels" class="text-[10px] text-cyber-green animate-pulse">Loading...</span>
            </div>
            
            <!-- Text Input for Manual Entry -->
            <input 
              v-model="aiModel" 
              type="text" 
              placeholder="Enter model ID (e.g. gpt-5.2)"
              class="w-full bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text focus:border-cyber-green/50 focus:outline-none transition-colors mb-2"
            />

            <!-- If we have grouped models, show them by category -->
            <div v-if="Object.keys(modelsByType).length > 0" class="space-y-2">
              <select
                @change="(e: Event) => aiModel = (e.target as HTMLSelectElement).value"
                class="w-full bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text focus:border-cyber-green/50 focus:outline-none transition-colors"
              >
                <option value="" disabled selected>Select from available models...</option>
                <template v-for="(group, category) in modelsByType" :key="category">
                  <optgroup v-if="group.length > 0" :label="category">
                    <option v-for="model in group" :key="model.id" :value="model.id">
                      {{ model.id }}
                    </option>
                  </optgroup>
                </template>
              </select>
            </div>
            
            <!-- Fallback to static options if no dynamic models loaded -->
            <select
              v-else
              @change="(e: Event) => aiModel = (e.target as HTMLSelectElement).value"
              class="w-full bg-cyber-dark/50 border border-cyber-green/20 rounded px-3 py-2 text-xs text-cyber-text focus:border-cyber-green/50 focus:outline-none transition-colors"
            >
              <option value="" disabled selected>Select from common models...</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4">gpt-4</option>
              <option value="gpt-4-turbo">gpt-4-turbo</option>
            </select>
            
            <p class="text-[10px] text-cyber-text/40 mt-1">
              Type a model ID manually or select from the list. Default is gpt-5.2.
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-2 mb-4">
            <button
              @click="saveAIConfig"
              :disabled="testingAPI || !apiKey.trim()"
              class="flex-1 bg-cyber-green/10 hover:bg-cyber-green/20 text-cyber-green border border-cyber-green/30 rounded px-3 py-2 text-xs transition-all hover:shadow-[0_0_10px_rgba(0,255,157,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {{ testingAPI ? 'INITIALIZING...' : 'SAVE & TEST' }}
            </button>
            <button
              v-if="aiInitialized"
              @click="clearAIConfig"
              class="bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-600/30 rounded px-3 py-2 text-xs transition-all"
            >
              CLEAR
            </button>
          </div>

          <!-- Test Message -->
          <div v-if="testMessage" class="p-2 rounded text-xs" :class="testMessage.startsWith('✓') ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'">
            {{ testMessage }}
          </div>
        </div>

        <div class="border-t border-cyber-green/10"></div>

        <!-- AI Features Info -->
        <div>
          <h4 class="text-xs text-cyber-green mb-2 uppercase tracking-wider font-bold">Available AI Features</h4>
          <ul class="text-[11px] text-cyber-text/60 space-y-1 font-mono">
            <li>✓ Summarize documents and content</li>
            <li>✓ Improve writing style and clarity</li>
            <li>✓ Generate documentation and guides</li>
            <li>✓ Explain complex concepts</li>
            <li>✓ Create bullet-point notes</li>
            <li>✓ Custom prompts for any task</li>
          </ul>
        </div>
      </div>

      <div class="bg-cyber-dark/30 px-4 py-3 border-t border-cyber-green/10 flex justify-end sticky bottom-0 z-10">
        <button 
          @click="$emit('close')"
          class="px-4 py-1.5 rounded text-xs text-cyber-text hover:text-cyber-green transition-colors"
        >
          CLOSE
        </button>
      </div>
    </div>
  </div>
</template>
