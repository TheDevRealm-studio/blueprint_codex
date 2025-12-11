🧠 AI Product Document – “Blueprint Codex”
0. Meta – How You (the AI Agent) Should Work

You are building a cross-platform documentation tool for Unreal Engine projects, called Blueprint Codex.

Frontend framework: Vue 3 + Vite + TypeScript + TailwindCSS

Later wrappers:

Desktop: Tauri (Windows/macOS/Linux)

Mobile: Capacitor (Android/iOS)

The core app (this project) is a Vue SPA that can later be wrapped by Tauri/Capacitor.

Your main goals:

Implement a local-first documentation editor with:

Document View (Markdown-focused)

Canvas View (drag-and-drop block editor)

Everything must be exportable as Markdown compatible with VitePress.

Support media blocks (videos, images) and Blueprint-specific blocks.

Integrate @mariojgt/eu-blueprint-visualizer as a dedicated block type.

Design the UI visually inspired by Unreal Engine (dark, panel-based, editor-like).

1. High-Level Product Overview

Product Name: Blueprint Codex
Purpose: A local-first tool to document Unreal Engine projects (Blueprints, systems, NPCs, dialogs, etc.), combining a structured Markdown “document” view and a visual “canvas” view.
Documentation should be easy to browse, visually rich (videos, images, Blueprint graphs), and exportable to .md files for VitePress.

Core Concepts

Project

A set of doc pages + media.

DocPage

One topic (e.g. “How to Create an NPC”, “Dialogue Setup”).

Views

Document View – Markdown + metadata.

Canvas View – drag-and-drop blocks (text, steps, media, Blueprint).

Blocks

Visual building elements on the Canvas that map to Markdown when exporting.

2. User Personas & Goals
Persona: Solo / Small-Team UE Game Dev

Wants to document:

How to set up NPCs, dialogues, XP systems, UI, etc.

Blueprint patterns and “gotchas”.

Wants:

Unreal-like UI (panels, dark theme, editor vibe).

Local storage (no mandatory cloud).

Ability to:

Drag and drop videos, screenshots, Blueprint visualizations.

Link everything into a readable doc.

Export documentation as Markdown, ready for VitePress docs.

3. Functional Requirements
3.1 Projects

Users can:

Create a new Project.

Load an existing Project (from local JSON file).

Save current Project locally.

Project =:

project.json (or similar) containing pages and blocks.

Media files referenced by relative paths (e.g., media/xyz.png).

In browser-only mode:

Allow Import (upload a JSON file).

Allow Export (download JSON and optionally media reference list).

In future (not implemented now, but design for it):

Ability to sync with a remote/custom server.

3.2 Doc Pages

Each Project contains multiple DocPages.

For each DocPage, user can:

Create / rename / delete.

Set:

title

slug

category (e.g. NPC, Dialogue, Systems, UI, AI, etc.)

Tags (strings)

Switch between:

Document View – editing Markdown directly.

Canvas View – editing via visual blocks.

3.3 Views
Document View

Central editable area for Markdown:

Minimal: plain <textarea> with live preview.

Nice-to-have: toolbar for bold, lists, etc. (but not required initially).

Shows:

Frontmatter preview (title, tags, category).

Markdown body.

Changes in Document View must sync with underlying DocPage and be exportable to VitePress.

Canvas View

Main content area is a vertical list of draggable blocks.

Users can:

Add new blocks from a Block Palette (sidebar).

Reorder blocks via drag-and-drop.

Edit block-specific content (e.g. text, steps, file references).

Blocks map to structured data and later convert to Markdown.

Block types (initial set):

TextBlock

Simple rich text or markdown-like input (string).

StepsBlock

Ordered list of steps (array of strings).

MediaBlock

Represents an image or video.

Fields:

label (string)

filePath (string, relative to project root, e.g. media/npc_intro.mp4)

kind = image | video

BlueprintVisualizerBlock

Uses @mariojgt/eu-blueprint-visualizer

Fields:

blueprintString (string)

In Canvas View:

Textarea for blueprint string.

Rendered visualizer component below.

BlueprintModalBlock

Represents a “Submit/Edit Blueprint” UI block.

On Canvas:

Show description.

Show button “Open Blueprint Modal”.

Clicking button triggers the Blueprint Modal component described by the user (submit/edit blueprint with title/category/description/content fields).

3.4 Export to Markdown / VitePress

Add a Project-level action: Export for VitePress.

Result:

One .md file per DocPage, named with its slug (or reasonable fallback).

Markdown must include YAML frontmatter, e.g.:

---
title: How to Create an NPC
slug: how-to-create-npc
category: NPC
tags:
  - NPC
  - Dialogue
  - Interaction
---

# How to Create an NPC

...content...


Blocks should be rendered to markdown as follows:

TextBlock → plain markdown text paragraphs.

StepsBlock → ordered list:

1. Do this
2. Then that


MediaBlock:

image:

![Label](./media/file-name.png)


video:

Either simple link:

[Label](./media/file-name.mp4)


Or a markdown code fence/shortcode (design simple for now).

BlueprintVisualizerBlock:

Store blueprint as a fenced code block in markdown:

```blueprint
<raw blueprintString>


(Optional future: add custom VitePress plugin to render this nicely.)

BlueprintModalBlock:

For export, include a section describing submission:

## Share this Blueprint

This page includes an in-app “Submit Blueprint” modal for sharing this logic with the community.



No need to export actual modal functionality.

Export format:

In browser: bundle them into a .zip for user to download.

In desktop/mobile wrappers: write directly to a chosen folder (Tauri/Capacitor-specific work is future work, not required now).

4. Non-Functional Requirements

Frameworks & stack:

Vue 3

Vite

TypeScript

TailwindCSS

3rd-party packages:

@mariojgt/eu-blueprint-visualizer – for Blueprint visual block.

A drag-and-drop library such as vuedraggable (SortableJS Vue wrapper).

Code organization:

Use a modular architecture that will be easy to plug into Tauri and Capacitor later.

Core logic should not depend directly on browser-only APIs where possible.

Storage abstraction:

Implement a StorageDriver or composable to abstract loading/saving.

For now, implement Local Browser Storage (localStorage + file export/import).

Leave clear extension points for “FileSystem storage” and “Remote API storage”.

5. Data Model (TypeScript Interfaces)

The agent should implement (or something very close to):

export type BlockType =
  | 'text'
  | 'steps'
  | 'media'
  | 'blueprintVisualizer'
  | 'blueprintModal';

export interface BlockBase {
  id: string;
  type: BlockType;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  content: string;
}

export interface StepsBlock extends BlockBase {
  type: 'steps';
  steps: string[];
}

export interface MediaBlock extends BlockBase {
  type: 'media';
  label: string;
  filePath: string; // relative path (eg. "media/npc_intro.png")
  kind: 'image' | 'video';
}

export interface BlueprintVisualizerBlock extends BlockBase {
  type: 'blueprintVisualizer';
  blueprintString: string;
}

export interface BlueprintModalBlock extends BlockBase {
  type: 'blueprintModal';
  note?: string; // optional explanatory text
}

export type Block =
  | TextBlock
  | StepsBlock
  | MediaBlock
  | StepsBlock
  | BlueprintVisualizerBlock
  | BlueprintModalBlock;

export interface DocPage {
  id: string;
  title: string;
  slug: string;
  category?: string;
  tags: string[];
  markdown: string; // main document view contents
  blocks: Block[];  // canvas view structure
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  pages: DocPage[];
  createdAt: string;
  updatedAt: string;
}


The agent is free to tweak details as long as the concepts and fields are preserved.

6. UI / UX Requirements
6.1 Global Layout (Desktop Web)

Use a 3-panel Unreal-like editor layout:

Top Bar

Dark bar with:

Left: app logo + project name.

Center: current page title.

Right: buttons:

New Page

Save Project

Export VitePress

Left Panel – “Content Browser”

Width ~ 260–300px.

Contains:

Search bar.

List of DocPages (title + category badge).

Button: “New Page”.

Styling:

Dark backgrounds (bg-slate-950/80).

Borders: border-slate-800.

Hover states: slightly lighter background + border highlight.

Center Panel – Main editor area

Tabs at top: Document | Canvas.

Below:

For Document View:

Split view: Markdown editor & preview (side-by-side or stacked).

For Canvas View:

Block canvas with draggable blocks.

Right Panel – Details

Width ~ 260–300px.

Shows:

Page metadata (title, slug, category, tags) when no block selected.

Selected block details when a block is selected:

Block type.

Optional fields (e.g., slug, label, kind).

Editable fields.

6.2 Canvas Interactions

Block Palette:

Could be placed:

Either in left panel under page list, or

As a small toolbar at top of canvas.

Contains:

“Add Text”

“Add Steps”

“Add Media”

“Add Blueprint Visualizer”

“Add Blueprint Modal”

Each block card:

Border + subtle background.

Top row:

Drag handle icon (e.g., ⠿).

Block type name.

Delete button.

Body:

Type-specific inputs (textareas, lists, file picker, etc.).

6.3 Blueprint Integration

For BlueprintVisualizerBlock:

Provide a textarea field where user pastes raw Blueprint string.

Render <EuBlueprintVisualizer :blueprint-string="element.blueprintString" /> underneath.

For BlueprintModalBlock:

Show explanation text.

Render a button that opens your existing Blueprint Modal component (submit/edit blueprint).

The modal itself can use Inertia routes or dummy handlers – the agent should create a standalone version that can work without a backend (e.g., just logs submitted data).

7. Storage & Export
7.1 Storage Abstraction

Implement a composable or service, e.g. useProjectStorage():

Functions:

interface ProjectStorage {
  loadFromLocal(): Promise<Project | null>;
  saveToLocal(project: Project): Promise<void>;
  importFromFile(file: File): Promise<Project>;
  exportToFile(project: Project): Promise<void>; // triggers download (browser)
  exportToVitePress(project: Project): Promise<Blob | File | void>; // zip or folder representation
}


For now:

loadFromLocal / saveToLocal can use localStorage.

importFromFile and exportToFile should handle JSON via file input/download.

exportToVitePress should generate a ZIP of .md files using the Markdown renderer and JSZip or similar.

7.2 Markdown Rendering

Implement a utility, e.g. renderDocPageToMarkdown(page: DocPage): string, which:

Builds YAML frontmatter.

Builds body from page.blocks (Canvas is the source of truth for structure).

Optionally merges page.markdown if needed (e.g., allow Document View to override or complement Canvas).

8. Implementation Roadmap (for the AI Agent)

Milestone 1 – Skeleton App

Setup:

Vue 3 + Vite + TypeScript + Tailwind.

Basic layout: top bar + three panels.

Dummy project with 1 page, no persistence.

Milestone 2 – Data Model & State

Implement Project, DocPage, Block models in TypeScript.

Central store (Pinia or simple global composable) for:

currentProject

selectedPage

selectedBlock

Milestone 3 – Canvas View

Implement block palette.

Implement block list with vuedraggable (add/remove/reorder blocks).

Implement individual block UIs:

Text, Steps, Media, BlueprintVisualizer, BlueprintModal.

Milestone 4 – Document View

Implement markdown editor + preview.

Sync markdown with selected DocPage.

Milestone 5 – Blueprint Visualizer + Modal

Integrate @mariojgt/eu-blueprint-visualizer.

Create and integrate BlueprintModal component.

Wire BlueprintModalBlock to open the modal.

Milestone 6 – Storage & Export

Implement local storage (localStorage).

Implement JSON import/export.

Implement Markdown rendering for DocPage.

Implement VitePress export (ZIP with .md files).

Milestone 7 – Polish UI

Apply Unreal-inspired styling across panels and blocks.

Add loading/saving indicators.

Add basic error handling and fallback states.

9. Acceptance Criteria

The implementation is considered successful when:

User can:

Create and edit multiple pages.

Switch between Document / Canvas view for each page.

In Canvas View:

Add, edit, delete, and reorder all block types.

Attach media by entering file paths (and choose kind image/video).

Paste a Blueprint string and see it visualized.

Open the Blueprint modal from a BlueprintModalBlock.

State persistence:

Project is stored locally and restored on refresh (via localStorage or import).

User can export/import Projects as JSON.

Export:

User can trigger “Export for VitePress”.

App generates markdown files (with frontmatter) per page in a ZIP archive.

UI:

Layout is 3-panel (left/page list, center/editor, right/details) with a top toolbar.

Dark, UE-like look and feel.

If you want, I can also give you a shorter “system prompt version” of this document, optimized to paste directly as the initial instruction to an AI code agent.


please use the bun for build tool instead of npm
