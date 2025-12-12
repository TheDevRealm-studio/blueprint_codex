<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { storage } from '../../services/storage';

const props = defineProps<{
  src: string;
  kind: 'image' | 'video';
  label?: string;
}>();

const resolvedUrl = ref<string>('');
const loading = ref(false);
const error = ref<string | null>(null);

async function loadMedia() {
  if (!props.src) return;

  // If it's already a blob URL or http URL, just use it
  if (props.src.startsWith('blob:') || props.src.startsWith('http') || props.src.startsWith('data:')) {
    resolvedUrl.value = props.src;
    return;
  }

  // Assume it's a DB ID
  loading.value = true;
  error.value = null;
  try {
    const blob = await storage.loadAsset(props.src);
    if (blob) {
      if (resolvedUrl.value && resolvedUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(resolvedUrl.value);
      }
      resolvedUrl.value = URL.createObjectURL(blob);
    } else {
      error.value = 'File not found';
    }
    
    // Try to load metadata for name if not provided
    if (!props.label) {
        // We can't easily get metadata here without a new storage method or just listing all.
        // But we can try to list and find? No that's slow.
        // For now, we rely on the parent passing the label, or we accept that we don't show it here.
        // But wait, the user wants "everything gets updated as referenced".
        // If the parent block has a label, it uses that.
        // If we want the label to be dynamic based on the asset name, the parent block should probably NOT store the label,
        // or we should fetch it here.
        // Let's add getAssetMetadata to storage?
    }

  } catch (e) {
    error.value = 'Error loading file';
    console.error(e);
  } finally {
    loading.value = false;
  }
}

watch(() => props.src, loadMedia);

onMounted(loadMedia);

onUnmounted(() => {
  if (resolvedUrl.value && resolvedUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(resolvedUrl.value);
  }
});
</script>

<template>
  <div class="w-full h-full flex flex-col">
    <div class="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
      <div v-if="loading" class="text-gray-500 text-xs">Loading...</div>
      <div v-else-if="error" class="text-red-500 text-xs">{{ error }}</div>

      <template v-else-if="resolvedUrl">
        <img
          v-if="kind === 'image'"
          :src="resolvedUrl"
          class="max-w-full max-h-full object-contain"
          draggable="false"
        />
        <video
          v-else
          :src="resolvedUrl"
          controls
          class="w-full h-full"
        ></video>
      </template>
      <div v-else class="text-gray-600 text-xs">No media source</div>
    </div>

    <div v-if="label !== undefined" class="px-2 py-1 bg-ue-panel border-t border-gray-700">
      <slot name="label"></slot>
    </div>
  </div>
</template>
