export interface Pin {
  id: string;
  type: 'source' | 'target';
  label?: string;
}

export interface Block {
  id: string;
  type: 'text' | 'steps' | 'media' | 'blueprint' | 'blueprint-modal' | 'link' | 'code' | 'asset';
  content: any;
  x: number;
  y: number;
  width: number;
  height: number;
  pins?: Pin[];
}

export interface LinkBlock extends Block {
  type: 'link';
  content: {
    pageId: string;
    title: string;
  };
}

export interface TextBlock extends Block {
  type: 'text';
  content: string | {
    text: string;
    fontSize?: number;
  };
}

export interface StepsBlock extends Block {
  type: 'steps';
  content: string[];
}

export interface MediaBlock extends Block {
  type: 'media';
  content: {
    label: string;
    filePath: string;
    kind: 'image' | 'video';
  };
}

export interface BlueprintBlock extends Block {
  type: 'blueprint';
  content: {
    blueprintString: string;
  };
}

export interface AssetBlock extends Block {
  type: 'asset';
  content: {
    reference: string;
  };
}

export interface CodeBlock extends Block {
  type: 'code';
  content: {
    code: string;
    language: string;
  };
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FileSystemNode {
  id: string;
  name: string;
  type: 'folder' | 'page';
  children?: FileSystemNode[];
  pageId?: string; // If type is page, this links to the DocPage
  isOpen?: boolean; // UI state for folders
}

export interface DocPage {
  id: string;
  title: string;
  slug: string;
  category: string;
  tags: string[];
  blocks: Block[];
  edges: Edge[];
  markdownBody: string; // For Document View
  viewMode: 'document' | 'canvas';
  metadata?: {
    engineVersion?: string;
    status?: 'draft' | 'review' | 'verified' | 'deprecated';
    owner?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  structure: FileSystemNode[]; // Root level nodes
  pages: Record<string, DocPage>; // Flat storage for content
  media: string[]; // Paths to media files
  unrealProjectPath?: string; // Path to the .uproject file or Content folder
}
