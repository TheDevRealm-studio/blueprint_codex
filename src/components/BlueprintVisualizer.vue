<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
// @ts-ignore
import { init } from '@mariojgt/eu-blueprint-visualizer/dist/klee.min.js';

const props = defineProps<{ blueprint: string }>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
let visualizer: any = null;
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (canvasRef.value) {
    try {
      visualizer = init(canvasRef.value);
      if (props.blueprint) {
        visualizer.display(props.blueprint);
      }
    } catch (e) {
      console.error('Failed to init visualizer', e);
    }
  }

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (canvasRef.value && containerRef.value) {
        // Sync internal resolution with CSS size
        canvasRef.value.width = containerRef.value.clientWidth;
        canvasRef.value.height = containerRef.value.clientHeight;

        // Redraw
        if (visualizer && props.blueprint) {
          visualizer.display(props.blueprint);
        }
      }
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

watch(() => props.blueprint, (newVal) => {
  if (visualizer && newVal) {
    visualizer.display(newVal);
  }
});
</script>

<template>
  <div ref="containerRef" class="w-full h-full bg-[#1a1a1a] overflow-hidden">
    <canvas ref="canvasRef" class="w-full h-full block"></canvas>
  </div>
</template>
