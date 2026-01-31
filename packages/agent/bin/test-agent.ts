#!/usr/bin/env tsx
/**
 * Test the Mastra copilot agent via the API
 */

const API_URL = "http://localhost:4113";

interface ToolCall {
  type: string;
  payload?: {
    toolName: string;
    args: Record<string, unknown>;
  };
}

interface ToolResult {
  toolName: string;
  result: string;
}

interface Step {
  stepType: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface GenerateResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  steps: Step[];
}

async function testAgent(question: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Question: ${question}`);
  console.log("=".repeat(60));

  const response = await fetch(`${API_URL}/api/agents/support-copilot/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const result: GenerateResponse = await response.json();

  // Print tool calls and results
  console.log("\n--- Tool Calls ---");
  for (const step of result.steps) {
    if (step.toolCalls) {
      for (const tc of step.toolCalls) {
        if (tc.payload) {
          console.log(`\nTool: ${tc.payload.toolName}`);
          console.log(`Args: ${JSON.stringify(tc.payload.args)}`);
        }
      }
    }
    if (step.toolResults) {
      for (const tr of step.toolResults) {
        const toolName = tr.toolName || "unknown";
        console.log(`\nResult from ${toolName}:`);
        try {
          const resultStr = typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result);
          const content = typeof tr.result === "string" ? JSON.parse(tr.result) : tr.result;
          console.log(`  Retrieved ${content.count || 0} sections`);
          if (content.sections && Array.isArray(content.sections)) {
            for (const s of content.sections.slice(0, 3)) {
              const sim = typeof s.similarity === "number" ? s.similarity.toFixed(3) : "N/A";
              console.log(`  - ${s.id} (similarity: ${sim})`);
            }
          }
        } catch (e) {
          const resultStr = String(tr.result || "");
          console.log(`  ${resultStr.slice(0, 200)}...`);
        }
      }
    }
  }

  // Print answer
  console.log("\n--- Answer ---");
  console.log(result.text);

  // Print usage
  console.log("\n--- Usage ---");
  console.log(`Total tokens: ${result.usage.totalTokens}`);

  return result;
}

// Run tests
async function main() {
  console.log("Testing Mastra Copilot Agent");
  console.log("API URL:", API_URL);

  // Check if server is running
  try {
    const health = await fetch(`${API_URL}/api/agents`);
    if (!health.ok) {
      console.error("Server not responding. Start with: pnpm --filter @pkg/agent dev");
      process.exit(1);
    }
  } catch {
    console.error("Cannot connect to Mastra server. Start with: pnpm --filter @pkg/agent dev");
    process.exit(1);
  }

  // Test questions
  await testAgent("How do I configure the replication process?");
}

main().catch(console.error);
