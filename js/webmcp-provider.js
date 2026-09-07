/**
 * webmcp-provider.js - FastWebMCP & WebMCP Standard Implementation
 * Exposes declarative and imperative tools directly into document.modelContext
 * Compatible with webmcp.com standards and browser AI agents.
 */

class WebMCPProvider {
  constructor(store, gitEngine, kddEngine, actionsEngine = null) {
    this.store = store;
    this.git = gitEngine;
    this.kdd = kddEngine;
    this.actionsEngine = actionsEngine;
    this.registry = new Map();
    this.setupPolyfill();
  }

  /**
   * Polyfill / Mock for document.modelContext if not natively present in browser
   */
  setupPolyfill() {
    if (typeof document !== 'undefined' && !document.modelContext) {
      document.modelContext = {
        isPolyfill: true,
        tools: this.registry,
        registerTool: (tool) => this.registerImperativeTool(tool),
        listTools: () => Array.from(this.registry.values()),
        invokeTool: (name, args) => this.invokeTool(name, args)
      };
      console.log('[WebMCP] Initialized polyfill runtime on document.modelContext.');
    }
  }

  /**
   * Register a tool following FastWebMCP & WebMCP specification
   */
  registerImperativeTool(tool) {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new Error('Tool must have a valid name');
    }
    // WebMCP charset validation: 1-128 chars [A-Za-z0-9_.-]
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name)) {
      throw new Error(`Invalid tool name '${tool.name}'. Must match [A-Za-z0-9_.-]{1,128}`);
    }

    this.registry.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      execute: tool.execute,
      annotations: tool.annotations || { readOnlyHint: false, untrustedContentHint: false }
    });

    // If native document.modelContext is present and not polyfill, delegate
    if (typeof document !== 'undefined' && document.modelContext && !document.modelContext.isPolyfill) {
      try {
        document.modelContext.registerTool(tool);
      } catch (e) {
        console.warn('[WebMCP] Native registerTool warning:', e);
      }
    }

    return tool;
  }

  /**
   * Invoke a registered tool directly
   */
  async invokeTool(name, args = {}) {
    try {
      const tool = this.registry.get(name);
      if (!tool) {
        throw new Error(`WebMCP Tool '${name}' not found.`);
      }
      const result = await tool.execute(args);
      return {
        status: 'success',
        tool: name,
        result
      };
    } catch (err) {
      return {
        status: 'error',
        tool: name,
        error: err.message || String(err)
      };
    }
  }

  /**
   * Initialize all default GitHub & KDD tools
   */
  initDefaultTools() {
    // 1. list_repositories
    this.registerImperativeTool({
      name: 'list_repositories',
      description: 'List all available repositories in the client-side GitHub store.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Optional owner filter' }
        }
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner }) => {
        let repos = await this.store.getRepositories();
        if (owner) repos = repos.filter(r => r.owner.toLowerCase() === owner.toLowerCase());
        return repos.map(r => ({
          id: r.id,
          owner: r.owner,
          name: r.name,
          description: r.description,
          defaultBranch: r.defaultBranch,
          stars: r.stars,
          forks: r.forks,
          branches: r.branches
        }));
      }
    });

    // 2. get_repository
    this.registerImperativeTool({
      name: 'get_repository',
      description: 'Retrieve metadata and branches for a specific repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' }
        },
        required: ['owner', 'name']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        return repo;
      }
    });

    // 3. get_file
    this.registerImperativeTool({
      name: 'get_file',
      description: 'Fetch file content from a repository at a specific branch and path.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          branch: { type: 'string', default: 'main' }
        },
        required: ['owner', 'name', 'path']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name, path, branch = 'main' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const file = await this.store.getFile(repo.id, branch, path);
        if (!file) throw new Error(`File ${path} not found in ${owner}/${name} on branch ${branch}`);
        return {
          path: file.path,
          branch: file.branch,
          size: file.content.length,
          content: file.content
        };
      }
    });

    // 4. create_or_update_file
    this.registerImperativeTool({
      name: 'create_or_update_file',
      description: 'Commit a new or modified file to a repository branch.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          path: { type: 'string' },
          content: { type: 'string' },
          message: { type: 'string' },
          branch: { type: 'string', default: 'main' }
        },
        required: ['owner', 'name', 'path', 'content']
      },
      annotations: { readOnlyHint: false },
      execute: async ({ owner, name, path, content, message, branch = 'main' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const res = await this.git.commitFile({
          repoId: repo.id,
          branch,
          path,
          content,
          message: message || `Update ${path} via WebMCP`
        });
        return {
          success: true,
          path: res.path,
          commitId: res.commit.id,
          message: res.commit.message
        };
      }
    });

    // 5. list_issues
    this.registerImperativeTool({
      name: 'list_issues',
      description: 'List issues in a repository, optionally filtered by state (open, closed, all).',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' }
        },
        required: ['owner', 'name']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name, state = 'open' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        return await this.store.getIssues(repo.id, state);
      }
    });

    // 6. create_issue
    this.registerImperativeTool({
      name: 'create_issue',
      description: 'Create a new issue in a repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } }
        },
        required: ['owner', 'name', 'title']
      },
      annotations: { readOnlyHint: false },
      execute: async ({ owner, name, title, body, labels }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const issue = await this.store.createIssue({
          repoId: repo.id,
          title,
          body,
          labels: labels || ['enhancement'],
          author: 'AI Agent (WebMCP)'
        });
        return issue;
      }
    });

    // 7. create_pull_request
    this.registerImperativeTool({
      name: 'create_pull_request',
      description: 'Open a new Pull Request in a repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          sourceBranch: { type: 'string' },
          targetBranch: { type: 'string', default: 'main' }
        },
        required: ['owner', 'name', 'title', 'sourceBranch']
      },
      annotations: { readOnlyHint: false },
      execute: async ({ owner, name, title, body, sourceBranch, targetBranch = 'main' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const pr = await this.store.createPullRequest({
          repoId: repo.id,
          title,
          body,
          sourceBranch,
          targetBranch,
          author: 'AI Agent (WebMCP)'
        });
        return pr;
      }
    });

    // 8. validate_kdd_contract
    this.registerImperativeTool({
      name: 'validate_kdd_contract',
      description: 'Run deterministic CCDD gate validation on a Task Contract in a KDD repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          contract_path: { type: 'string' },
          branch: { type: 'string', default: 'main' }
        },
        required: ['owner', 'name', 'contract_path']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name, contract_path, branch = 'main' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const audit = await this.kdd.validateContract(repo.id, contract_path, branch);
        return audit;
      }
    });

    // 9. get_kdd_board
    this.registerImperativeTool({
      name: 'get_kdd_board',
      description: 'Retrieve the 5-stage KDD Kanban board tasks for a repository.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' }
        },
        required: ['owner', 'name']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const cards = await this.store.getKddCards(repo.id);
        const columns = this.kdd.getBoardColumns();
        return {
          repository: `${owner}/${name}`,
          columns,
          cards
        };
      }
    });

    // 10. update_kdd_task
    this.registerImperativeTool({
      name: 'update_kdd_task',
      description: 'Update the stage or agent assignment of a task in the KDD Kanban board.',
      inputSchema: {
        type: 'object',
        properties: {
          card_id: { type: 'string' },
          column: {
            type: 'string',
            enum: ['backlog', 'ready', 'in_progress', 'needs_human_input', 'done']
          },
          assignedAgent: { type: 'string' }
        },
        required: ['card_id']
      },
      annotations: { readOnlyHint: false },
      execute: async ({ card_id, column, assignedAgent }) => {
        const updates = {};
        if (column) updates.column = column;
        if (assignedAgent) updates.assignedAgent = assignedAgent;
        const updated = await this.store.updateKddCard(card_id, updates);
        if (!updated) throw new Error(`Card ${card_id} not found.`);
        return updated;
      }
    });

    // 11. trigger_workflow
    this.registerImperativeTool({
      name: 'trigger_workflow',
      description: 'Trigger a deterministic KDD Actions workflow CI/CD run in the browser (client-side GitHub Actions).',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          workflow_name: { type: 'string', description: 'Workflow name (default: validate-contracts)' },
          branch: { type: 'string', description: 'Branch name (default: main)' }
        },
        required: ['owner', 'name']
      },
      annotations: { readOnlyHint: false },
      execute: async ({ owner, name, workflow_name = 'validate-contracts', branch = 'main' }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        const engine = this.actionsEngine || (typeof window !== 'undefined' ? window.actionsEngine : null);
        if (!engine) throw new Error('ActionsEngine not initialized');
        const run = await engine.runWorkflow({
          repoId: repo.id,
          branch,
          workflowName: workflow_name,
          event: 'workflow_dispatch'
        });
        return run;
      }
    });

    // 12. get_workflow_runs
    this.registerImperativeTool({
      name: 'get_workflow_runs',
      description: 'List workflow runs or inspect a specific workflow run and its step execution logs.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          name: { type: 'string' },
          run_id: { type: 'string', description: 'Optional specific run ID to inspect' }
        },
        required: ['owner', 'name']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ owner, name, run_id }) => {
        const repo = await this.store.getRepository(owner, name);
        if (!repo) throw new Error(`Repository ${owner}/${name} not found`);
        if (run_id) {
          const run = await this.store.getWorkflowRun(run_id);
          if (!run) throw new Error(`Workflow run ${run_id} not found.`);
          return run;
        }
        const runs = await this.store.getWorkflowRuns(repo.id);
        return runs;
      }
    });

    console.log(`[WebMCP] Successfully registered ${this.registry.size} tools conforming to webmcp.com.`);
  }

  /**
   * Declarative API Helper (fastwebmcp style)
   */
  defineDeclarativeTool(formElement, config) {
    if (!formElement) return;
    formElement.setAttribute('toolname', config.name);
    if (config.description) formElement.setAttribute('tooldescription', config.description);
    if (config.autoSubmit) formElement.setAttribute('toolautosubmit', 'true');

    if (config.fields && Array.isArray(config.fields)) {
      config.fields.forEach(field => {
        const el = formElement.querySelector(`[name="${field.name}"]`);
        if (el && field.description) {
          el.setAttribute('toolparamdescription', field.description);
        }
      });
    }
  }

  /**
   * Export all tools as a webmcp.com directory schema JSON
   */
  exportDirectorySchema() {
    const list = Array.from(this.registry.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations
    }));
    return {
      schemaVersion: '1.0',
      publisher: 'GitHub-KDD-ClientSide',
      standard: 'https://webmcp.com',
      toolsCount: list.length,
      tools: list
    };
  }
}

window.webMcpProvider = new WebMCPProvider(window.ghStore, window.gitEngine, window.kddEngine, window.actionsEngine);
window.webMcpProvider.initDefaultTools();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebMCPProvider };
}
