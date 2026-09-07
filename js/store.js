/**
 * store.js - Client-side IndexedDB & localStorage Persistence Engine
 * 100% Client-side GitHub Clone with KDD & WebMCP Support
 */

class GitHubStore {
  constructor() {
    this.dbName = 'GitHubKDDStore_v2';
    this.version = 2;
    this.db = null;
    this.listeners = {};
    this.isReady = false;
  }

  async init() {
    if (typeof indexedDB === 'undefined') {
      console.warn('[Store] indexedDB not available in this environment, using localStorage fallback');
      this.useLocalStorageFallback = true;
      this.isReady = true;
      await this.checkSeedData();
      return this;
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const stores = [
          { name: 'repositories', keyPath: 'id' },
          { name: 'files', keyPath: ['repoId', 'branch', 'path'] },
          { name: 'commits', keyPath: 'id' },
          { name: 'issues', keyPath: 'id' },
          { name: 'pullRequests', keyPath: 'id' },
          { name: 'kddBoard', keyPath: 'id' },
          { name: 'workflowRuns', keyPath: 'id' },
          { name: 'settings', keyPath: 'key' }
        ];

        stores.forEach(st => {
          if (!db.objectStoreNames.contains(st.name)) {
            db.createObjectStore(st.name, { keyPath: st.keyPath });
          }
        });
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        this.isReady = true;
        await this.checkSeedData();
        resolve(this);
      };

      request.onerror = (event) => {
        console.error('[Store] IndexedDB error, using localStorage fallback', event);
        this.useLocalStorageFallback = true;
        this.isReady = true;
        resolve(this);
      };
    });
  }

  async checkSeedData() {
    const repos = await this.getAll('repositories');
    if (!repos || repos.length === 0) {
      await this.loadSeedData();
    }
  }

  async loadSeedData() {
    try {
      const response = await fetch('./data/seed-repos.json');
      if (!response.ok) throw new Error('Could not load seed-repos.json');
      const data = await response.json();

      await this.clearAllStores();

      for (const repo of data.repositories || []) {
        await this.put('repositories', repo);
      }
      for (const file of data.files || []) {
        await this.put('files', file);
      }
      for (const commit of data.commits || []) {
        await this.put('commits', commit);
      }
      for (const issue of data.issues || []) {
        await this.put('issues', issue);
      }
      for (const pr of data.pullRequests || []) {
        await this.put('pullRequests', pr);
      }
      for (const card of data.kddBoard || []) {
        await this.put('kddBoard', card);
      }
      for (const w of data.workflowRuns || []) {
        await this.put('workflowRuns', w);
      }

      console.log('[Store] Seed data loaded successfully.');
      this.emit('seed_loaded', null);
    } catch (err) {
      console.warn('[Store] Failed to fetch seed data:', err);
    }
  }

  // --- Generic IndexedDB CRUD Helpers ---
  async getAll(storeName) {
    if (this.useLocalStorageFallback) {
      const raw = localStorage.getItem(`gh_store_${storeName}`);
      return raw ? JSON.parse(raw) : [];
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async get(storeName, key) {
    if (this.useLocalStorageFallback) {
      const list = await this.getAll(storeName);
      return list.find(item => {
        if (storeName === 'files' && Array.isArray(key)) {
          return item.repoId === key[0] && item.branch === key[1] && item.path === key[2];
        }
        return (item.id && item.id === key) || (item.key && item.key === key) || JSON.stringify(item.id || item.key) === JSON.stringify(key);
      }) || null;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(storeName, value) {
    if (this.useLocalStorageFallback) {
      const list = await this.getAll(storeName);
      const idx = list.findIndex(item => {
        if (storeName === 'files') {
          return item.repoId === value.repoId && item.branch === value.branch && item.path === value.path;
        }
        return (item.id && item.id === value.id) || (item.key && item.key === value.key);
      });
      if (idx >= 0) list[idx] = value;
      else list.push(value);
      localStorage.setItem(`gh_store_${storeName}`, JSON.stringify(list));
      return value;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(storeName, key) {
    if (this.useLocalStorageFallback) {
      let list = await this.getAll(storeName);
      list = list.filter(item => JSON.stringify(item.id || item.key) !== JSON.stringify(key));
      localStorage.setItem(`gh_store_${storeName}`, JSON.stringify(list));
      return true;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async clearAllStores() {
    const stores = ['repositories', 'files', 'commits', 'issues', 'pullRequests', 'kddBoard', 'workflowRuns', 'settings'];
    for (const st of stores) {
      if (this.useLocalStorageFallback) {
        localStorage.removeItem(`gh_store_${st}`);
      } else {
        await new Promise((resolve) => {
          const tx = this.db.transaction(st, 'readwrite');
          tx.objectStore(st).clear();
          tx.oncomplete = () => resolve();
        });
      }
    }
  }

  // --- Domain-specific Methods ---

  async getRepositories() {
    return await this.getAll('repositories');
  }

  async getRepository(owner, name) {
    const repos = await this.getAll('repositories');
    return repos.find(r => r.owner.toLowerCase() === owner.toLowerCase() && r.name.toLowerCase() === name.toLowerCase()) || null;
  }

  async createRepository(repoData) {
    const repo = {
      id: 'repo-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      owner: repoData.owner || 'user',
      name: repoData.name,
      description: repoData.description || '',
      defaultBranch: 'main',
      isPrivate: !!repoData.isPrivate,
      stars: 0,
      forks: 0,
      watchers: 1,
      branches: ['main'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await this.put('repositories', repo);

    // Create initial README.md
    const readmeContent = `# ${repo.name}\n\n${repo.description}\n`;
    await this.saveFile(repo.id, 'main', 'README.md', readmeContent);

    // Create initial commit
    await this.addCommit({
      id: Math.random().toString(16).substring(2, 9),
      repoId: repo.id,
      branch: 'main',
      message: 'Initial commit with README.md',
      author: `${repo.owner} <${repo.owner}@github-client.local>`,
      timestamp: new Date().toISOString()
    });

    this.emit('repo_created', repo);
    return repo;
  }

  async getFiles(repoId, branch = 'main') {
    const all = await this.getAll('files');
    return all.filter(f => f.repoId === repoId && f.branch === branch);
  }

  async getFile(repoId, branch, path) {
    const all = await this.getAll('files');
    return all.find(f => f.repoId === repoId && f.branch === branch && f.path === path) || null;
  }

  async saveFile(repoId, branch, path, content) {
    const file = { repoId, branch, path, content };
    await this.put('files', file);
    this.emit('file_saved', file);
    return file;
  }

  async deleteFile(repoId, branch, path) {
    if (this.useLocalStorageFallback) {
      let files = await this.getAll('files');
      files = files.filter(f => !(f.repoId === repoId && f.branch === branch && f.path === path));
      localStorage.setItem('gh_store_files', JSON.stringify(files));
    } else {
      await this.delete('files', [repoId, branch, path]);
    }
    this.emit('file_deleted', { repoId, branch, path });
  }

  async getCommits(repoId, branch = 'main') {
    const all = await this.getAll('commits');
    return all
      .filter(c => c.repoId === repoId && (!c.branch || c.branch === branch))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async addCommit(commit) {
    const c = {
      id: commit.id || Math.random().toString(16).substring(2, 9),
      repoId: commit.repoId,
      branch: commit.branch || 'main',
      message: commit.message || 'Update',
      author: commit.author || 'Current User <user@local>',
      timestamp: commit.timestamp || new Date().toISOString()
    };
    await this.put('commits', c);
    this.emit('commit_added', c);
    return c;
  }

  async getIssues(repoId, state = 'all') {
    const all = await this.getAll('issues');
    return all
      .filter(i => i.repoId === repoId && (state === 'all' || i.state === state))
      .sort((a, b) => b.number - a.number);
  }

  async getIssue(repoId, number) {
    const all = await this.getAll('issues');
    return all.find(i => i.repoId === repoId && Number(i.number) === Number(number)) || null;
  }

  async createIssue(issueData) {
    const existing = await this.getIssues(issueData.repoId, 'all');
    const nextNumber = existing.length > 0 ? Math.max(...existing.map(i => i.number)) + 1 : 1;
    const issue = {
      id: 'issue-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      repoId: issueData.repoId,
      number: nextNumber,
      title: issueData.title,
      body: issueData.body || '',
      state: 'open',
      author: issueData.author || 'Current User',
      labels: issueData.labels || ['enhancement'],
      commentsCount: 0,
      createdAt: new Date().toISOString()
    };
    await this.put('issues', issue);
    this.emit('issue_created', issue);
    return issue;
  }

  async getPullRequests(repoId, state = 'all') {
    const all = await this.getAll('pullRequests');
    return all
      .filter(p => p.repoId === repoId && (state === 'all' || p.state === state))
      .sort((a, b) => b.number - a.number);
  }

  async createPullRequest(prData) {
    const existing = await this.getPullRequests(prData.repoId, 'all');
    const nextNumber = existing.length > 0 ? Math.max(...existing.map(p => p.number)) + 1 : 1;
    const pr = {
      id: 'pr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      repoId: prData.repoId,
      number: nextNumber,
      title: prData.title,
      body: prData.body || '',
      state: 'open',
      author: prData.author || 'Current User',
      sourceBranch: prData.sourceBranch || 'feature',
      targetBranch: prData.targetBranch || 'main',
      createdAt: new Date().toISOString()
    };
    await this.put('pullRequests', pr);
    this.emit('pr_created', pr);
    return pr;
  }

  async getKddCards(repoId) {
    const all = await this.getAll('kddBoard');
    return all.filter(c => c.repoId === repoId);
  }

  async updateKddCard(id, updates) {
    const card = await this.get('kddBoard', id);
    if (!card) return null;
    const updated = { ...card, ...updates };
    await this.put('kddBoard', updated);
    this.emit('kdd_card_updated', updated);
    return updated;
  }

  async createKddCard(cardData) {
    const card = {
      id: 'card-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      repoId: cardData.repoId,
      task: cardData.task || 'task_' + Date.now(),
      contractPath: cardData.contractPath || `knowledge/contracts/${cardData.task}.md`,
      title: cardData.title,
      column: cardData.column || 'backlog',
      assignedAgent: cardData.assignedAgent || 'unassigned',
      gateStatus: cardData.gateStatus || 'pending',
      complexity: cardData.complexity || 1,
      maxComplexity: cardData.maxComplexity || 4
    };
    await this.put('kddBoard', card);
    this.emit('kdd_card_created', card);
    return card;
  }

  // --- KDD Actions / Workflow Runs Methods ---
  async getWorkflowRuns(repoId) {
    const all = await this.getAll('workflowRuns');
    return all
      .filter(w => w.repoId === repoId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getWorkflowRun(id) {
    return await this.get('workflowRuns', id);
  }

  async saveWorkflowRun(run) {
    await this.put('workflowRuns', run);
    this.emit('workflow_run_updated', run);
    return run;
  }

  // --- Export & Import Backup ---
  async exportBackup() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      repositories: await this.getAll('repositories'),
      files: await this.getAll('files'),
      commits: await this.getAll('commits'),
      issues: await this.getAll('issues'),
      pullRequests: await this.getAll('pullRequests'),
      kddBoard: await this.getAll('kddBoard'),
      workflowRuns: await this.getAll('workflowRuns')
    };
  }

  async importBackup(data) {
    if (!data || !data.repositories) throw new Error('Invalid backup format');
    await this.clearAllStores();
    for (const r of data.repositories || []) await this.put('repositories', r);
    for (const f of data.files || []) await this.put('files', f);
    for (const c of data.commits || []) await this.put('commits', c);
    for (const i of data.issues || []) await this.put('issues', i);
    for (const p of data.pullRequests || []) await this.put('pullRequests', p);
    for (const k of data.kddBoard || []) await this.put('kddBoard', k);
    for (const w of data.workflowRuns || []) await this.put('workflowRuns', w);
    this.emit('backup_imported', null);
  }

  // --- Pub/Sub Event System ---
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

// Global singleton instance
window.ghStore = new GitHubStore();
