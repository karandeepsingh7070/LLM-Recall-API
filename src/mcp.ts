import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { processAndStoreMemory } from './memory';
import { searchMemories, getProfile } from './retrieval';

const server = new Server(
  {
    name: "llm-recall-api",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "add_memory",
        description: "Extract and store facts from user input",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            text: { type: "string" }
          },
          required: ["userId", "text"]
        }
      },
      {
        name: "search_memory",
        description: "Search user memory using hybrid search",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" },
            query: { type: "string" }
          },
          required: ["userId", "query"]
        }
      },
      {
        name: "get_profile",
        description: "Get user's active profile and facts",
        inputSchema: {
          type: "object",
          properties: {
            userId: { type: "string" }
          },
          required: ["userId"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (!args) {
    throw new Error(`Missing arguments for tool ${name}`);
  }

  try {
    if (name === "add_memory") {
      const results = await processAndStoreMemory(String(args.userId), String(args.text));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } 
    
    if (name === "search_memory") {
      const results = await searchMemories(String(args.userId), String(args.query));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    if (name === "get_profile") {
      const results = await getProfile(String(args.userId));
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error: any) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LLM Recall API MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
