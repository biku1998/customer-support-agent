export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  citations?: Citations;
}

export interface Source {
  id: string;
  technoteId: string;
  heading: string | null;
  content: string;
  similarity: number;
}

export interface Citations {
  valid: string[];
  invalid: string[];
  count: number;
}

export interface ChatResponse {
  message: {
    role: "assistant";
    content: string;
  };
  sources: Source[];
  citations: Citations;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
