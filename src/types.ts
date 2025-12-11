export interface Block {
  id: string;
  type: 'text' | 'steps' | 'media' | 'blueprint' | 'blueprint-modal' | 'link';
  content: any;
  x: number;
  y: number;
  width: number;
  height: number;
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
  content: string;
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

export interface DocPage {
  id: string;
  title: string;
  slug: string;
  category: string;
  tags: string[];
  blocks: Block[];
  markdownBody: string; // For Document View
  viewMode: 'document' | 'canvas';
}

export interface Project {
  id: string;
  name: string;
  pages: DocPage[];
  media: string[]; // Paths to media files
}
