<script setup lang="ts">
import { ref, nextTick, watch } from 'vue';

const props = defineProps<{
  show: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', value: string): void;
}>();

const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

watch(() => props.show, (newVal) => {
  if (newVal) {
    inputValue.value = props.initialValue || '';
    nextTick(() => {
      inputRef.value?.focus();
      inputRef.value?.select();
    });
  }
});

function onConfirm() {
  if (inputValue.value.trim()) {
    emit('confirm', inputValue.value.trim());
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
