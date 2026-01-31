// Prompts
export {
  GROUNDED_ANSWER_SYSTEM_PROMPT,
  formatContext,
  buildUserMessage,
  type ContextSection,
} from "./prompts/answer.js";

// Validators
export {
  extractCitations,
  detectAbstention,
  validateCitations,
  calculateOverlapScore,
  type CitationValidationResult,
} from "./validators/citation.js";

// Answer generation
export {
  generateAnswer,
  answerQuestion,
  type GenerateAnswerOptions,
  type GeneratedAnswer,
} from "./generateAnswer.js";

// Mastra agent
export { copilotAgent } from "./copilot.agent.js";
export { retrieveTool } from "./tools/index.js";
export { mastra } from "./mastra/index.js";
