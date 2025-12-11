import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Project, DocPage } from '../types';
import { storage } from '../services/storage';

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([]);
  const currentProjectId = ref<string | null>(null);
  const activePageId = ref<string | null>(null);

  // Initialize
  async function init() {
    const loaded = await storage.loadProjects();
    if (loaded.length > 0) {
      projects.value = loaded;
      // Try to restore last session ID if we stored it separately,
      // or just pick the first one.
      // For now, let's default to the first one if not set.
      if (!currentProjectId.value && loaded[0]) {
        currentProjectId.value = loaded[0].id;
      }
    } else {
      // Default project
      const defaultProject: Project = {
        id: crypto.randomUUID(),
        name: 'My Unreal Project',
        pages: [],
        media: []
      };
      projects.value.push(defaultProject);
      currentProjectId.value = defaultProject.id;
    }
  }

  // Call init immediately
  init();

  // Persist changes
  watch([projects], () => {
    storage.saveProjects(projects.value);
  }, { deep: true });

  // We can persist currentProjectId in localStorage separately for UI state
  // or add it to the storage interface. For now, let's keep UI state simple.
  const storedId = localStorage.getItem('codex-active-project');
  if (storedId) currentProjectId.value = storedId;

  watch(currentProjectId, (newId) => {
    if (newId) localStorage.setItem('codex-active-project', newId);
  });

  const project = computed(() =>
    projects.value.find(p => p.id === currentProjectId.value) || projects.value[0]
  );

  function createProject(name: string) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      pages: [],
      media: []
    };
    projects.value.push(newProject);
    currentProjectId.value = newProject.id;
    activePageId.value = null;
  }

  function selectProject(id: string) {
    currentProjectId.value = id;
    activePageId.value = null;
  }

  function addPage(title: string) {
    if (!project.value) return;

    const id = crypto.randomUUID();
    const newPage: DocPage = {
      id,
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      category: 'General',
      tags: [],
      blocks: [],
      markdownBody: '# ' + title + '\n\nStart writing...',
      viewMode: 'document'
    };
    project.value.pages.push(newPage);
    activePageId.value = id;
  }

  function setActivePage(id: string) {
    activePageId.value = id;
  }

  function updatePage(id: string, updates: Partial<DocPage>) {
    if (!project.value) return;
    const page = project.value.pages.find(p => p.id === id);
    if (page) {
      Object.assign(page, updates);
    }
  }

  return {
    projects,
    currentProjectId,
    project,
    activePageId,
    createProject,
    selectProject,
    addPage,
    setActivePage,
    updatePage
  };
});
