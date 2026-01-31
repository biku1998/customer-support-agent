/**
 * Mastra configuration
 *
 * Registers agents and tools for the Mastra dev server and playground
 */
import { Mastra } from "@mastra/core";
import { copilotAgent } from "../copilot.agent.js";

/**
 * Mastra instance with registered agents
 */
export const mastra = new Mastra({
  agents: {
    copilot: copilotAgent,
  },
});
