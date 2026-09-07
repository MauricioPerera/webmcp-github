/**
 * git-engine.js - Virtual Git Engine for Client-side GitHub Clone
 * Handles file trees, commits, branches, line diffs, and repository actions.
 */

class GitEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Build virtual file tree for a given directory path
   * @param {Array} files - Array of file objects [{ path, content }]
   * @param {string} currentPath - Current subfolder path, e.g. "" or "knowledge"
   */
  buildTree(files, currentPath = '') {
    const cleanCurrent = currentPath.replace(/^\/+|\/+$/g, '');
    const prefix = cleanCurrent ? cleanCurrent + '/' : '';
    
    const foldersMap = new Map();
    const directFiles = [];

    files.forEach(file => {
      const filePath = file.path.replace(/^\/+/, '');
      if (prefix && !filePath.startsWith(prefix)) return;

      const relative = prefix ? filePath.slice(prefix.length) : filePath;
      const parts = relative.split('/');

      if (parts.length > 1) {
        // It's inside a subfolder
        const folderName = parts[0];
        const folderFullPath = prefix ? `${prefix}${folderName}` : folderName;
        if (!foldersMap.has(folderName)) {
          foldersMap.set(folderName, {
            name: folderName,
            fullPath: folderFullPath,
            type: 'dir',
            itemCount: 1
          });
        } else {
          foldersMap.get(folderName).itemCount++;
        }
      } else {
        // It's a direct file in this folder
        directFiles.push({
          name: parts[0],
          fullPath: filePath,
          type: 'file',
          size: file.content ? new Blob([file.content]).size : 0,
          lineCount: file.content ? file.content.split('\n').length : 0,
          content: file.content
        });
      }
    });

    const directories = Array.from(foldersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const sortedFiles = directFiles.sort((a, b) => a.name.localeCompare(b.name));

    return {
      currentPath: cleanCurrent,
      breadcrumbs: cleanCurrent ? cleanCurrent.split('/') : [],
      items: [...directories, ...sortedFiles]
    };
  }

  /**
   * Detect syntax highlighting language based on file extension
   */
  detectLanguage(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const map = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'html': 'html',
      'css': 'css',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'bash',
      'ps1': 'powershell',
      'txt': 'plaintext'
    };
    return map[ext] || 'plaintext';
  }

  /**
   * Commit file changes (create or update)
   */
  async commitFile({ repoId, branch = 'main', path, content, message, author }) {
    const cleanPath = path.replace(/^\/+/, '');
    await this.store.saveFile(repoId, branch, cleanPath, content);
    const commit = await this.store.addCommit({
      repoId,
      branch,
      message: message || `Update ${cleanPath}`,
      author: author || 'GitHub Web User <user@client-side.local>'
    });
    return { path: cleanPath, commit };
  }

  /**
   * Create a new branch
   */
  async createBranch(repo, newBranchName, baseBranch = 'main') {
    if (repo.branches.includes(newBranchName)) {
      throw new Error(`Branch '${newBranchName}' already exists.`);
    }
    // Copy files from baseBranch to newBranch
    const baseFiles = await this.store.getFiles(repo.id, baseBranch);
    for (const f of baseFiles) {
      await this.store.saveFile(repo.id, newBranchName, f.path, f.content);
    }
    repo.branches.push(newBranchName);
    repo.updatedAt = new Date().toISOString();
    await this.store.put('repositories', repo);
    return repo;
  }

  /**
   * Toggle star status for current user
   */
  async toggleStar(repoId) {
    const repos = await this.store.getAll('repositories');
    const repo = repos.find(r => r.id === repoId);
    if (!repo) return null;

    const starredKey = `starred_${repoId}`;
    const isStarred = localStorage.getItem(starredKey) === 'true';

    if (isStarred) {
      repo.stars = Math.max(0, (repo.stars || 1) - 1);
      localStorage.setItem(starredKey, 'false');
    } else {
      repo.stars = (repo.stars || 0) + 1;
      localStorage.setItem(starredKey, 'true');
    }

    await this.store.put('repositories', repo);
    return { repo, isStarred: !isStarred };
  }

  /**
   * Fork repository
   */
  async forkRepository(repoId, currentUser = 'user') {
    const repos = await this.store.getAll('repositories');
    const sourceRepo = repos.find(r => r.id === repoId);
    if (!sourceRepo) throw new Error('Repository not found');

    const forked = {
      id: 'repo-' + Date.now(),
      owner: currentUser,
      name: sourceRepo.name,
      description: `Forked from ${sourceRepo.owner}/${sourceRepo.name}. ${sourceRepo.description}`,
      defaultBranch: sourceRepo.defaultBranch,
      isPrivate: false,
      stars: 0,
      forks: 0,
      watchers: 1,
      branches: [...sourceRepo.branches],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      forkedFrom: `${sourceRepo.owner}/${sourceRepo.name}`
    };

    // Increment original repo fork count
    sourceRepo.forks = (sourceRepo.forks || 0) + 1;
    await this.store.put('repositories', sourceRepo);
    await this.store.put('repositories', forked);

    // Duplicate all files across branches
    for (const br of sourceRepo.branches) {
      const files = await this.store.getFiles(sourceRepo.id, br);
      for (const f of files) {
        await this.store.saveFile(forked.id, br, f.path, f.content);
      }
    }

    return forked;
  }

  /**
   * Line-by-line Diff generator (LCS or simple diff)
   * Generates diff lines with status: 'unchanged', 'added', 'removed'
   */
  computeLineDiff(oldText = '', newText = '') {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff = [];

    let i = 0;
    let j = 0;

    while (i < oldLines.length && j < newLines.length) {
      if (oldLines[i] === newLines[j]) {
        diff.push({ type: 'unchanged', oldLine: i + 1, newLine: j + 1, text: oldLines[i] });
        i++;
        j++;
      } else {
        // Lookahead to check if line was added or removed
        let matchInNew = newLines.indexOf(oldLines[i], j);
        let matchInOld = oldLines.indexOf(newLines[j], i);

        if (matchInNew !== -1 && (matchInOld === -1 || matchInNew - j <= matchInOld - i)) {
          // Lines were added in new
          while (j < matchInNew) {
            diff.push({ type: 'added', oldLine: null, newLine: j + 1, text: newLines[j] });
            j++;
          }
        } else if (matchInOld !== -1) {
          // Lines were removed in new
          while (i < matchInOld) {
            diff.push({ type: 'removed', oldLine: i + 1, newLine: null, text: oldLines[i] });
            i++;
          }
        } else {
          // Changed line (one removed, one added)
          diff.push({ type: 'removed', oldLine: i + 1, newLine: null, text: oldLines[i] });
          diff.push({ type: 'added', oldLine: null, newLine: j + 1, text: newLines[j] });
          i++;
          j++;
        }
      }
    }

    while (i < oldLines.length) {
      diff.push({ type: 'removed', oldLine: i + 1, newLine: null, text: oldLines[i] });
      i++;
    }

    while (j < newLines.length) {
      diff.push({ type: 'added', oldLine: null, newLine: j + 1, text: newLines[j] });
      j++;
    }

    return diff;
  }
}

window.gitEngine = new GitEngine(window.ghStore);
