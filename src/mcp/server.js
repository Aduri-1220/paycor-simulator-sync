import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import { createPortalHandlers } from './handlers.js';

function toolError(message) {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function toolJson(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

export function createPortalMcpServer({ db, config, handlers: handlersOverride }) {
  const handlers = handlersOverride ?? createPortalHandlers({ db, config });

  const server = new McpServer({
    name: 'portal-mcp',
    version: '1.0.0',
  });

  server.registerTool(
    'get_request',
    {
      description: 'Read a time-off request by id, including approval and CRM sync status.',
      inputSchema: {
        id: z.string().describe('Time-off request id, e.g. PTO-2001'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        return toolJson(await handlers.getRequest(id));
      } catch (err) {
        return toolError(err.message);
      }
    }
  );

  server.registerTool(
    'get_quote_draft',
    {
      description:
        'Read an AI-generated quote draft with line items, validation errors, assumptions, and risks.',
      inputSchema: {
        id: z.string().describe('Quote id'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        return toolJson(await handlers.getQuoteDraft(id));
      } catch (err) {
        return toolError(err.message);
      }
    }
  );

  server.registerTool(
    'search_price_catalog',
    {
      description: 'Search the product price catalog by SKU, name, or description.',
      inputSchema: {
        query: z.string().describe('Search text, e.g. hood install or HOOD-12'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ query }) => {
      try {
        return toolJson(await handlers.searchPriceCatalog(query));
      } catch (err) {
        return toolError(err.message);
      }
    }
  );

  server.registerTool(
    'create_crm_sync_job',
    {
      description:
        'Enqueue a CRM sync job for an already-approved request that is missing one. Does not approve requests or run the CRM worker.',
      inputSchema: {
        requestId: z.string().describe('Approved time-off request id'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ requestId }) => {
      try {
        return toolJson(await handlers.createCrmSyncJob(requestId));
      } catch (err) {
        return toolError(err.message);
      }
    }
  );

  return server;
}
