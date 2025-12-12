export interface AIConfig {
  apiKey: string;
  model: string;
  enabled: boolean;
}

export interface AIRequest {
  prompt: string;
  context?: string;
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

class AIService {
  private config: AIConfig | null = null;
  private client: any = null;
  private availableModels: AIModel[] = [];

  private async runTextPrompt(prompt: string, maxOutputTokens: number): Promise<AIResponse> {
    if (!this.client || !this.config?.model) throw new Error('AI service not initialized');

    const response = await this.client.responses.create({
      model: this.config.model,
      input: prompt,
      max_output_tokens: maxOutputTokens
    });

    return {
      text: typeof response?.output_text === 'string' ? response.output_text : '',
      usage: {
        promptTokens: response?.usage?.input_tokens ?? 0,
        completionTokens: response?.usage?.output_tokens ?? 0,
        totalTokens: response?.usage?.total_tokens ?? ((response?.usage?.input_tokens ?? 0) + (response?.usage?.output_tokens ?? 0))
      }
    };
  }

  async init(apiKey: string, model: string = 'gpt-5.2') {
    if (!apiKey) return false;
    
    try {
      // Dynamically import OpenAI to avoid bundling issues
      const OpenAI = (await import('openai')).default;
      this.client = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
      });
      
      this.config = {
        apiKey,
        model: model || 'gpt-5.2',
        enabled: true
      };

      // Fetch available models
      await this.fetchAvailableModels();
      
      return true;
    } catch (e) {
      console.error('Failed to initialize AI service:', e);
      return false;
    }
  }

  async fetchAvailableModels(): Promise<AIModel[]> {
    if (!this.client) return [];

    try {
      const response = await this.client.models.list();
      
      // Filter for chat models only (gpt-4, gpt-3.5, o1, etc.)
      const chatModels = (response.data || response)
        .filter((model: AIModel) => {
          const id = model.id.toLowerCase();
          return id.includes('gpt-4') || id.includes('gpt-3.5') || id.includes('gpt-4o') || id.startsWith('o1-');
        })
        .sort((a: AIModel, b: AIModel) => {
          // Sort by creation date descending (newest first)
          return b.created - a.created;
        });

      this.availableModels = chatModels;
      return chatModels;
    } catch (e) {
      console.error('Failed to fetch available models:', e);
      return [];
    }
  }

  getAvailableModels(): AIModel[] {
    return this.availableModels;
  }

  // Get models grouped by type for UI display
  getModelsByType(): Record<string, AIModel[]> {
    const grouped: Record<string, AIModel[]> = {
      'O1 Series': [],
      'GPT-4o Series': [],
      'GPT-4 Series': [],
      'GPT-3.5 Series': []
    };

    this.availableModels.forEach(model => {
      const id = model.id.toLowerCase();
      if (id.startsWith('o1-')) {
        grouped['O1 Series']?.push(model);
      } else if (id.includes('4o')) {
        grouped['GPT-4o Series']?.push(model);
      } else if (id.includes('gpt-4')) {
        grouped['GPT-4 Series']?.push(model);
      } else if (id.includes('3.5')) {
        grouped['GPT-3.5 Series']?.push(model);
      }
    });

    return grouped;
  }

  isEnabled(): boolean {
    return this.config?.enabled ?? false;
  }

  async summarize(text: string): Promise<string> {
    const response = await this.runTextPrompt(
      `Please provide a concise summary of the following text:\n\n${text}`,
      500
    );
    return response.text;
  }

  async improve(text: string, context?: string): Promise<string> {
    const prompt = context
      ? `Improve the following text while maintaining the context about "${context}". Make it clearer, more professional, and better structured:\n\n${text}`
      : `Improve the following text. Make it clearer, more professional, and better structured:\n\n${text}`;

    const response = await this.runTextPrompt(prompt, 1000);
    return response.text;
  }

  async generateContent(topic: string, type: 'documentation' | 'guide' | 'tutorial' | 'notes'): Promise<AIResponse> {
    const prompts: Record<'documentation' | 'guide' | 'tutorial' | 'notes', string> = {
      documentation: `Create comprehensive technical documentation about "${topic}". Structure it with sections, include examples, and make it professional.`,
      guide: `Create a detailed step-by-step guide about "${topic}". Include prerequisites, steps, tips, and best practices.`,
      tutorial: `Create an engaging tutorial about "${topic}". Include introduction, learning objectives, step-by-step instructions, and conclusion.`,
      notes: `Create organized notes about "${topic}". Use bullet points and hierarchical structure.`
    };

    const prompt = prompts[type];
    if (!prompt) throw new Error('Unknown content type');
    return this.runTextPrompt(prompt, 2000);
  }

  async explainConcept(topic: string, complexity: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'): Promise<AIResponse> {
    return this.runTextPrompt(
      `Explain the concept of "${topic}" at a ${complexity} level. Include key points, examples, and practical applications.`,
      1500
    );
  }

  async customRequest(prompt: string, maxTokens: number = 1000): Promise<AIResponse> {
    return this.runTextPrompt(prompt, maxTokens);
  }

  // Convenience methods that return just the text
  async expand(text: string): Promise<string> {
    const response = await this.customRequest(`Expand and elaborate on the following text. Add more details, examples, and explanations:\n\n${text}`, 1200);
    return response.text;
  }

  async simplify(text: string): Promise<string> {
    const response = await this.customRequest(`Simplify the following text. Make it easier to understand while preserving the meaning:\n\n${text}`, 800);
    return response.text;
  }

  async fixGrammar(text: string): Promise<string> {
    const response = await this.customRequest(`Fix grammar, spelling, and punctuation in the following text. Maintain the original meaning and style:\n\n${text}`, 800);
    return response.text;
  }

  async generateBulletPoints(text: string): Promise<string> {
    const response = await this.customRequest(`Convert the following text into well-organized bullet points. Keep the key information:\n\n${text}`, 800);
    return response.text;
  }

  async beautifyMarkdown(text: string): Promise<string> {
    const response = await this.customRequest(
      `Transform the following text into beautiful, easy-to-read markdown with lots of relevant emojis. Use:
- Emojis for headers and sections (📝 ✨ 🎯 💡 ⚡ 🚀 etc.)
- Proper markdown formatting (headers, bold, italic, lists)
- Code blocks where appropriate
- Clear visual hierarchy
- Engaging emojis that match the content context
- Make it fun and visually appealing while keeping all important information

Text to beautify:
${text}`, 
      1500
    );
    return response.text;
  }

  async explainBlueprint(text: string): Promise<string> {
    const response = await this.customRequest(
      `Analyze the following Unreal Engine Blueprint logic (or copied node text) and explain exactly what it does.
Identify key events, variable changes, and potential performance issues (like Tick usage or expensive casts).

Blueprint Logic:
${text}`,
      1500
    );
    return response.text;
  }

  async generateCppClass(description: string): Promise<string> {
    const response = await this.customRequest(
      `Generate a production-ready Unreal Engine 5 C++ class based on this description.
Include both the .h (Header) and .cpp (Source) code.
Use proper UCLASS, UPROPERTY, UFUNCTION macros.
Follow Epic Games coding standards.

Description: "${description}"`,
      2000
    );
    return response.text;
  }

  async auditNamingConventions(text: string): Promise<string> {
    const response = await this.customRequest(
      `Audit the following list of Unreal Engine assets/files for naming convention violations.
Use the standard prefix style (e.g., BP_ for Blueprints, T_ for Textures, M_ for Materials, SK_ for Skeletal Meshes).
List any violations and suggest the corrected name.

List to audit:
${text}`,
      1000
    );
    return response.text;
  }

  async executeCustomPrompt(text: string, prompt: string): Promise<string> {
    const fullPrompt = `${prompt}\n\nText to process:\n${text}`;
    const response = await this.customRequest(fullPrompt, 1000);
    return response.text;
  }

  updateConfig(config: Partial<AIConfig>) {
    if (this.config) {
      this.config = { ...this.config, ...config };
    }
  }

  getConfig(): AIConfig | null {
    return this.config;
  }
}

export const aiService = new AIService();

export function useAI() {
  return aiService;
}
