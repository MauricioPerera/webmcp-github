/**
 * app.js - Main Application Orchestrator & View Renderer
 * 100% Client-side GitHub Clone with Tailwind, HTMX, KDD, and WebMCP.
 */

class GitHubApp {
  constructor() {
    this.store = window.ghStore;
    this.git = window.gitEngine;
    this.kdd = window.kddEngine;
    this.webmcp = window.webMcpProvider;

    this.currentOwner = 'MauricioPerera';
    this.currentRepoName = 'KDD';
    this.currentBranch = 'main';
    this.currentTab = 'code';
    this.currentPath = '';
    this.selectedWorkflowRunId = null;
    this.theme = localStorage.getItem('gh_theme') || 'dark';

    this.activeRepo = null;
    this.init();
  }

  async init() {
    this.applyTheme(this.theme);
    await this.store.init();
    
    // Load active repo
    await this.loadCurrentRepo();

    // Listen to hash routing
    window.addEventListener('hashchange', () => this.handleHashRoute());
    
    // Handle initial hash
    if (window.location.hash) {
      await this.handleHashRoute();
    } else {
      window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}`;
    }

    // Subscribe to store events
    this.store.on('repo_created', () => this.updateRepoDropdown());
    this.store.on('commit_added', () => this.refreshCurrentView());
    this.store.on('issue_created', () => this.refreshCurrentView());
    this.store.on('pr_created', () => this.refreshCurrentView());
    this.store.on('kdd_card_updated', () => this.refreshCurrentView());
    this.store.on('backup_imported', () => {
      this.toast('Backup imported successfully!');
      this.loadCurrentRepo().then(() => this.refreshCurrentView());
    });

    this.initNavbar();
    this.initModals();
    this.updateWebMcpBadge();
  }

  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem('gh_theme', theme);
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      document.body.classList.remove('bg-gray-50', 'text-gray-900');
      document.body.classList.add('bg-[#0d1117]', 'text-[#c9d1d9]');
    } else {
      html.classList.remove('dark');
      document.body.classList.remove('bg-[#0d1117]', 'text-[#c9d1d9]');
      document.body.classList.add('bg-gray-50', 'text-gray-900');
    }
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) {
      themeIcon.innerHTML = theme === 'dark' 
        ? `<svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"></path></svg>`
        : `<svg class="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>`;
    }
  }

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  async loadCurrentRepo() {
    this.activeRepo = await this.store.getRepository(this.currentOwner, this.currentRepoName);
    if (!this.activeRepo) {
      const all = await this.store.getRepositories();
      if (all.length > 0) {
        this.activeRepo = all[0];
        this.currentOwner = this.activeRepo.owner;
        this.currentRepoName = this.activeRepo.name;
      }
    }
    if (this.activeRepo && !this.activeRepo.branches.includes(this.currentBranch)) {
      this.currentBranch = this.activeRepo.defaultBranch || 'main';
    }
  }

  async handleHashRoute() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/').filter(Boolean);

    if (parts.length >= 2) {
      this.currentOwner = parts[0];
      this.currentRepoName = parts[1];
      await this.loadCurrentRepo();

      const action = parts[2] || 'code';
      if (['tree', 'blob'].includes(action)) {
        this.currentTab = 'code';
        this.currentBranch = parts[3] || 'main';
        this.currentPath = parts.slice(4).join('/');
      } else if (['code', 'issues', 'pulls', 'actions', 'kdd-board', 'contracts', 'commits', 'settings'].includes(action)) {
        this.currentTab = action;
        this.currentPath = '';
        if (action === 'actions') {
          this.selectedWorkflowRunId = parts[3] || null;
        }
      } else {
        this.currentTab = 'code';
        this.currentPath = '';
      }
    }

    this.render();
  }

  async render() {
    if (!this.activeRepo) {
      document.getElementById('app-root').innerHTML = `
        <div class="p-8 text-center">
          <h2 class="text-xl font-semibold">No repositories found</h2>
          <p class="text-gray-400 mt-2">Loading seed repositories...</p>
        </div>`;
      return;
    }

    this.renderHeader();
    await this.renderContentArea();
    this.updateRepoDropdown();
  }

  renderHeader() {
    const headerEl = document.getElementById('repo-header');
    if (!headerEl) return;

    const isStarred = localStorage.getItem(`starred_${this.activeRepo.id}`) === 'true';

    headerEl.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 pt-4">
        <!-- Top Repo Identity & Actions -->
        <div class="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#30363d]">
          <div class="flex items-center gap-2 text-lg">
            <svg class="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor">
              <path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"></path>
            </svg>
            <span class="text-blue-400 hover:underline cursor-pointer" onclick="app.navigate('${this.activeRepo.owner}/${this.activeRepo.name}')">${this.activeRepo.owner}</span>
            <span class="text-gray-400">/</span>
            <span class="font-bold text-white hover:underline cursor-pointer" onclick="app.navigate('${this.activeRepo.owner}/${this.activeRepo.name}')">${this.activeRepo.name}</span>
            <span class="text-xs px-2 py-0.5 rounded-full border border-[#30363d] text-gray-400 font-medium">Public</span>
            ${this.activeRepo.forkedFrom ? `<span class="text-xs text-gray-400">forked from <span class="text-blue-400">${this.activeRepo.forkedFrom}</span></span>` : ''}
          </div>

          <!-- Buttons: Watch, Fork, Star, WebMCP -->
          <div class="flex items-center gap-2">
            <button onclick="app.toggleWatch()" class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] rounded-md transition">
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 010 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 010-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2zm0 1.5c-1.619 0-3.04.793-4.14 1.741C2.775 6.177 2.003 7.234 1.678 7.747a.12.12 0 000 .506c.325.513 1.097 1.57 2.182 2.506C4.96 11.707 6.381 12.5 8 12.5c1.619 0 3.04-.793 4.14-1.741 1.085-.936 1.857-1.993 2.182-2.506a.12.12 0 000-.506c-.325-.513-1.097-1.57-2.182-2.506C11.04 4.293 9.619 3.5 8 3.5zM8 5a3 3 0 100 6 3 3 0 000-6z"></path></svg>
              Watch <span class="bg-[#30363d] px-1.5 py-0.5 rounded-full text-[10px]">${this.activeRepo.watchers || 1}</span>
            </button>

            <button onclick="app.forkRepo()" class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] rounded-md transition">
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"></path></svg>
              Fork <span class="bg-[#30363d] px-1.5 py-0.5 rounded-full text-[10px]">${this.activeRepo.forks || 0}</span>
            </button>

            <button onclick="app.toggleStar()" class="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium ${isStarred ? 'bg-amber-900/30 text-amber-300 border-amber-600' : 'bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]'} border rounded-md transition">
              <svg class="w-3.5 h-3.5 ${isStarred ? 'fill-amber-400 text-amber-400' : ''}" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"></path></svg>
              ${isStarred ? 'Starred' : 'Star'} <span class="bg-[#30363d] px-1.5 py-0.5 rounded-full text-[10px]">${this.activeRepo.stars || 0}</span>
            </button>
          </div>
        </div>

        <!-- Repository Nav Tabs -->
        <nav class="flex space-x-2 mt-2 overflow-x-auto text-sm border-b border-[#30363d]">
          ${this.renderTabButton('code', 'Code', 'M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L14.94 8l-3.66-3.72a.75.75 0 010-1.06z')}
          ${this.renderTabButton('issues', 'Issues', 'M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z', 'issuesCount')}
          ${this.renderTabButton('pulls', 'Pull requests', 'M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v4.256a2.251 2.251 0 11-1.5 0V6.5a2.5 2.5 0 00-2.5-2.5h-.5V2.5z', 'prsCount')}
          ${this.renderTabButton('actions', 'Actions', 'M8 0a8 8 0 100 16A8 8 0 008 0zm-1.5 4.5a.5.5 0 01.764-.424l5 3.5a.5.5 0 010 .848l-5 3.5A.5.5 0 016.5 11.5v-7z', 'actionsCount', 'text-purple-400')}
          ${this.renderTabButton('kdd-board', 'KDD-Board', 'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm1.5 0v12.5c0 .138.112.25.25.25H5v-13H1.75a.25.25 0 00-.25.25zm5 12.75h3v-13h-3v13zm4.5 0h3.25a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H11v13z', null, 'text-emerald-400')}
          ${this.renderTabButton('contracts', 'Contracts & OKF', 'M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zM4 4.5h8v1.5H4V4.5zm0 3h8V9H4V7.5zm0 3h5V12H4v-1.5z', null, 'text-cyan-400')}
          ${this.renderTabButton('commits', 'Commits', 'M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-2.75z')}
          ${this.renderTabButton('settings', 'Settings', 'M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-2.75z')}
        </nav>
      </div>
    `;
  }

  renderTabButton(id, label, iconSvg, countKey = null, accentClass = '') {
    const isActive = this.currentTab === id;
    const borderStyle = isActive ? 'border-b-2 border-[#f78166] text-white font-semibold' : 'text-[#8b949e] hover:text-[#c9d1d9] hover:border-b-2 hover:border-[#8b949e]';
    return `
      <button onclick="app.switchTab('${id}')" class="flex items-center gap-2 px-3 py-2.5 transition -mb-px ${borderStyle} ${accentClass}">
        <svg class="w-4 h-4 opacity-80" viewBox="0 0 16 16" fill="currentColor">${iconSvg}</svg>
        <span>${label}</span>
        ${countKey ? `<span id="${countKey}" class="bg-[#30363d] text-gray-300 text-[11px] font-semibold px-2 py-0.5 rounded-full">...</span>` : ''}
      </button>
    `;
  }

  async renderContentArea() {
    const area = document.getElementById('content-area');
    if (!area) return;

    // Update counts asynchronously
    this.updateTabCounts();

    switch (this.currentTab) {
      case 'code':
        area.innerHTML = await this.renderCodeView();
        break;
      case 'issues':
        area.innerHTML = await this.renderIssuesView();
        break;
      case 'pulls':
        area.innerHTML = await this.renderPullRequestsView();
        break;
      case 'actions':
        area.innerHTML = await this.renderActionsView();
        break;
      case 'kdd-board':
        area.innerHTML = await this.renderKddBoardView();
        break;
      case 'contracts':
        area.innerHTML = await this.renderContractsView();
        break;
      case 'commits':
        area.innerHTML = await this.renderCommitsView();
        break;
      case 'settings':
        area.innerHTML = await this.renderSettingsView();
        break;
      default:
        area.innerHTML = await this.renderCodeView();
    }

    this.onContentSwapped(area);
  }

  async updateTabCounts() {
    const issues = await this.store.getIssues(this.activeRepo.id, 'open');
    const prs = await this.store.getPullRequests(this.activeRepo.id, 'open');
    const runs = await this.store.getWorkflowRuns(this.activeRepo.id);
    const issuesEl = document.getElementById('issuesCount');
    const prsEl = document.getElementById('prsCount');
    const actionsEl = document.getElementById('actionsCount');
    if (issuesEl) issuesEl.textContent = issues.length;
    if (prsEl) prsEl.textContent = prs.length;
    if (actionsEl) actionsEl.textContent = runs.length;
  }

  // --- Code View & File Browser ---
  async renderCodeView() {
    const allFiles = await this.store.getFiles(this.activeRepo.id, this.currentBranch);
    
    // Check if we are viewing a single file (blob)
    if (this.currentPath) {
      const file = allFiles.find(f => f.path === this.currentPath);
      if (file) {
        return this.renderBlobView(file);
      }
    }

    // Otherwise render directory tree
    const tree = this.git.buildTree(allFiles, this.currentPath);
    const commits = await this.store.getCommits(this.activeRepo.id, this.currentBranch);
    const latestCommit = commits[0] || { message: 'Initial commit', author: 'user', timestamp: new Date().toISOString() };

    // Check if README.md exists in current folder
    const readmeFile = allFiles.find(f => f.path.toLowerCase() === (this.currentPath ? `${this.currentPath}/readme.md` : 'readme.md'));

    return `
      <div class="space-y-4">
        <!-- Branch selector & Actions Bar -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <!-- Branch Dropdown -->
            <div class="relative inline-block text-left" id="branch-dropdown-wrapper">
              <button onclick="app.toggleBranchMenu()" class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] rounded-md transition">
                <svg class="w-3.5 h-3.5 text-gray-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"></path></svg>
                <span>${this.currentBranch}</span>
                <svg class="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
              <div id="branch-menu" class="hidden absolute left-0 mt-1 w-56 bg-[#161b22] border border-[#30363d] rounded-md shadow-2xl z-30 py-1 text-xs">
                <div class="px-3 py-1.5 font-bold text-gray-400 border-b border-[#30363d]">Switch branches</div>
                <div class="max-h-48 overflow-y-auto py-1">
                  ${this.activeRepo.branches.map(b => `
                    <button onclick="app.switchBranch('${b}')" class="w-full text-left px-3 py-1.5 hover:bg-[#1f242c] flex items-center justify-between text-gray-200">
                      <span>${b}</span>
                      ${b === this.currentBranch ? '<span class="text-blue-400">✓</span>' : ''}
                    </button>
                  `).join('')}
                </div>
                <div class="p-2 border-t border-[#30363d]">
                  <input id="new-branch-input" placeholder="New branch name..." class="w-full bg-[#0d1117] border border-[#30363d] px-2 py-1 rounded text-xs text-white focus:outline-none focus:border-blue-500" />
                  <button onclick="app.createNewBranch()" class="w-full mt-1.5 bg-blue-600 hover:bg-blue-500 text-white py-1 rounded font-semibold text-[11px]">Create branch</button>
                </div>
              </div>
            </div>

            <!-- Breadcrumbs -->
            <div class="flex items-center gap-1.5 text-sm font-mono text-gray-300">
              <span class="text-blue-400 hover:underline cursor-pointer" onclick="app.navigatePath('')">${this.activeRepo.name}</span>
              ${tree.breadcrumbs.map((seg, idx) => {
                const subPath = tree.breadcrumbs.slice(0, idx + 1).join('/');
                return `
                  <span class="text-gray-500">/</span>
                  <span class="text-blue-400 hover:underline cursor-pointer" onclick="app.navigatePath('${subPath}')">${seg}</span>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Code Action Buttons -->
          <div class="flex items-center gap-2">
            <button onclick="app.openNewFileModal()" class="px-3 py-1.5 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border border-[#30363d] rounded-md transition flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
              Add file
            </button>
            <button onclick="app.openCloneModal()" class="px-3 py-1.5 text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition flex items-center gap-1.5">
              <svg class="w-3 h-3" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 11-1.06-1.06L14.94 8l-3.66-3.72a.75.75 0 010-1.06z"></path></svg>
              Code
            </button>
          </div>
        </div>

        <!-- Latest Commit Bar -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-t-md px-4 py-2.5 flex items-center justify-between text-xs text-gray-300">
          <div class="flex items-center gap-2 truncate">
            <span class="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">${(latestCommit.author || 'U')[0]}</span>
            <span class="font-semibold text-white">${latestCommit.author}</span>
            <span class="text-gray-400 truncate">${latestCommit.message}</span>
          </div>
          <div class="flex items-center gap-3 text-gray-400 shrink-0 font-mono text-[11px]">
            <span>${latestCommit.id || 'c1a9f02'}</span>
            <span>${this.timeAgo(latestCommit.timestamp)}</span>
          </div>
        </div>

        <!-- File Tree Table -->
        <div class="bg-[#0d1117] border-x border-b border-[#30363d] rounded-b-md overflow-hidden text-xs">
          ${this.currentPath ? `
            <div onclick="app.navigateUp()" class="px-4 py-2.5 hover:bg-[#161b22] cursor-pointer flex items-center gap-3 text-blue-400 border-b border-[#21262d]">
              <span class="font-bold">..</span>
              <span class="text-gray-500 font-normal">Go up one directory</span>
            </div>
          ` : ''}

          ${tree.items.map(item => `
            <div onclick="app.navigatePath('${item.fullPath}')" class="px-4 py-2.5 hover:bg-[#161b22] cursor-pointer flex items-center justify-between border-b border-[#21262d] transition group">
              <div class="flex items-center gap-3">
                ${item.type === 'dir' ? `
                  <svg class="w-4 h-4 text-blue-400" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z"></path></svg>
                ` : `
                  <svg class="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V1.75z"></path></svg>
                `}
                <span class="text-white group-hover:text-blue-400 group-hover:underline font-mono">${item.name}</span>
              </div>
              <div class="flex items-center gap-4 text-gray-500 text-[11px]">
                ${item.type === 'file' ? `<span>${(item.size / 1024).toFixed(1)} KB</span>` : `<span class="italic">${item.itemCount} items</span>`}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Render README.md below tree if present -->
        ${readmeFile ? this.renderInlineReadme(readmeFile) : ''}
      </div>
    `;
  }

  // --- Blob (File View) ---
  renderBlobView(file) {
    const isMd = file.path.toLowerCase().endsWith('.md');
    const lang = this.git.detectLanguage(file.path);
    const lineCount = file.content ? file.content.split('\n').length : 0;
    const sizeKB = (new Blob([file.content]).size / 1024).toFixed(2);

    const { frontmatter, hasFrontmatter } = this.kdd.parseOKFNode(file.content);

    return `
      <div class="space-y-4">
        <!-- File Header Breadcrumbs & Controls -->
        <div class="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div class="flex items-center gap-1.5 font-mono text-gray-300">
            <span class="text-blue-400 hover:underline cursor-pointer" onclick="app.navigatePath('')">${this.activeRepo.name}</span>
            <span class="text-gray-500">/</span>
            <span class="font-bold text-white">${file.path}</span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="app.openEditFileModal('${file.path}')" class="px-2.5 py-1 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] rounded transition flex items-center gap-1">
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM10.05 4.51L8.61 3.07 2.94 8.74a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.245.245 0 00.108-.064l5.67-5.67z"></path></svg>
              Edit
            </button>
            <button onclick="app.copyFileContent()" class="px-2.5 py-1 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] rounded transition">Copy raw</button>
            <button onclick="app.deleteCurrentFile('${file.path}')" class="px-2.5 py-1 text-xs font-semibold bg-red-900/30 hover:bg-red-800/40 text-red-300 border border-red-700/50 rounded transition">Delete</button>
          </div>
        </div>

        <!-- OKF Node Metadata Card (If Applicable) -->
        ${hasFrontmatter && frontmatter ? `
          <div class="bg-[#161b22] border border-cyan-800/50 rounded-md p-4 text-xs">
            <div class="flex items-center justify-between pb-2 border-b border-[#30363d]">
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-cyan-900/40 text-cyan-300 border border-cyan-700 font-bold uppercase tracking-wider text-[10px]">OKF Node: ${frontmatter.type || 'Standard'}</span>
                <span class="font-bold text-white text-sm">${frontmatter.title || file.path}</span>
              </div>
              <div class="flex items-center gap-1">
                ${(frontmatter.tags || []).map(t => `<span class="bg-[#21262d] text-gray-300 px-2 py-0.5 rounded-full border border-[#30363d] text-[10px]">#${t}</span>`).join('')}
              </div>
            </div>
            ${frontmatter.description ? `<p class="mt-2 text-gray-300">${frontmatter.description}</p>` : ''}
            
            ${frontmatter.type === 'Task Contract' ? `
              <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#30363d] font-mono text-[11px]">
                <div class="bg-[#0d1117] p-2 rounded border border-[#21262d]">
                  <span class="text-gray-500 block text-[10px]">Target:</span>
                  <span class="text-blue-400 truncate block">${frontmatter.target || 'None'}</span>
                </div>
                <div class="bg-[#0d1117] p-2 rounded border border-[#21262d]">
                  <span class="text-gray-500 block text-[10px]">Test Oracle:</span>
                  <span class="text-emerald-400 truncate block">${frontmatter.tests || 'None'}</span>
                </div>
                <div class="bg-[#0d1117] p-2 rounded border border-[#21262d]">
                  <span class="text-gray-500 block text-[10px]">Complexity Budget:</span>
                  <span class="text-amber-400 font-bold">${frontmatter.budget?.max_cyclomatic_complexity || 'N/A'}</span>
                </div>
                <div class="bg-[#0d1117] p-2 rounded border border-[#21262d] flex items-center justify-center">
                  <button onclick="app.validateContractDirectly('${file.path}')" class="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-sans font-bold py-1 px-2 rounded text-xs transition">
                    Run CCDD Gate
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Code Box Container -->
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2 border-b border-[#30363d] flex items-center justify-between text-xs text-gray-400">
            <span>${lineCount} lines &middot; ${sizeKB} KB</span>
            <span class="font-mono uppercase text-[10px] text-gray-500">${lang}</span>
          </div>

          ${isMd ? `
            <div class="p-6 prose prose-invert max-w-none text-sm leading-relaxed" id="markdown-viewer">
              ${marked.parse(file.content || '')}
            </div>
          ` : `
            <div class="overflow-x-auto text-xs font-mono p-4">
              <pre><code class="language-${lang}">${this.escapeHtml(file.content || '')}</code></pre>
            </div>
          `}
        </div>
      </div>
    `;
  }

  renderInlineReadme(readmeFile) {
    return `
      <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117] mt-6">
        <div class="bg-[#161b22] px-4 py-2 border-b border-[#30363d] flex items-center gap-2 text-xs font-bold text-white">
          <svg class="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"></path></svg>
          <span>README.md</span>
        </div>
        <div class="p-6 prose prose-invert max-w-none text-sm leading-relaxed" id="readme-preview">
          ${marked.parse(readmeFile.content || '')}
        </div>
      </div>
    `;
  }

  // --- Issues View ---
  async renderIssuesView() {
    const issues = await this.store.getIssues(this.activeRepo.id, 'all');
    return `
      <div class="space-y-4">
        <!-- Search & New Issue Bar -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 max-w-lg">
            <input type="text" placeholder="is:issue is:open " class="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          <button onclick="app.openNewIssueModal()" class="px-3 py-1.5 text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition">
            New issue
          </button>
        </div>

        <!-- Issues List Box -->
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] flex items-center justify-between text-xs text-gray-400">
            <div class="flex items-center gap-4">
              <span class="font-bold text-white flex items-center gap-1.5">
                <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path><path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path></svg>
                ${issues.filter(i => i.state === 'open').length} Open
              </span>
              <span class="hover:text-white cursor-pointer">${issues.filter(i => i.state === 'closed').length} Closed</span>
            </div>
          </div>

          <div class="divide-y divide-[#21262d]">
            ${issues.length === 0 ? `
              <div class="p-8 text-center text-gray-400 text-xs">No issues found. Create one!</div>
            ` : issues.map(issue => `
              <div class="px-4 py-3 hover:bg-[#161b22] flex items-start gap-3 transition">
                <svg class="w-4 h-4 mt-0.5 ${issue.state === 'open' ? 'text-emerald-400' : 'text-purple-400'} shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path>
                </svg>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-white hover:text-blue-400 cursor-pointer" onclick="app.viewIssue('${issue.id}')">${issue.title}</span>
                    ${(issue.labels || []).map(l => `
                      <span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-800">${l}</span>
                    `).join('')}
                  </div>
                  <div class="text-xs text-gray-500 mt-1">
                    #${issue.number} opened ${this.timeAgo(issue.createdAt)} by <span class="text-gray-400">${issue.author}</span>
                  </div>
                </div>
                ${issue.commentsCount ? `
                  <div class="text-gray-500 text-xs flex items-center gap-1">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M2.75 2.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75zM1 2.75C1 1.784 1.784 1 2.75 1h9.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0112.25 12h-4.063l-3.38 3.38A.75.75 0 013.5 14.85v-2.85H2.75A1.75 1.75 0 011 10.25v-7.5z"></path></svg>
                    <span>${issue.commentsCount}</span>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- Pull Requests View ---
  async renderPullRequestsView() {
    const prs = await this.store.getPullRequests(this.activeRepo.id, 'all');
    return `
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1 max-w-lg">
            <input type="text" placeholder="is:pr is:open " class="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          <button onclick="app.openNewPrModal()" class="px-3 py-1.5 text-xs font-semibold bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition">
            New pull request
          </button>
        </div>

        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] text-xs font-bold text-white flex items-center gap-2">
            <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 16 16" fill="currentColor"><path d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354z"></path></svg>
            ${prs.length} Pull Requests
          </div>
          <div class="divide-y divide-[#21262d]">
            ${prs.map(pr => `
              <div class="px-4 py-3 hover:bg-[#161b22] flex items-start gap-3 transition">
                <svg class="w-4 h-4 text-emerald-400 mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25z"></path></svg>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-semibold text-white hover:text-blue-400 cursor-pointer" onclick="app.viewPrDiff('${pr.id}')">${pr.title}</div>
                  <div class="text-xs text-gray-500 mt-1 font-mono">
                    #${pr.number} &middot; <span class="bg-[#21262d] px-1.5 py-0.5 rounded text-gray-300">${pr.sourceBranch}</span> into <span class="bg-[#21262d] px-1.5 py-0.5 rounded text-gray-300">${pr.targetBranch}</span>
                  </div>
                </div>
                <button onclick="app.viewPrDiff('${pr.id}')" class="px-2.5 py-1 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-blue-400 border border-[#30363d] rounded">
                  Inspect Diff
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- KDD Actions (Client-Side CI/CD Workflows) View ---
  async renderActionsView() {
    const runs = await this.store.getWorkflowRuns(this.activeRepo.id);
    const workflows = window.actionsEngine ? await window.actionsEngine.getWorkflows(this.activeRepo.id, this.currentBranch) : [];

    // If viewing a specific run
    if (this.selectedWorkflowRunId) {
      const run = runs.find(r => r.id === this.selectedWorkflowRunId) || await this.store.getWorkflowRun(this.selectedWorkflowRunId);
      if (run) {
        return this.renderWorkflowRunDetailView(run);
      }
      this.selectedWorkflowRunId = null;
    }

    return `
      <div class="space-y-4">
        <!-- Actions Top Banner -->
        <div class="bg-gradient-to-r from-purple-950/40 via-[#161b22] to-blue-950/40 border border-purple-800/40 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-purple-400 uppercase tracking-wider">KDD Actions &middot; Client-Side CI/CD Runner</span>
              <span class="text-[10px] bg-purple-900/50 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700">100% In-Browser &middot; 0 Cloud Servers</span>
            </div>
            <p class="text-xs text-gray-300 mt-1">Executes deterministic validation pipelines (OKF structure, CCDD task contracts, cyclomatic complexity budget, perimeter audit, and frozen test oracles) entirely client-side.</p>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="app.openRunWorkflowModal()" class="px-3.5 py-1.5 text-xs font-bold bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition flex items-center gap-1.5 shadow-sm">
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm-1.5 4.5a.5.5 0 01.764-.424l5 3.5a.5.5 0 010 .848l-5 3.5A.5.5 0 016.5 11.5v-7z"></path></svg>
              Run workflow
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- Left: Workflows list -->
          <div class="md:col-span-1 space-y-2">
            <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
              <div class="bg-[#161b22] px-3 py-2 border-b border-[#30363d] text-xs font-bold text-white flex items-center justify-between">
                <span>Workflows</span>
                <span class="text-[10px] font-mono text-gray-400">${workflows.length}</span>
              </div>
              <div class="divide-y divide-[#21262d] text-xs">
                ${workflows.map(wf => `
                  <div class="p-3 hover:bg-[#161b22] cursor-pointer transition" onclick="app.openRunWorkflowModal('${wf.name}')">
                    <div class="font-semibold text-white flex items-center gap-1.5">
                      <svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zm-1.5 4.5a.5.5 0 01.764-.424l5 3.5a.5.5 0 010 .848l-5 3.5A.5.5 0 016.5 11.5v-7z"></path></svg>
                      ${wf.name}
                    </div>
                    <div class="text-[11px] font-mono text-gray-500 mt-1 truncate">${wf.path}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Right: Workflow Runs history -->
          <div class="md:col-span-3">
            <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
              <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] text-xs font-bold text-white flex items-center justify-between">
                <span>All workflow runs (${runs.length})</span>
                <span class="text-[11px] font-mono text-gray-400">Branch: ${this.currentBranch}</span>
              </div>
              ${runs.length === 0 ? `
                <div class="p-8 text-center text-xs text-gray-400 space-y-2">
                  <p>No workflow runs have been triggered yet for this repository.</p>
                  <button onclick="app.openRunWorkflowModal()" class="text-blue-400 hover:underline">Trigger your first client-side CI run &rarr;</button>
                </div>
              ` : `
                <div class="divide-y divide-[#21262d]">
                  ${runs.map(r => `
                    <div class="p-3.5 hover:bg-[#161b22] flex items-center justify-between gap-3 text-xs transition cursor-pointer" onclick="app.viewWorkflowRun('${r.id}')">
                      <div class="flex items-start gap-3 min-w-0">
                        ${this.renderRunStatusIcon(r.status, r.conclusion)}
                        <div class="min-w-0">
                          <div class="font-semibold text-white hover:text-blue-400 truncate flex items-center gap-2">
                            <span>${r.commitMessage || r.workflowName}</span>
                            <span class="text-[10px] font-mono font-normal px-1.5 py-0.5 rounded bg-[#21262d] text-gray-400 border border-[#30363d]">${r.workflowName}</span>
                          </div>
                          <div class="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-2 font-mono">
                            <span class="text-gray-400">${r.event}</span>
                            <span>&middot;</span>
                            <span class="text-blue-400">${r.branch}</span>
                            <span>&middot;</span>
                            <span class="text-gray-400">${r.commitId ? r.commitId.substring(0, 7) : 'head'}</span>
                            <span>&middot;</span>
                            <span class="text-gray-500">${this.timeAgo(r.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div class="text-right shrink-0 font-mono text-[11px] text-gray-400">
                        <div>${r.duration || '0s'}</div>
                        <div class="text-[10px] text-gray-500">${r.author || 'KDD Actions'}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderWorkflowRunDetailView(run) {
    const isRunning = run.status === 'in_progress';
    return `
      <div class="space-y-4">
        <!-- Detail Header Breadcrumb & Actions -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#30363d]">
          <div class="flex items-center gap-2">
            <button onclick="app.viewAllWorkflowRuns()" class="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold">
              &larr; All runs
            </button>
            <span class="text-gray-500">/</span>
            <div class="flex items-center gap-2">
              ${this.renderRunStatusIcon(run.status, run.conclusion)}
              <h2 class="text-sm font-bold text-white">${run.commitMessage || run.workflowName}</h2>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262d] text-gray-300 border border-[#30363d]">${run.workflowName}</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="app.rerunWorkflow('${run.id}')" ${isRunning ? 'disabled' : ''} class="px-2.5 py-1 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-gray-200 border border-[#30363d] rounded transition flex items-center gap-1 disabled:opacity-50">
              <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0 5.5 5.5 0 00-5.5-5.5z"></path></svg>
              Re-run workflow
            </button>
          </div>
        </div>

        <!-- Run Metadata Bar -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-md p-3 text-xs flex flex-wrap items-center justify-between gap-4 font-mono">
          <div class="flex items-center gap-3">
            <span class="text-gray-400">Branch: <span class="text-blue-400 font-bold">${run.branch}</span></span>
            <span class="text-gray-500">&middot;</span>
            <span class="text-gray-400">Commit: <span class="text-white">${run.commitId ? run.commitId.substring(0, 7) : 'head'}</span></span>
            <span class="text-gray-500">&middot;</span>
            <span class="text-gray-400">Trigger: <span class="text-purple-400">${run.event}</span></span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-gray-400">Duration: <span class="text-white font-bold" id="run-duration-display">${run.duration}</span></span>
            <span class="text-gray-500">&middot;</span>
            <span class="text-gray-400">Started: <span class="text-gray-300">${new Date(run.createdAt).toLocaleTimeString()}</span></span>
          </div>
        </div>

        <!-- 2-Column Runner Grid: Steps & Real-Time Streaming Logs -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- Left: 7 Steps List -->
          <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
            <div class="bg-[#161b22] px-3.5 py-2 border-b border-[#30363d] text-xs font-bold text-white flex items-center justify-between">
              <span>Deterministic Gate Steps</span>
              <span class="text-[10px] font-mono text-purple-400">7 Steps</span>
            </div>
            <div class="divide-y divide-[#21262d] text-xs" id="actions-step-list">
              ${(run.steps || []).map((step, idx) => `
                <div class="p-3 flex items-center justify-between gap-2 ${step.status === 'in_progress' ? 'bg-blue-950/20' : ''}">
                  <div class="flex items-center gap-2.5 min-w-0">
                    ${this.renderStepStatusIcon(step.status, step.conclusion)}
                    <span class="font-medium text-gray-200 truncate">${step.name}</span>
                  </div>
                  <span class="font-mono text-[11px] text-gray-500 shrink-0">${step.duration || '0s'}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Right: Streaming Terminal Logs Box -->
          <div class="lg:col-span-2 border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117] flex flex-col">
            <div class="bg-[#161b22] px-3.5 py-2 border-b border-[#30363d] text-xs font-bold text-white flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-blue-400 animate-ping' : (run.conclusion === 'success' ? 'bg-emerald-500' : 'bg-red-500')}"></span>
                <span class="font-mono text-gray-300">Terminal Log Output</span>
              </div>
              <button onclick="app.copyRunLogs()" class="text-xs text-gray-400 hover:text-white font-mono flex items-center gap-1">
                Copy raw
              </button>
            </div>
            <div class="p-4 overflow-y-auto max-h-[500px] min-h-[350px] font-mono text-xs text-gray-300 leading-relaxed bg-[#0a0d12]" id="actions-terminal-logs">
              <pre class="whitespace-pre-wrap select-text">${this.formatTerminalLogs(run.logs || '')}</pre>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderRunStatusIcon(status, conclusion) {
    if (status === 'in_progress') {
      return `<svg class="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>`;
    }
    if (conclusion === 'success') {
      return `<svg class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-3.97-3.03a.75.75 0 00-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 00-1.06 1.06L6.97 11.03a.75.75 0 001.079-.02l3.992-4.99a.75.75 0 00-.01-1.05z"></path></svg>`;
    }
    if (conclusion === 'failure') {
      return `<svg class="w-4 h-4 text-red-400 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-4.72-2.28a.75.75 0 00-1.06 0L8 7.94 5.78 5.72a.75.75 0 00-1.06 1.06L6.94 9l-2.22 2.22a.75.75 0 101.06 1.06L8 10.06l2.22 2.22a.75.75 0 001.06-1.06L9.06 9l2.22-2.22a.75.75 0 000-1.06z"></path></svg>`;
    }
    return `<svg class="w-4 h-4 text-gray-500 shrink-0 mt-0.5" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v3.5c0 .414.336.75.75.75h2.5a.75.75 0 000-1.5h-1.75v-2.75z"></path></svg>`;
  }

  renderStepStatusIcon(status, conclusion) {
    if (status === 'in_progress') {
      return `<svg class="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>`;
    }
    if (conclusion === 'success') {
      return `<svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path></svg>`;
    }
    if (conclusion === 'failure') {
      return `<svg class="w-3.5 h-3.5 text-red-400 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"></path></svg>`;
    }
    return `<span class="w-3.5 h-3.5 rounded-full border border-gray-600 inline-block shrink-0"></span>`;
  }

  formatTerminalLogs(logs) {
    if (!logs) return '';
    return logs
      .replace(/\[INFO\]/g, '<span class="text-cyan-400 font-bold">[INFO]</span>')
      .replace(/\[PASS\]/g, '<span class="text-emerald-400 font-bold">[PASS]</span>')
      .replace(/\[FAIL\]/g, '<span class="text-red-400 font-bold">[FAIL]</span>')
      .replace(/\[SUCCESS\]/g, '<span class="text-emerald-300 font-bold bg-emerald-950/80 px-1 rounded">[SUCCESS]</span>')
      .replace(/\[FAILURE\]/g, '<span class="text-red-300 font-bold bg-red-950/80 px-1 rounded">[FAILURE]</span>');
  }

  // --- KDD-Board (Kanban) View ---
  async renderKddBoardView() {
    const cards = await this.store.getKddCards(this.activeRepo.id);
    const columns = this.kdd.getBoardColumns();

    return `
      <div class="space-y-4">
        <!-- KDD Banner -->
        <div class="bg-gradient-to-r from-emerald-950/40 via-[#161b22] to-cyan-950/40 border border-emerald-800/40 rounded-md p-4 flex items-center justify-between">
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">KDD-Board &middot; Knowledge-Driven Development</span>
              <span class="text-[10px] bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700">Deterministic Gates Active</span>
            </div>
            <p class="text-xs text-gray-300 mt-1">Govern ephemeral AI agents via OKF + CCDD contracts. No LLM judging — strict deterministic gates.</p>
          </div>
          <button onclick="app.openNewKddCardModal()" class="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white rounded-md transition shrink-0">
            + New Contract Card
          </button>
        </div>

        <!-- 5-Stage Kanban Grid -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3 overflow-x-auto pb-4">
          ${columns.map(col => {
            const colCards = cards.filter(c => c.column === col.id);
            return `
              <div class="bg-[#161b22] border border-[#30363d] rounded-md flex flex-col min-w-[220px]">
                <div class="px-3 py-2 border-b border-[#30363d] flex items-center justify-between bg-[#21262d]/50">
                  <span class="text-xs font-bold ${col.color}">${col.title}</span>
                  <span class="bg-[#30363d] text-gray-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full">${colCards.length}</span>
                </div>

                <div class="p-2 space-y-2 flex-1 min-h-[350px]">
                  ${colCards.map(card => `
                    <div class="bg-[#0d1117] border border-[#30363d] hover:border-blue-500 rounded p-3 text-xs shadow transition group">
                      <div class="flex items-center justify-between mb-1.5">
                        <span class="font-mono text-[10px] text-gray-400">task: ${card.task}</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          card.gateStatus === 'passed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          card.gateStatus === 'action_required' ? 'bg-purple-950 text-purple-400 border border-purple-800' :
                          'bg-amber-950 text-amber-400 border border-amber-800'
                        }">${card.gateStatus.toUpperCase()}</span>
                      </div>

                      <div class="font-semibold text-white text-xs mb-2">${card.title}</div>

                      <div class="space-y-1 font-mono text-[10px] text-gray-400 pb-2 border-b border-[#21262d]">
                        <div class="flex items-center justify-between">
                          <span>Agent:</span>
                          <span class="text-cyan-400 truncate max-w-[120px]">${card.assignedAgent || 'unassigned'}</span>
                        </div>
                        <div class="flex items-center justify-between">
                          <span>Complexity:</span>
                          <span class="${card.complexity > card.maxComplexity ? 'text-red-400 font-bold' : 'text-gray-300'}">${card.complexity}/${card.maxComplexity}</span>
                        </div>
                      </div>

                      <!-- Card Actions -->
                      <div class="mt-2.5 flex items-center justify-between gap-1">
                        <button onclick="app.runCardGate('${card.id}')" class="text-[10px] bg-[#21262d] hover:bg-[#30363d] text-cyan-300 px-2 py-1 rounded border border-[#30363d]">
                          Run Gate
                        </button>
                        <select onchange="app.moveKddCard('${card.id}', this.value)" class="bg-[#0d1117] text-gray-300 border border-[#30363d] rounded text-[10px] px-1 py-0.5">
                          ${columns.map(c => `
                            <option value="${c.id}" ${c.id === card.column ? 'selected' : ''}>${c.title}</option>
                          `).join('')}
                        </select>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // --- Contracts & OKF Auditor View ---
  async renderContractsView() {
    const allFiles = await this.store.getFiles(this.activeRepo.id, this.currentBranch);
    const contractFiles = allFiles.filter(f => f.path.startsWith('knowledge/contracts/') && f.path.endsWith('.md'));
    const okfFiles = allFiles.filter(f => f.path.startsWith('knowledge/') && !f.path.startsWith('knowledge/contracts/') && f.path.endsWith('.md'));

    return `
      <div class="space-y-6">
        <!-- Intro Header -->
        <div class="bg-[#161b22] border border-[#30363d] rounded-md p-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 16 16" fill="currentColor"><path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75z"></path></svg>
            OKF & CCDD Contracts Auditor (KDD Gate Engine)
          </h3>
          <p class="text-xs text-gray-300 mt-1">
            Deterministic validation verifying YAML frontmatter, cyclomatic complexity budget, dependency perimeters, and frozen test oracle integrity without external AI judging.
          </p>
        </div>

        <!-- Task Contracts Section -->
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] flex items-center justify-between text-xs font-bold text-white">
            <span>CCDD Task Contracts (${contractFiles.length})</span>
            <button onclick="app.validateAllContracts()" class="text-xs bg-cyan-700 hover:bg-cyan-600 text-white px-2.5 py-1 rounded font-semibold transition">
              Validate All
            </button>
          </div>

          <div class="divide-y divide-[#21262d]">
            ${contractFiles.map(cf => {
              const { frontmatter } = this.kdd.parseOKFNode(cf.content);
              return `
                <div class="p-4 hover:bg-[#161b22]/50 transition flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-white text-sm hover:underline cursor-pointer" onclick="app.navigatePath('${cf.path}')">${frontmatter?.title || cf.path}</span>
                      <span class="font-mono text-[10px] text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">${cf.path}</span>
                    </div>
                    <p class="text-gray-400">${frontmatter?.description || 'No description'}</p>
                    <div class="flex items-center gap-4 text-[11px] font-mono text-gray-500 pt-1">
                      <span>Target: <span class="text-gray-300">${frontmatter?.target || 'N/A'}</span></span>
                      <span>Oracle: <span class="text-gray-300">${frontmatter?.tests || 'N/A'}</span></span>
                      <span>Max Complexity: <span class="text-amber-400">${frontmatter?.budget?.max_cyclomatic_complexity || 'N/A'}</span></span>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <button onclick="app.validateContractDirectly('${cf.path}')" class="bg-[#21262d] hover:bg-[#30363d] text-cyan-300 border border-cyan-700/50 px-3 py-1.5 rounded font-semibold transition">
                      Run Deterministic Gate
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- General OKF Knowledge Nodes -->
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] text-xs font-bold text-white">
            OKF Normative Nodes (${okfFiles.length})
          </div>
          <div class="divide-y divide-[#21262d]">
            ${okfFiles.map(of => `
              <div class="px-4 py-3 hover:bg-[#161b22]/50 flex items-center justify-between text-xs cursor-pointer" onclick="app.navigatePath('${of.path}')">
                <div class="flex items-center gap-2">
                  <svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M3.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75z"></path></svg>
                  <span class="font-mono text-white">${of.path}</span>
                </div>
                <span class="text-gray-500 font-mono text-[11px]">${(new Blob([of.content]).size / 1024).toFixed(1)} KB</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- Commits View ---
  async renderCommitsView() {
    const commits = await this.store.getCommits(this.activeRepo.id, this.currentBranch);
    return `
      <div class="space-y-4">
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117]">
          <div class="bg-[#161b22] px-4 py-2.5 border-b border-[#30363d] text-xs font-bold text-white flex items-center gap-2">
            <svg class="w-4 h-4 text-gray-400" viewBox="0 0 16 16" fill="currentColor"><path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0z"></path></svg>
            Commit History (${commits.length})
          </div>
          <div class="divide-y divide-[#21262d]">
            ${commits.map(c => `
              <div class="px-4 py-3 hover:bg-[#161b22] flex items-center justify-between text-xs transition">
                <div class="space-y-1">
                  <div class="font-semibold text-white">${c.message}</div>
                  <div class="text-gray-500 text-[11px]">
                    <span class="text-gray-300 font-medium">${c.author}</span> committed ${this.timeAgo(c.timestamp)}
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-blue-400 bg-[#161b22] border border-[#30363d] px-2 py-0.5 rounded text-[11px]">${c.id}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // --- Settings View ---
  async renderSettingsView() {
    return `
      <div class="space-y-6 max-w-4xl">
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117] p-6 space-y-4">
          <h3 class="text-base font-semibold text-white">Repository Settings</h3>
          <p class="text-xs text-gray-400">Manage client-side configuration, local persistence, and WebMCP interoperability.</p>
          
          <div class="pt-4 border-t border-[#30363d] flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold text-white">Export Database Backup</div>
              <div class="text-xs text-gray-400">Download complete IndexedDB state (repositories, commits, files, issues, contracts) as JSON.</div>
            </div>
            <button onclick="app.downloadBackup()" class="px-3 py-1.5 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] rounded-md">
              Download JSON
            </button>
          </div>

          <div class="pt-4 border-t border-[#30363d] flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold text-white">Import Database Backup</div>
              <div class="text-xs text-gray-400">Restore client-side state from an exported JSON file.</div>
            </div>
            <label class="px-3 py-1.5 text-xs font-semibold bg-[#21262d] hover:bg-[#30363d] text-white border border-[#30363d] rounded-md cursor-pointer">
              Upload JSON
              <input type="file" accept=".json" onchange="app.handleBackupUpload(event)" class="hidden" />
            </label>
          </div>

          <div class="pt-4 border-t border-red-900/40 flex items-center justify-between">
            <div>
              <div class="text-sm font-semibold text-red-400">Reset to Seed Data</div>
              <div class="text-xs text-gray-400">Reset IndexedDB storage and reload fresh copies of MauricioPerera/KDD, fastwebmcp, and Hello-World.</div>
            </div>
            <button onclick="app.resetSeedData()" class="px-3 py-1.5 text-xs font-semibold bg-red-900/40 hover:bg-red-800/60 text-red-300 border border-red-700/60 rounded-md">
              Reset Data
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // --- Modal & Drawer Handlers ---
  initNavbar() {
    this.updateRepoDropdown();
  }

  async updateRepoDropdown() {
    const repos = await this.store.getRepositories();
    const dropdown = document.getElementById('global-repo-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = repos.map(r => `
      <option value="${r.owner}/${r.name}" ${r.owner === this.currentOwner && r.name === this.currentRepoName ? 'selected' : ''}>
        ${r.owner}/${r.name}
      </option>
    `).join('');
  }

  handleRepoSelect(val) {
    if (!val) return;
    this.navigate(val);
  }

  navigate(repoSlug) {
    window.location.hash = `#/${repoSlug}`;
  }

  navigatePath(path) {
    window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/tree/${this.currentBranch}/${path}`;
  }

  navigateUp() {
    const parts = this.currentPath.split('/').filter(Boolean);
    parts.pop();
    this.navigatePath(parts.join('/'));
  }

  switchTab(tabId) {
    window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/${tabId}`;
  }

  switchBranch(branchName) {
    this.currentBranch = branchName;
    document.getElementById('branch-menu')?.classList.add('hidden');
    this.navigatePath('');
  }

  toggleBranchMenu() {
    document.getElementById('branch-menu')?.classList.toggle('hidden');
  }

  async createNewBranch() {
    const input = document.getElementById('new-branch-input');
    const name = input?.value.trim();
    if (!name) return;

    try {
      await this.git.createBranch(this.activeRepo, name, this.currentBranch);
      this.toast(`Branch '${name}' created!`);
      this.switchBranch(name);
    } catch (err) {
      alert(err.message);
    }
  }

  async toggleStar() {
    const res = await this.git.toggleStar(this.activeRepo.id);
    if (res) {
      this.activeRepo = res.repo;
      this.renderHeader();
      this.toast(res.isStarred ? 'Starred repository!' : 'Unstarred repository');
    }
  }

  toggleWatch() {
    this.activeRepo.watchers = (this.activeRepo.watchers || 1) + 1;
    this.store.put('repositories', this.activeRepo);
    this.renderHeader();
    this.toast('Watching repository updates');
  }

  async forkRepo() {
    try {
      const forked = await this.git.forkRepository(this.activeRepo.id, 'user');
      this.toast(`Forked to user/${forked.name}!`);
      this.navigate(`user/${forked.name}`);
    } catch (e) {
      alert(e.message);
    }
  }

  // --- KDD Contract Validation Modals ---
  async validateContractDirectly(contractPath) {
    const audit = await this.kdd.validateContract(this.activeRepo.id, contractPath, this.currentBranch);
    this.openAuditReportModal(audit);
  }

  async validateAllContracts() {
    const files = await this.store.getFiles(this.activeRepo.id, this.currentBranch);
    const contracts = files.filter(f => f.path.startsWith('knowledge/contracts/') && f.path.endsWith('.md'));

    const audits = [];
    for (const c of contracts) {
      audits.push(await this.kdd.validateContract(this.activeRepo.id, c.path, this.currentBranch));
    }

    const passedCount = audits.filter(a => a.verdict === 'PASSED').length;
    this.toast(`Audited ${audits.length} contracts: ${passedCount} passed, ${audits.length - passedCount} failed.`);
    this.openAuditReportModal(audits[0] || null, audits);
  }

  async runCardGate(cardId) {
    const card = await this.store.get('kddBoard', cardId);
    if (!card) return;

    const audit = await this.kdd.validateContract(this.activeRepo.id, card.contractPath, this.currentBranch);
    await this.store.updateKddCard(cardId, {
      gateStatus: audit.verdict === 'PASSED' ? 'passed' : 'action_required',
      complexity: audit.complexity || card.complexity
    });
    this.toast(`Gate executed for ${card.task}: ${audit.verdict}`);
    this.openAuditReportModal(audit);
  }

  async moveKddCard(cardId, column) {
    await this.kdd.moveCard(cardId, column);
    this.toast(`Task moved to ${column}`);
    this.renderContentArea();
  }

  // --- WebMCP Playground & Console Modal ---
  openWebMcpPlayground() {
    const modal = document.getElementById('webmcp-modal');
    if (!modal) return;

    const tools = Array.from(this.webmcp.registry.values());
    const toolsListEl = document.getElementById('webmcp-tools-list');
    
    toolsListEl.innerHTML = tools.map((t, idx) => `
      <div onclick="app.selectWebMcpTool('${t.name}')" class="p-2.5 rounded hover:bg-[#21262d] cursor-pointer border border-[#30363d] transition">
        <div class="flex items-center justify-between">
          <span class="font-mono text-xs font-bold text-cyan-400">${t.name}</span>
          ${t.annotations?.readOnlyHint ? '<span class="text-[9px] bg-blue-950 text-blue-300 px-1 rounded">read-only</span>' : '<span class="text-[9px] bg-amber-950 text-amber-300 px-1 rounded">mutating</span>'}
        </div>
        <p class="text-[11px] text-gray-400 mt-1 truncate">${t.description}</p>
      </div>
    `).join('');

    modal.classList.remove('hidden');
    if (tools.length > 0) this.selectWebMcpTool(tools[0].name);
  }

  selectWebMcpTool(toolName) {
    const tool = this.webmcp.registry.get(toolName);
    if (!tool) return;

    document.getElementById('webmcp-selected-name').textContent = tool.name;
    document.getElementById('webmcp-selected-desc').textContent = tool.description;
    document.getElementById('webmcp-schema-view').textContent = JSON.stringify(tool.inputSchema, null, 2);

    // Default sample argument
    let sampleArgs = {};
    if (tool.name === 'list_repositories') sampleArgs = {};
    if (tool.name === 'get_repository') sampleArgs = { owner: this.currentOwner, name: this.currentRepoName };
    if (tool.name === 'get_file') sampleArgs = { owner: this.currentOwner, name: this.currentRepoName, path: 'README.md', branch: 'main' };
    if (tool.name === 'create_issue') sampleArgs = { owner: this.currentOwner, name: this.currentRepoName, title: 'WebMCP Test Issue', body: 'Reported by browser agent.' };
    if (tool.name === 'validate_kdd_contract') sampleArgs = { owner: this.currentOwner, name: this.currentRepoName, contract_path: 'knowledge/contracts/implementar_verify_user.md' };
    if (tool.name === 'get_kdd_board') sampleArgs = { owner: this.currentOwner, name: this.currentRepoName };
    if (tool.name === 'update_kdd_task') sampleArgs = { card_id: 'card-1', column: 'done' };

    document.getElementById('webmcp-input-args').value = JSON.stringify(sampleArgs, null, 2);
    document.getElementById('webmcp-output-view').textContent = '// Click "Invoke Tool" to run...';
  }

  async executeSelectedWebMcpTool() {
    const toolName = document.getElementById('webmcp-selected-name').textContent;
    const rawArgs = document.getElementById('webmcp-input-args').value;
    const outputEl = document.getElementById('webmcp-output-view');

    try {
      const parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
      outputEl.textContent = '// Invoking tool...';
      const response = await this.webmcp.invokeTool(toolName, parsedArgs);
      outputEl.textContent = JSON.stringify(response, null, 2);
      this.toast(`Tool '${toolName}' executed.`);
    } catch (err) {
      outputEl.textContent = `// Error:\n${err.message}`;
    }
  }

  closeWebMcpPlayground() {
    document.getElementById('webmcp-modal')?.classList.add('hidden');
  }

  updateWebMcpBadge() {
    const badge = document.getElementById('webmcp-status-badge');
    if (badge) {
      badge.textContent = `WebMCP: ${this.webmcp.registry.size} Tools`;
    }
  }

  // --- Audit Modal ---
  openAuditReportModal(audit, allAudits = null) {
    const modal = document.getElementById('audit-modal');
    if (!modal) return;

    const content = document.getElementById('audit-modal-content');
    if (!audit) {
      content.innerHTML = '<p class="text-gray-400">No audit result.</p>';
      modal.classList.remove('hidden');
      return;
    }

    content.innerHTML = `
      <div class="space-y-4 text-xs">
        <div class="flex items-center justify-between pb-3 border-b border-[#30363d]">
          <div>
            <div class="text-sm font-bold text-white">${audit.title || audit.task || 'Contract Audit'}</div>
            <div class="font-mono text-gray-400 text-[11px]">${audit.contractPath}</div>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-bold ${audit.verdict === 'PASSED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-red-950 text-red-300 border border-red-700'}">
            ${audit.verdict}
          </span>
        </div>

        <div class="space-y-2">
          ${audit.checks.map(c => `
            <div class="p-2.5 rounded bg-[#161b22] border ${c.status === 'PASS' ? 'border-emerald-800/40' : c.status === 'WARN' ? 'border-amber-800/40' : 'border-red-800/40'} flex items-start gap-2.5">
              <span class="font-bold shrink-0 ${c.status === 'PASS' ? 'text-emerald-400' : c.status === 'WARN' ? 'text-amber-400' : 'text-red-400'}">[${c.status}]</span>
              <div class="flex-1">
                <span class="font-semibold text-white">${c.name}:</span>
                <span class="text-gray-300 ml-1">${c.message}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="p-3 bg-[#0d1117] rounded border border-[#30363d] font-mono text-[11px] text-gray-400 flex justify-between">
          <span>Validated: ${new Date(audit.validatedAt || Date.now()).toLocaleTimeString()}</span>
          <span>Deterministic standard: KDD v1.0</span>
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  }

  closeAuditModal() {
    document.getElementById('audit-modal')?.classList.add('hidden');
  }

  // --- Modals Setup & Helper Actions ---
  initModals() {
    // Declarative tool registration for forms
    const issueForm = document.getElementById('new-issue-form');
    if (issueForm) {
      this.webmcp.defineDeclarativeTool(issueForm, {
        name: 'create_issue',
        description: 'Submit an issue to this repository',
        fields: [
          { name: 'title', description: 'Title of the issue' },
          { name: 'body', description: 'Detailed markdown description' }
        ]
      });
    }
  }

  openNewRepoModal() {
    document.getElementById('new-repo-modal')?.classList.remove('hidden');
  }
  closeNewRepoModal() {
    document.getElementById('new-repo-modal')?.classList.add('hidden');
  }
  async submitNewRepo() {
    const name = document.getElementById('new-repo-name').value.trim();
    const description = document.getElementById('new-repo-desc').value.trim();
    if (!name) return alert('Repository name is required');

    const repo = await this.store.createRepository({
      owner: 'user',
      name,
      description
    });
    this.closeNewRepoModal();
    this.toast(`Repository 'user/${repo.name}' created!`);
    this.navigate(`user/${repo.name}`);
  }

  openNewFileModal() {
    document.getElementById('new-file-path').value = this.currentPath ? `${this.currentPath}/` : '';
    document.getElementById('new-file-content').value = '';
    document.getElementById('new-file-message').value = 'Add new file';
    document.getElementById('new-file-modal')?.classList.remove('hidden');
  }
  closeNewFileModal() {
    document.getElementById('new-file-modal')?.classList.add('hidden');
  }
  async submitNewFile() {
    const path = document.getElementById('new-file-path').value.trim();
    const content = document.getElementById('new-file-content').value;
    const message = document.getElementById('new-file-message').value.trim();
    if (!path) return alert('File path is required');

    await this.git.commitFile({
      repoId: this.activeRepo.id,
      branch: this.currentBranch,
      path,
      content,
      message
    });
    this.closeNewFileModal();
    this.toast(`Committed ${path}!`);

    // Auto-trigger client-side KDD Actions CI on push
    if (window.actionsEngine) {
      window.actionsEngine.runWorkflow({
        repoId: this.activeRepo.id,
        branch: this.currentBranch,
        event: 'push',
        commitMessage: message
      }).then(() => {
        this.updateTabCounts();
      }).catch(err => console.error('[Actions] Push auto-trigger failed:', err));
    }

    this.navigatePath(path);
  }

  async openEditFileModal(path) {
    const file = await this.store.getFile(this.activeRepo.id, this.currentBranch, path);
    if (!file) return;
    document.getElementById('new-file-path').value = file.path;
    document.getElementById('new-file-content').value = file.content;
    document.getElementById('new-file-message').value = `Update ${file.path}`;
    document.getElementById('new-file-modal')?.classList.remove('hidden');
  }

  async deleteCurrentFile(path) {
    if (!confirm(`Are you sure you want to delete ${path}?`)) return;
    await this.store.deleteFile(this.activeRepo.id, this.currentBranch, path);
    await this.store.addCommit({
      repoId: this.activeRepo.id,
      branch: this.currentBranch,
      message: `Delete ${path}`
    });
    this.toast(`Deleted ${path}`);
    this.navigatePath('');
  }

  openNewIssueModal() {
    document.getElementById('new-issue-modal')?.classList.remove('hidden');
  }
  closeNewIssueModal() {
    document.getElementById('new-issue-modal')?.classList.add('hidden');
  }
  async submitNewIssue() {
    const title = document.getElementById('issue-title-input').value.trim();
    const body = document.getElementById('issue-body-input').value.trim();
    if (!title) return alert('Title is required');

    await this.store.createIssue({
      repoId: this.activeRepo.id,
      title,
      body,
      author: 'Current User'
    });
    this.closeNewIssueModal();
    this.toast('Issue submitted!');
    this.renderContentArea();
  }

  openNewPrModal() {
    const branchOptions = this.activeRepo.branches.map(b => `<option value="${b}">${b}</option>`).join('');
    document.getElementById('pr-source-select').innerHTML = branchOptions;
    document.getElementById('new-pr-modal')?.classList.remove('hidden');
  }
  closeNewPrModal() {
    document.getElementById('new-pr-modal')?.classList.add('hidden');
  }
  async submitNewPr() {
    const title = document.getElementById('pr-title-input').value.trim();
    const sourceBranch = document.getElementById('pr-source-select').value;
    const body = document.getElementById('pr-body-input').value.trim();
    if (!title) return alert('PR Title is required');

    await this.store.createPullRequest({
      repoId: this.activeRepo.id,
      title,
      body,
      sourceBranch,
      targetBranch: 'main'
    });
    this.closeNewPrModal();
    this.toast('Pull Request opened!');
    this.renderContentArea();
  }

  async viewPrDiff(prId) {
    const pr = await this.store.get('pullRequests', prId);
    if (!pr) return;

    const sourceFiles = await this.store.getFiles(this.activeRepo.id, pr.sourceBranch);
    const targetFiles = await this.store.getFiles(this.activeRepo.id, pr.targetBranch);

    let diffHtml = '';
    for (const sf of sourceFiles) {
      const tf = targetFiles.find(f => f.path === sf.path);
      const oldText = tf ? tf.content : '';
      const diffLines = this.git.computeLineDiff(oldText, sf.content);

      diffHtml += `
        <div class="border border-[#30363d] rounded-md overflow-hidden bg-[#0d1117] mb-4">
          <div class="bg-[#161b22] px-4 py-2 border-b border-[#30363d] font-mono text-xs font-bold text-white flex justify-between">
            <span>${sf.path}</span>
            <span class="text-gray-400 font-normal">${tf ? 'Modified' : 'New file'}</span>
          </div>
          <div class="font-mono text-xs overflow-x-auto divide-y divide-[#21262d]">
            ${diffLines.map(d => `
              <div class="flex items-center px-2 py-0.5 ${d.type === 'added' ? 'bg-emerald-950/40 text-emerald-300' : d.type === 'removed' ? 'bg-red-950/40 text-red-300' : 'text-gray-400'}">
                <span class="w-8 text-right pr-2 text-gray-600 select-none">${d.oldLine || ''}</span>
                <span class="w-8 text-right pr-2 text-gray-600 select-none">${d.newLine || ''}</span>
                <span class="w-4 select-none">${d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '}</span>
                <span class="flex-1 whitespace-pre">${this.escapeHtml(d.text)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    const modal = document.getElementById('pr-diff-modal');
    document.getElementById('pr-diff-content').innerHTML = diffHtml || '<div class="p-6 text-center text-gray-400 text-xs">No differences found between branches.</div>';
    modal.classList.remove('hidden');
  }

  closePrDiffModal() {
    document.getElementById('pr-diff-modal')?.classList.add('hidden');
  }

  openCloneModal() {
    const cloneUrl = `https://github-client.local/${this.activeRepo.owner}/${this.activeRepo.name}.git`;
    document.getElementById('clone-url-input').value = cloneUrl;
    document.getElementById('clone-modal')?.classList.remove('hidden');
  }
  closeCloneModal() {
    document.getElementById('clone-modal')?.classList.add('hidden');
  }
  copyCloneUrl() {
    const input = document.getElementById('clone-url-input');
    input.select();
    navigator.clipboard.writeText(input.value);
    this.toast('Clone URL copied to clipboard!');
  }

  copyFileContent() {
    const code = document.querySelector('pre code');
    if (code) {
      navigator.clipboard.writeText(code.innerText);
      this.toast('Code copied to clipboard!');
    }
  }

  // --- Backup & Restore ---
  async downloadBackup() {
    const data = await this.store.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `github-kdd-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async handleBackupUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        await this.store.importBackup(json);
      } catch (err) {
        alert('Invalid backup JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  async resetSeedData() {
    if (!confirm('Are you sure? This will overwrite your local changes with fresh seed data.')) return;
    await this.store.loadSeedData();
    this.toast('Reset to default seed repositories.');
    await this.loadCurrentRepo();
    this.render();
  }

  // --- HTMX Bridge hook ---
  async renderPartial(path, verb, params, elt) {
    // Fulfill HTMX virtual routes
    if (path.startsWith('repo/')) {
      const tab = path.replace('repo/', '');
      this.currentTab = tab;
      return await this.renderContentArea();
    }
    return '<div>OK</div>';
  }

  onContentSwapped(targetEl) {
    if (window.hljs) {
      targetEl.querySelectorAll('pre code').forEach(el => {
        window.hljs.highlightElement(el);
      });
    }
  }

  // --- KDD Actions Interactive Controls ---
  viewWorkflowRun(runId) {
    this.selectedWorkflowRunId = runId;
    window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/actions/${runId}`;
  }

  viewAllWorkflowRuns() {
    this.selectedWorkflowRunId = null;
    window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/actions`;
  }

  async openRunWorkflowModal(defaultWorkflow = null) {
    const modal = document.getElementById('run-workflow-modal');
    if (!modal) return;

    const workflows = window.actionsEngine ? await window.actionsEngine.getWorkflows(this.activeRepo.id, this.currentBranch) : [];
    const wfSelect = document.getElementById('dispatch-workflow-select');
    const brSelect = document.getElementById('dispatch-branch-select');

    if (wfSelect) {
      wfSelect.innerHTML = workflows.map(w => `
        <option value="${w.name}" ${w.name === defaultWorkflow ? 'selected' : ''}>
          ${w.name} (${w.path})
        </option>
      `).join('');
    }

    if (brSelect && this.activeRepo) {
      brSelect.innerHTML = (this.activeRepo.branches || ['main']).map(b => `
        <option value="${b}" ${b === this.currentBranch ? 'selected' : ''}>
          ${b}
        </option>
      `).join('');
    }

    modal.classList.remove('hidden');
  }

  closeRunWorkflowModal() {
    document.getElementById('run-workflow-modal')?.classList.add('hidden');
  }

  async dispatchWorkflow() {
    const wfSelect = document.getElementById('dispatch-workflow-select');
    const brSelect = document.getElementById('dispatch-branch-select');
    const workflowName = wfSelect ? wfSelect.value : 'validate-contracts';
    const branch = brSelect ? brSelect.value : this.currentBranch;

    this.closeRunWorkflowModal();
    this.toast(`Triggered workflow '${workflowName}' on '${branch}'...`);

    if (!window.actionsEngine) {
      return alert('Actions engine not loaded.');
    }

    try {
      this.currentTab = 'actions';

      const run = await window.actionsEngine.runWorkflow({
        repoId: this.activeRepo.id,
        branch,
        workflowName,
        event: 'workflow_dispatch',
        onUpdate: (updatedRun) => {
          if (this.currentTab === 'actions' && this.selectedWorkflowRunId === updatedRun.id) {
            this.updateLiveRunDisplay(updatedRun);
          }
        }
      });

      this.selectedWorkflowRunId = run.id;
      window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/actions/${run.id}`;
      this.updateTabCounts();
    } catch (err) {
      console.error('[Actions] Dispatch failed:', err);
      alert('Workflow execution failed: ' + err.message);
    }
  }

  async rerunWorkflow(runId) {
    const existing = await this.store.getWorkflowRun(runId);
    if (!existing || !window.actionsEngine) return;

    this.toast(`Re-running workflow '${existing.workflowName}'...`);
    try {
      const run = await window.actionsEngine.runWorkflow({
        repoId: this.activeRepo.id,
        branch: existing.branch,
        workflowName: existing.workflowName,
        event: existing.event || 'workflow_dispatch',
        onUpdate: (updatedRun) => {
          if (this.currentTab === 'actions' && this.selectedWorkflowRunId === updatedRun.id) {
            this.updateLiveRunDisplay(updatedRun);
          }
        }
      });
      this.selectedWorkflowRunId = run.id;
      window.location.hash = `#/${this.currentOwner}/${this.currentRepoName}/actions/${run.id}`;
      this.updateTabCounts();
    } catch (err) {
      alert('Re-run failed: ' + err.message);
    }
  }

  updateLiveRunDisplay(run) {
    const logsBox = document.getElementById('actions-terminal-logs');
    if (logsBox) {
      logsBox.innerHTML = `<pre class="whitespace-pre-wrap select-text">${this.formatTerminalLogs(run.logs || '')}</pre>`;
      logsBox.scrollTop = logsBox.scrollHeight;
    }
    const stepList = document.getElementById('actions-step-list');
    if (stepList && run.steps) {
      stepList.innerHTML = run.steps.map(step => `
        <div class="p-3 flex items-center justify-between gap-2 ${step.status === 'in_progress' ? 'bg-blue-950/20' : ''}">
          <div class="flex items-center gap-2.5 min-w-0">
            ${this.renderStepStatusIcon(step.status, step.conclusion)}
            <span class="font-medium text-gray-200 truncate">${step.name}</span>
          </div>
          <span class="font-mono text-[11px] text-gray-500 shrink-0">${step.duration || '0s'}</span>
        </div>
      `).join('');
    }
    const durationEl = document.getElementById('run-duration-display');
    if (durationEl) durationEl.textContent = run.duration || '0s';
  }

  async copyRunLogs() {
    if (!this.selectedWorkflowRunId) return;
    const run = await this.store.getWorkflowRun(this.selectedWorkflowRunId);
    if (run && run.logs) {
      navigator.clipboard.writeText(run.logs).then(() => {
        this.toast('Logs copied to clipboard!');
      }).catch(() => {
        this.toast('Failed to copy logs.');
      });
    }
  }

  // --- Utilities ---
  toast(msg) {
    const el = document.createElement('div');
    el.className = 'fixed bottom-4 right-4 bg-[#1f6feb] text-white px-4 py-2 rounded-md shadow-2xl text-xs font-semibold z-50 transition-opacity duration-300';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2500);
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  timeAgo(timestamp) {
    const sec = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
}

// Instantiate and attach globally
window.app = new GitHubApp();
