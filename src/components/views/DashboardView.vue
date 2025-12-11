<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useProjectStore } from '../../stores/project';
import * as d3 from 'd3';

const store = useProjectStore();
const chartRef = ref<HTMLElement | null>(null);

const topPages = computed(() => {
  if (!store.project) return [];
  return Object.values(store.project.pages)
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
    .slice(0, 10); // Top 10
});

onMounted(() => {
  renderChart();
});

function renderChart() {
  if (!chartRef.value || topPages.value.length === 0) return;

  const data = topPages.value.map(p => ({
    title: p.title,
    count: p.viewCount || 0
  }));

  const margin = { top: 20, right: 20, bottom: 40, left: 150 };
  const width = chartRef.value.clientWidth - margin.left - margin.right;
  const height = 300 - margin.top - margin.bottom;

  // Clear previous
  d3.select(chartRef.value).selectAll('*').remove();

  const svg = d3.select(chartRef.value)
    .append('svg')
    .attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // X Axis
  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.count) || 10])
    .range([0, width]);

  svg.append('g')
    .attr('transform', `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(5))
    .selectAll('text')
    .attr('transform', 'translate(-10,0)rotate(-45)')
    .style('text-anchor', 'end')
    .style('fill', '#94A3B8'); // Text color

  // Y Axis
  const y = d3.scaleBand()
    .range([0, height])
    .domain(data.map(d => d.title))
    .padding(0.2);

  svg.append('g')
    .call(d3.axisLeft(y))
    .selectAll('text')
    .style('fill', '#94A3B8')
    .style('font-family', 'monospace');

  // Bars
  svg.selectAll('myRect')
    .data(data)
    .join('rect')
    .attr('x', x(0))
    .attr('y', d => y(d.title)!)
    .attr('width', d => x(d.count))
    .attr('height', y.bandwidth())
    .attr('fill', '#00FF9D') // Cyber Green
    .attr('opacity', 0.7)
    .on('mouseover', function() {
        d3.select(this).attr('opacity', 1);
    })
    .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.7);
    });
    
  // Add values at end of bars
  svg.selectAll('myLabels')
    .data(data)
    .join('text')
    .attr('x', d => x(d.count) + 5)
    .attr('y', d => y(d.title)! + y.bandwidth() / 2 + 4)
    .text(d => d.count)
    .style('fill', '#00FF9D')
    .style('font-size', '10px')
    .style('font-family', 'monospace');
}
</script>

<template>
  <div class="p-8 h-full overflow-y-auto custom-scrollbar">
    <div class="max-w-4xl mx-auto">
      <h2 class="text-2xl font-bold text-cyber-green mb-6 flex items-center gap-2">
        <span>📊</span> PROJECT_DASHBOARD
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Stats Card -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)]">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Most Viewed Pages</h3>
          <div v-if="topPages.length > 0" ref="chartRef" class="w-full h-[300px]"></div>
          <div v-else class="text-cyber-text/50 italic text-center py-10">
            No data available yet. Start browsing pages!
          </div>
        </div>

        <!-- Quick Stats -->
        <div class="bg-cyber-panel border border-cyber-green/20 rounded p-6 shadow-[0_0_15px_rgba(0,255,157,0.1)]">
          <h3 class="text-cyber-purple font-bold mb-4 uppercase tracking-wider text-sm">Quick Stats</h3>
          <div class="space-y-4">
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Total Pages</span>
              <span class="text-cyber-green font-bold text-xl">{{ Object.keys(store.project?.pages || {}).length }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Total Assets</span>
              <span class="text-cyber-green font-bold text-xl">{{ store.project?.media?.length || 0 }}</span>
            </div>
            <div class="flex justify-between items-center border-b border-cyber-green/10 pb-2">
              <span class="text-cyber-text/70">Last Updated</span>
              <span class="text-cyber-text font-mono text-xs">Just now</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
