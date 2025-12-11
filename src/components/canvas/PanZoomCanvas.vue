<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  zoom: number;
  offsetX: number;
  offsetY: number;
}>();

const emit = defineEmits<{
  (e: 'update:zoom', val: number): void;
  (e: 'update:offsetX', val: number): void;
  (e: 'update:offsetY', val: number): void;
  (e: 'drop-files', files: FileList, x: number, y: number): void;
  (e: 'drop-item', event: any): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const isPanning = ref(false);
const lastMousePos = ref({ x: 0, y: 0 });
const isSpacePressed = ref(false);

function onWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const newZoom = Math.max(0.1, Math.min(5, props.zoom - e.deltaY * zoomSensitivity));
    
    // Zoom towards mouse pointer logic could be added here, 
    // but for now simple center zoom or origin zoom is easier.
    // Let's stick to simple zoom for MVP.
    emit('update:zoom', newZoom);
  } else {
    e.preventDefault();
    emit('update:offsetX', props.offsetX - e.deltaX);
    emit('update:offsetY', props.offsetY - e.deltaY);
  }
}

function onMouseDown(e: MouseEvent) {
  if (e.button === 1 || (e.button === 0 && isSpacePressed.value)) {
    // Middle click or Space+Left click
    isPanning.value = true;
    lastMousePos.value = { x: e.clientX, y: e.clientY };
    e.preventDefault(); // Prevent text selection
  }
}

function onMouseMove(e: MouseEvent) {
  if (isPanning.value) {
    const dx = e.clientX - lastMousePos.value.x;
    const dy = e.clientY - lastMousePos.value.y;
    emit('update:offsetX', props.offsetX + dx);
    emit('update:offsetY', props.offsetY + dy);
    lastMousePos.value = { x: e.clientX, y: e.clientY };
  }
}

function onMouseUp() {
  isPanning.value = false;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = true;
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') {
    isSpacePressed.value = false;
    isPanning.value = false;
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  const rect = containerRef.value?.getBoundingClientRect();
  if (!rect) return;

  // Calculate drop position relative to canvas origin, accounting for zoom and offset
  const clientX = e.clientX - rect.left;
  const clientY = e.clientY - rect.top;
  
  const canvasX = (clientX - props.offsetX) / props.zoom;
  const canvasY = (clientY - props.offsetY) / props.zoom;

  if (e.dataTransfer?.files.length) {
    emit('drop-item', { type: 'files', files: e.dataTransfer.files, x: canvasX, y: canvasY });
  } else {
    // Handle other data types (like internal page drag)
    emit('drop-item', { type: 'data', dataTransfer: e.dataTransfer, x: canvasX, y: canvasY });
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault(); // Allow drop
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div 
    ref="containerRef"
    class="w-full h-full overflow-hidden bg-[#0A0F1C] relative cursor-default"
    :class="{ 'cursor-grab': isSpacePressed, 'cursor-grabbing': isPanning }"
    @wheel="onWheel"
    @mousedown="onMouseDown"
    @drop="onDrop"
    @dragover="onDragOver"
  >
    <!-- Grid Background -->
    <div 
      class="absolute inset-0 pointer-events-none opacity-10"
      :style="{
        backgroundImage: `
          linear-gradient(to right, #334155 1px, transparent 1px),
          linear-gradient(to bottom, #334155 1px, transparent 1px)
        `,
        backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`
      }"
    ></div>

    <!-- Canvas Content -->
    <div 
      class="absolute origin-top-left will-change-transform"
      :style="{
        transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
      }"
    >
      <slot></slot>
    </div>
    
    <!-- HUD -->
    <div class="absolute bottom-4 right-4 bg-brand-surface border border-gray-700 rounded-full px-3 py-1 text-xs text-brand-text font-mono shadow-lg">
      {{ Math.round(zoom * 100) }}%
    </div>
  </div>
</template>
