<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';
import { templates } from '../config/templates';

const props = defineProps<{
  show: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  showTemplates?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', value: string, templateId?: string): void;
}>();

const inputValue = ref('');
const selectedTemplateId = ref('blank');
const inputRef = ref<HTMLInputElement | null>(null);

watch(() => props.show, (newVal) => {
  if (newVal) {
    inputValue.value = props.initialValue || '';
    selectedTemplateId.value = 'blank';
    nextTick(() => {
      inputRef.value?.focus();
      inputRef.value?.select();
    });
  }
});

function onConfirm() {
  if (inputValue.value.trim()) {
    emit('confirm', inputValue.value.trim(), props.showTemplates ? selectedTemplateId.value : undefined);
    emit('close');
  }
}

function onCancel() {
  emit('close');
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="onCancel">
    <div class="bg-ue-panel border border-ue-accent shadow-2xl rounded-lg w-96 p-4 flex flex-col gap-4">
      <h3 class="text-white font-bold text-sm uppercase tracking-wider">{{ title }}</h3>

      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        :placeholder="placeholder"
        class="bg-black/30 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-ue-accent focus:outline-none"
        @keyup.enter="onConfirm"
        @keyup.esc="onCancel"
      />

      <div v-if="showTemplates" class="flex flex-col gap-1">
        <label class="text-xs text-gray-400 font-bold uppercase">Template</label>
        <select
          v-model="selectedTemplateId"
          class="bg-black/30 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:border-ue-accent focus:outline-none appearance-none cursor-pointer"
        >
          <option v-for="t in templates" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
        <div class="text-[10px] text-gray-500 italic">
          {{ templates.find(t => t.id === selectedTemplateId)?.description }}
        </div>
      </div>

      <div class="flex justify-end gap-2">
        <button
          @click="onCancel"
          class="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          @click="onConfirm"
          class="px-3 py-1.5 text-xs bg-ue-accent text-white font-bold rounded hover:bg-ue-accent/80 transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
</template>
