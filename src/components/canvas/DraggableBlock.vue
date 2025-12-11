<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update', id: string, changes: { x?: number; y?: number; width?: number; height?: number }): void;
  (e: 'select', id: string): void;
}>();

const isDragging = ref(false);
const isResizing = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const resizeStart = ref({ x: 0, y: 0, w: 0, h: 0 });
const activeHandle = ref<string | null>(null);

function onMouseDown(e: MouseEvent) {
  if (e.button !== 0) return; // Only left click
  e.stopPropagation();
  emit('select', props.id);
  
  isDragging.value = true;
  dragStart.value = { x: e.clientX, y: e.clientY };
  
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

function onResizeStart(e: MouseEvent, handle: string) {
  e.stopPropagation();
  e.preventDefault();
  
  isResizing.value = true;
  activeHandle.value = handle;
  resizeStart.value = { 
    x: e.clientX, 
    y: e.clientY, 
    w: props.width, 
    h: props.height 
  };
  
  window.addEventListener('mousemove', onResizeMove);
  window.addEventListener('mouseup', onResizeUp);
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  
  const dx = (e.clientX - dragStart.value.x); // / zoomLevel (handled by parent usually, but here we assume 1:1 for simplicity or parent handles scale)
  const dy = (e.clientY - dragStart.value.y);
  
  // We emit the delta, parent should handle zoom scaling if necessary
  // But for direct manipulation, we usually need to know the scale.
  // For now, let's assume the parent passes a scale prop or we just emit raw changes and let parent calculate.
  // Actually, simpler: emit the new absolute position.
  
  // Note: If the canvas is zoomed, dx/dy need to be divided by zoom.
  // We'll assume the parent wrapper handles the zoom context or we inject it.
  // For this iteration, let's assume scale=1 or we'll fix it in the CanvasView.
  
  emit('update', props.id, {
    x: props.x + dx,
    y: props.y + dy
  });
  
  dragStart.value = { x: e.clientX, y: e.clientY };
}

function onMouseUp() {
  isDragging.value = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}

function onResizeMove(e: MouseEvent) {
  if (!isResizing.value) return;
  
  const dx = e.clientX - resizeStart.value.x;
  const dy = e.clientY - resizeStart.value.y;
  
  let newW = resizeStart.value.w;
  let newH = resizeStart.value.h;
  
  if (activeHandle.value?.includes('e')) newW += dx;
  if (activeHandle.value?.includes('s')) newH += dy;
  
  // Minimum size
  newW = Math.max(100, newW);
  newH = Math.max(50, newH);
  
  emit('update', props.id, { width: newW, height: newH });
}

function onResizeUp() {
  isResizing.value = false;
  activeHandle.value = null;
  window.removeEventListener('mousemove', onResizeMove);
  window.removeEventListener('mouseup', onResizeUp);
}

const style = computed(() => ({
  transform: `translate(${props.x}px, ${props.y}px)`,
  width: `${props.width}px`,
  height: `${props.height}px`,
}));
</script>

<template>
  <div 
    class="absolute bg-brand-surface border border-gray-800 rounded-lg shadow-lg group transition-shadow duration-200 flex flex-col"
    :class="{ 
      'ring-2 ring-brand-green shadow-brand-green/20 z-10': selected, 
      'hover:border-gray-600 hover:shadow-xl': !selected 
    }"
    :style="style"
    @mousedown="onMouseDown"
  >
    <!-- Content Slot -->
    <div class="w-full h-full overflow-hidden rounded-lg">
      <slot></slot>
    </div>

    <!-- Resize Handles (only when selected or hovered) -->
    <div class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20" @mousedown="onResizeStart($event, 'se')">
       <div class="w-2 h-2 bg-gray-500 rounded-sm" :class="{ 'bg-brand-green': selected }"></div>
    </div>
    
    <div v-if="selected">
      <div class="resize-handle cursor-e-resize top-0 right-0 h-full w-1" @mousedown="onResizeStart($event, 'e')"></div>
      <div class="resize-handle cursor-s-resize bottom-0 left-0 w-full h-1" @mousedown="onResizeStart($event, 's')"></div>
    </div>
  </div>
</template>

<style scoped>
.resize-handle {
  position: absolute;
  background: transparent;
  z-index: 20;
}
</style>
