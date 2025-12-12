import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { Project, DocPage, FileSystemNode } from '../types';
import { storage } from '../services/storage';
import { unrealService } from '../services/unreal';

import { templates } from '../config/templates';

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([]);
  const currentProjectId = ref<string | null>(null);
  const activePageId = ref<string | null>(null);
  const openPageIds = ref<string[]>([]);
  const viewMode = ref<'editor' | 'graph'>('editor');
  const isCommandPaletteOpen = ref(false);
  const showKnowledgeGraph = ref(false);

  const serverStatus = ref<'online' | 'offline' | 'checking'>('checking');
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Initialize
  async function init() {
    try {
      const loaded = await storage.loadProjects();
      // Check environment
      // @ts-ignore
      if (window.__TAURI__) {
        serverStatus.value = 'online';
      } else {
        try {
          await fetch('http://localhost:3001/api/projects');
          serverStatus.value = 'online';
        } catch {
          serverStatus.value = 'offline';
        }
      }

      if (loaded.length > 0) {
      // Migration: Convert old array-based pages to new structure if needed
      projects.value = loaded.map(p => {
        if (Array.isArray(p.pages)) {
           const newPages: Record<string, DocPage> = {};
           const newStructure: FileSystemNode[] = [];
           // @ts-ignore - handling legacy data
           (p.pages as DocPage[]).forEach(page => {
             newPages[page.id] = page;
             newStructure.push({
               id: crypto.randomUUID(),
               name: page.title,
               type: 'page',
               pageId: page.id
             });
           });
           return {
             ...p,
             pages: newPages,
             structure: newStructure
           } as Project;
        }
        return p;
      });

      if (!currentProjectId.value && projects.value[0]) {
        currentProjectId.value = projects.value[0].id;
      }
    } else {
      // Default project
      createProject('My Unreal Project');
    }
  } catch (e) {
    console.error('Failed to initialize project store', e);
    serverStatus.value = 'offline';
    // Ensure we have a project to work with even if storage failed
    if (projects.value.length === 0) {
      createProject('My Unreal Project');
    }
  }
  }

  // Call init immediately, but wait for next tick to ensure environment is ready
  setTimeout(() => {
    init();
  }, 100);

  // Persist changes
  watch([projects], async () => {
    if (serverStatus.value === 'offline') return;

    saveStatus.value = 'saving';
    try {
      await storage.saveProjects(projects.value);
      saveStatus.value = 'saved';
      setTimeout(() => {
        if (saveStatus.value === 'saved') saveStatus.value = 'idle';
      }, 2000);
    } catch (e) {
      saveStatus.value = 'error';
      serverStatus.value = 'offline'; // Assume offline if save fails
    }
  }, { deep: true });

  const storedId = localStorage.getItem('codex-active-project');
  if (storedId) currentProjectId.value = storedId;

  watch(currentProjectId, (newId) => {
    if (newId) localStorage.setItem('codex-active-project', newId);
  });

  const project = computed(() =>
    projects.value.find(p => p.id === currentProjectId.value) || projects.value[0]
  );

  const activePage = computed(() => {
    if (!project.value || !activePageId.value) return null;
    return project.value.pages[activePageId.value];
  });

  function createProject(name: string) {
    const newProject: Project = {
      id: crypto.randomUUID(),
      name,
      structure: [],
      pages: {},
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

  function findNode(nodes: FileSystemNode[], id: string): FileSystemNode | undefined {
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
            const found = findNode(node.children, id);
            if (found) return found;
        }
    }
    return undefined;
  }

  function addPage(title: string, parentNodeId?: string, templateId?: string) {
    if (!project.value) return;

    const id = crypto.randomUUID();

    // Find template
    const template = templates.find(t => t.id === templateId) || templates[0];
    let initialMarkdown = '# ' + title + '\n\nStart writing...';
    let initialTags: string[] = [];

    if (template) {
        initialMarkdown = template.markdown.replace('Actor Name', title).replace('Game Mode Name', title).replace('System Name', title);
        initialTags = template.tags || [];
    }

    const newPage: DocPage = {
      id,
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      category: 'General',
      tags: initialTags,
      blocks: [],
      edges: [],
      markdownBody: initialMarkdown,
      viewMode: 'document'
    };

    // Add to flat storage
    project.value.pages[id] = newPage;

    // Add to structure
    const newNode: FileSystemNode = {
      id: crypto.randomUUID(),
      name: title,
      type: 'page',
      pageId: id
    };

    if (parentNodeId) {
       const parent = findNode(project.value.structure, parentNodeId);
       if (parent && parent.type === 'folder') {
         parent.children = parent.children || [];
         parent.children.push(newNode);
         parent.isOpen = true;
       } else {
         project.value.structure.push(newNode);
       }
    } else {
      project.value.structure.push(newNode);
    }

    activePageId.value = id;
  }

  function addFolder(name: string, parentNodeId?: string) {
    if (!project.value) return;
    const newNode: FileSystemNode = {
        id: crypto.randomUUID(),
        name,
        type: 'folder',
        children: [],
        isOpen: true
    };
     if (parentNodeId) {
         const parent = findNode(project.value.structure, parentNodeId);
         if (parent && parent.type === 'folder') {
             parent.children = parent.children || [];
             parent.children.push(newNode);
             parent.isOpen = true;
         } else {
             project.value.structure.push(newNode);
         }
     } else {
         project.value.structure.push(newNode);
     }
  }

  function setActivePage(id: string) {
    activePageId.value = id;
    if (!openPageIds.value.includes(id)) {
      openPageIds.value.push(id);
    }
    viewMode.value = 'editor';

    // Increment view count
    if (project.value && project.value.pages[id]) {
        const page = project.value.pages[id];
        page.viewCount = (page.viewCount || 0) + 1;
    }
  }

  function closePage(id: string) {
    const index = openPageIds.value.indexOf(id);
    if (index !== -1) {
      openPageIds.value.splice(index, 1);
      // If we closed the active page, switch to another one
      if (activePageId.value === id) {
        if (openPageIds.value.length > 0) {
          // Try to go to the one to the left, or the first one
          const newIndex = Math.max(0, index - 1);
          activePageId.value = openPageIds.value[newIndex] || null;
        } else {
          activePageId.value = null;
        }
      }
    }
  }

  function setViewMode(mode: 'editor' | 'graph') {
    viewMode.value = mode;
  }

  function updatePage(id: string, updates: Partial<DocPage>) {
    if (!project.value) return;
    const page = project.value.pages[id];
    if (page) {
      Object.assign(page, updates);
    }
  }

  function toggleFolder(nodeId: string) {
      if (!project.value) return;
      const node = findNode(project.value.structure, nodeId);
      if (node && node.type === 'folder') {
          node.isOpen = !node.isOpen;
      }
  }

  function renameNode(id: string, newName: string) {
    if (!project.value) return;
    const node = findNode(project.value.structure, id);
    if (node) {
      node.name = newName;
      if (node.type === 'page' && node.pageId) {
        const page = project.value.pages[node.pageId];
        if (page) page.title = newName;
      }
    }
  }

  function deleteNode(id: string) {
    if (!project.value) return;

    // Helper to recursively delete content
    function deleteContentRecursively(node: FileSystemNode) {
        if (node.type === 'page' && node.pageId && project.value) {
            delete project.value.pages[node.pageId];
            if (activePageId.value === node.pageId) activePageId.value = null;
        }
        if (node.children) {
            node.children.forEach(deleteContentRecursively);
        }
    }

    // Helper to remove from tree
    function removeFromTree(nodes: FileSystemNode[]): boolean {
      const idx = nodes.findIndex(n => n.id === id);
      if (idx !== -1) {
        const node = nodes[idx];
        if (!node) return false;
        
        // Recursively delete content
        deleteContentRecursively(node);
        
        nodes.splice(idx, 1);
        return true;
      }

      for (const node of nodes) {
        if (node.children && removeFromTree(node.children)) return true;
      }
      return false;
    }

    removeFromTree(project.value.structure);
  }

  function moveNode(nodeId: string, targetFolderId: string | null) {
    if (!project.value) return;
    if (nodeId === targetFolderId) return; // Can't move into self

    // Check for circular move (moving parent into child)
    if (targetFolderId) {
        const node = findNode(project.value.structure, nodeId);
        if (node && node.children) {
            const targetInChildren = findNode(node.children, targetFolderId);
            if (targetInChildren) return; // Target is inside the node we are moving
        }
    }

    // 1. Find and remove node
    let nodeToMove: FileSystemNode | null = null;

    function extract(nodes: FileSystemNode[]): boolean {
      const idx = nodes.findIndex(n => n.id === nodeId);
      if (idx !== -1) {
        nodeToMove = nodes[idx] || null;
        nodes.splice(idx, 1);
        return true;
      }
      for (const node of nodes) {
        if (node.children && extract(node.children)) return true;
      }
      return false;
    }

    extract(project.value.structure);

    if (!nodeToMove) return;

    // 2. Insert into target
    if (targetFolderId === null) {
      // Root
      project.value.structure.push(nodeToMove);
    } else {
      const target = findNode(project.value.structure, targetFolderId);
      if (target && target.type === 'folder') {
        target.children = target.children || [];
        target.children.push(nodeToMove);
        target.isOpen = true;
      } else {
        // Fallback to root if target not found
        project.value.structure.push(nodeToMove);
      }
    }
  }

  function importProject(importedProject: Project) {
    // Check if project with same ID exists
    const existingIndex = projects.value.findIndex(p => p.id === importedProject.id);
    if (existingIndex !== -1) {
      if (confirm(`Project "${importedProject.name}" already exists. Overwrite?`)) {
        projects.value[existingIndex] = importedProject;
      } else {
        // Create copy with new ID
        importedProject.id = crypto.randomUUID();
        importedProject.name = `${importedProject.name} (Imported)`;
        projects.value.push(importedProject);
      }
    } else {
      projects.value.push(importedProject);
    }
    currentProjectId.value = importedProject.id;
    activePageId.value = null;
    openPageIds.value = [];
  }

  async function linkUnrealProject() {
    if (!project.value) return;
    const path = await unrealService.selectProject();
    if (path) {
      project.value.unrealProjectPath = path;
      // Auto-save handled by watcher
    }
  }

  function addLink(sourceId: string, targetId: string) {
    if (!project.value) return;
    const sourcePage = project.value.pages[sourceId];
    const targetPage = project.value.pages[targetId];

    if (sourcePage && targetPage) {
      const linkText = `\n\nSee also: [[${targetPage.title}]]`;
      updatePage(sourceId, {
        markdownBody: (sourcePage.markdownBody || '') + linkText
      });
    }
  }

  // Watch for project changes to load Unreal context
  watch(project, (newVal) => {
    if (newVal && newVal.unrealProjectPath) {
      unrealService.scanProject(newVal.unrealProjectPath);
    }
  }, { immediate: true });

  return {
    projects,
    currentProjectId,
    project,
    activePageId,
    activePage,
    openPageIds,
    createProject,
    selectProject,
    addPage,
    addFolder,
    setActivePage,
    closePage,
    setViewMode,
    viewMode,
    updatePage,
    toggleFolder,
    renameNode,
    deleteNode,
    moveNode,
    importProject,
    linkUnrealProject,
    addLink,
    serverStatus,
    saveStatus,
    isCommandPaletteOpen,
    showKnowledgeGraph
  };
});
