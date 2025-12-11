<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
// @ts-ignore
import { init } from '@mariojgt/eu-blueprint-visualizer/dist/klee.min.js';

const props = defineProps<{ blueprint: string }>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
let visualizer: any = null;

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
});

watch(() => props.blueprint, (newVal) => {
  if (visualizer && newVal) {
    visualizer.display(newVal);
  }
});
</script>

<template>
  <div class="w-full h-full bg-[#1a1a1a] overflow-hidden">
    <canvas ref="canvasRef" class="w-full h-full block"></canvas>
  </div>
</template>
