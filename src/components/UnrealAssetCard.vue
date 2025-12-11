<script setup lang="ts">
import { computed } from 'vue';
import { Box, FileCode, Image as ImageIcon, Layers, File } from 'lucide-vue-next';

const props = defineProps<{
  asset: {
    name: string;
    path: string;
    asset_type: string;
  }
}>();

const icon = computed(() => {
  const type = props.asset.asset_type.toLowerCase();
  if (type.includes('blueprint')) return FileCode;
  if (type.includes('texture') || type.includes('material')) return ImageIcon;
  if (type.includes('level') || type.includes('map')) return Layers;
  if (type.includes('staticmesh') || type.includes('skeletalmesh')) return Box;
  return File;
});

const colorClass = computed(() => {
  const type = props.asset.asset_type.toLowerCase();
  if (type.includes('blueprint')) return 'text-blue-400';
  if (type.includes('texture')) return 'text-red-400';
  if (type.includes('material')) return 'text-green-400';
  if (type.includes('level')) return 'text-orange-400';
  return 'text-gray-400';
});
</script>

<template>
  <div class="unreal-asset-card flex items-center gap-3 p-2 bg-gray-800 rounded border border-gray-700 select-none">
    <div class="p-2 bg-gray-900 rounded" :class="colorClass">
      <component :is="icon" :size="24" />
    </div>
    <div class="flex-1 min-w-0">
      <div class="font-medium text-gray-200 truncate" :title="asset.name">{{ asset.name }}</div>
      <div class="text-xs text-gray-500 truncate" :title="asset.path">{{ asset.path }}</div>
      <div class="text-[10px] uppercase tracking-wider font-bold mt-0.5" :class="colorClass">
        {{ asset.asset_type }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.unreal-asset-card {
  min-width: 200px;
  max-width: 100%;
}
</style>
