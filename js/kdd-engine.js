/**
 * kdd-engine.js - Knowledge-Driven Development (KDD) & Contract-Driven Development (CCDD) Engine
 * Implements OKF node parsing, deterministic CCDD gate validation, and KDD-Board Kanban state.
 */

class KDDEngine {
  constructor(store) {
    this.store = store;
  }

  /**
   * Parse YAML frontmatter and markdown body from an OKF node
   */
  parseOKFNode(content) {
    if (!content || typeof content !== 'string') {
      return { frontmatter: null, body: '', hasFrontmatter: false };
    }

    const trimmed = content.trim();
    if (!trimmed.startsWith('---')) {
      return { frontmatter: null, body: content, hasFrontmatter: false };
    }

    const match = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: null, body: content, hasFrontmatter: false };
    }

    const yamlStr = match[1];
    const bodyStr = match[2];

    const frontmatter = this.parseSimpleYaml(yamlStr);
    return {
      frontmatter,
      rawYaml: yamlStr,
      body: bodyStr,
      hasFrontmatter: true
    };
  }

  /**
   * Safe minimalist YAML parser for OKF & CCDD metadata
   */
  parseSimpleYaml(yamlStr) {
    const lines = yamlStr.split('\n');
    const result = {};
    let currentKey = null;
    let inArray = false;
    let inSubObject = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      // Sub-object indentation (e.g., budget: \n max_cyclomatic_complexity: 4)
      if (line.startsWith('  ') && inSubObject && currentKey) {
        const subParts = trimmed.split(':');
        if (subParts.length >= 2) {
          const subKey = subParts[0].trim();
          let subVal = subParts.slice(1).join(':').trim();
          if (!isNaN(subVal) && subVal !== '') subVal = Number(subVal);
          result[currentKey][subKey] = subVal;
        }
        return;
      }

      // Array item (e.g., tags: \n - ccdd)
      if (trimmed.startsWith('- ') && currentKey) {
        const val = trimmed.replace(/^- /, '').trim().replace(/^['"]|['"]$/g, '');
        if (!Array.isArray(result[currentKey])) {
          result[currentKey] = [];
        }
        result[currentKey].push(val);
        inArray = true;
        return;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.substring(0, colonIdx).trim();
        let val = line.substring(colonIdx + 1).trim();

        if (val === '') {
          // Could be starting an array or sub-object
          if (key === 'budget') {
            result[key] = {};
            currentKey = key;
            inSubObject = true;
            inArray = false;
          } else {
            result[key] = [];
            currentKey = key;
            inArray = true;
            inSubObject = false;
          }
          return;
        }

        // Parse inline arrays [a, b, c]
        if (val.startsWith('[') && val.endsWith(']')) {
          const items = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
          result[key] = items.filter(Boolean);
          currentKey = key;
          inArray = false;
          inSubObject = false;
          return;
        }

        // Clean quotes
        val = val.replace(/^['"]|['"]$/g, '');
        if (!isNaN(val) && val !== '') val = Number(val);

        result[key] = val;
        currentKey = key;
        inArray = false;
        inSubObject = false;
      }
    });

    return result;
  }

  /**
   * Calculate cyclomatic complexity of code (deterministic heuristic)
   */
  calculateCyclomaticComplexity(code) {
    if (!code) return 1;
    let complexity = 1;
    const lines = code.split('\n');

    const patterns = [
      /\bif\b/g,
      /\belif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\band\b/g,
      /\bor\b/g,
      /\bexcept\b/g,
      /\bcatch\b/g,
      /\bcase\b/g,
      /\?/g
    ];

    lines.forEach(line => {
      const commentIdx = line.indexOf('#') !== -1 ? line.indexOf('#') : line.indexOf('//');
      const cleanLine = commentIdx !== -1 ? line.substring(0, commentIdx) : line;

      patterns.forEach(regex => {
        const matches = cleanLine.match(regex);
        if (matches) complexity += matches.length;
      });
    });

    return complexity;
  }

  /**
   * Deterministic Contract Gate Validator
   * Validates a CCDD Task Contract file against the repository files
   */
  async validateContract(repoId, contractPath, branch = 'main') {
    const contractFile = await this.store.getFile(repoId, branch, contractPath);
    if (!contractFile) {
      return {
        verdict: 'FAILED',
        contractPath,
        summary: `Contract file not found at '${contractPath}'`,
        checks: []
      };
    }

    const { frontmatter, body, hasFrontmatter } = this.parseOKFNode(contractFile.content);
    const checks = [];
    let passed = true;

    // Check 1: OKF Frontmatter existence & Type
    if (!hasFrontmatter || !frontmatter) {
      checks.push({ name: 'OKF Frontmatter', status: 'FAIL', message: 'Missing valid YAML frontmatter delimiter (---).' });
      passed = false;
    } else if (frontmatter.type !== 'Task Contract') {
      checks.push({ name: 'Node Type', status: 'FAIL', message: `Type must be 'Task Contract' (found '${frontmatter.type}').` });
      passed = false;
    } else {
      checks.push({ name: 'OKF Frontmatter', status: 'PASS', message: `Valid Task Contract node for '${frontmatter.title || frontmatter.task}'.` });
    }

    if (!frontmatter) {
      return { verdict: 'FAILED', contractPath, checks };
    }

    // Check 2: Mandatory CCDD fields
    const requiredFields = ['task', 'intent', 'target', 'signature', 'test_command', 'budget', 'tests'];
    const missing = requiredFields.filter(f => !frontmatter[f]);
    if (missing.length > 0) {
      checks.push({ name: 'Required CCDD Fields', status: 'FAIL', message: `Missing fields: ${missing.join(', ')}` });
      passed = false;
    } else {
      checks.push({ name: 'Required CCDD Fields', status: 'PASS', message: 'All mandatory fields present.' });
    }

    // Check 3: Target File Existence
    let targetFile = null;
    if (frontmatter.target) {
      targetFile = await this.store.getFile(repoId, branch, frontmatter.target);
      if (!targetFile) {
        checks.push({ name: 'Target Implementation', status: 'FAIL', message: `Target file '${frontmatter.target}' does not exist in repo.` });
        passed = false;
      } else {
        checks.push({ name: 'Target Implementation', status: 'PASS', message: `Found target file '${frontmatter.target}'.` });
      }
    }

    // Check 4: Test Oracle Existence
    if (frontmatter.tests) {
      const testFile = await this.store.getFile(repoId, branch, frontmatter.tests);
      if (!testFile) {
        checks.push({ name: 'Frozen Test Oracle', status: 'FAIL', message: `Test oracle '${frontmatter.tests}' not found in repo.` });
        passed = false;
      } else {
        checks.push({ name: 'Frozen Test Oracle', status: 'PASS', message: `Found test oracle '${frontmatter.tests}'.` });
      }
    }

    // Check 5: Complexity Budget
    const maxComplexity = (frontmatter.budget && frontmatter.budget.max_cyclomatic_complexity) ? Number(frontmatter.budget.max_cyclomatic_complexity) : null;
    let actualComplexity = 1;
    if (targetFile && targetFile.content) {
      actualComplexity = this.calculateCyclomaticComplexity(targetFile.content);
      if (maxComplexity && actualComplexity > maxComplexity) {
        checks.push({
          name: 'Cyclomatic Complexity Budget',
          status: 'FAIL',
          message: `Calculated complexity (${actualComplexity}) exceeds budget limit (${maxComplexity}).`
        });
        passed = false;
      } else {
        checks.push({
          name: 'Cyclomatic Complexity Budget',
          status: 'PASS',
          message: `Calculated complexity: ${actualComplexity} <= Budget: ${maxComplexity || 'N/A'}`
        });
      }
    }

    // Check 6: OKF Interconnections (Relative Links)
    const hasRelativeLinks = /\[.*?\]\((\.\/|\.\.\/|[a-zA-Z0-9_-]+\.md).*?\)/.test(body);
    if (!hasRelativeLinks) {
      checks.push({
        name: 'OKF Interconnected Context',
        status: 'WARN',
        message: 'Contract body does not contain relative Markdown links to related OKF nodes.'
      });
    } else {
      checks.push({
        name: 'OKF Interconnected Context',
        status: 'PASS',
        message: 'Body links to normative OKF nodes without duplicating business rules.'
      });
    }

    // Check 7: Dependency Perimeter (deps_allowed)
    if (frontmatter.deps_allowed && targetFile && targetFile.content) {
      const allowed = Array.isArray(frontmatter.deps_allowed) ? frontmatter.deps_allowed : [frontmatter.deps_allowed];
      const importRegex = /(?:import|from)\s+([a-zA-Z0-9_]+)/g;
      let match;
      const detectedImports = new Set();
      while ((match = importRegex.exec(targetFile.content)) !== null) {
        if (!['src', 'tests', 'sys', 'os'].includes(match[1])) {
          detectedImports.add(match[1]);
        }
      }
      const disallowed = Array.from(detectedImports).filter(dep => !allowed.includes(dep));
      if (disallowed.length > 0) {
        checks.push({
          name: 'Dependency Perimeter',
          status: 'FAIL',
          message: `Forbidden dependencies imported: ${disallowed.join(', ')}`
        });
        passed = false;
      } else {
        checks.push({
          name: 'Dependency Perimeter',
          status: 'PASS',
          message: `All imports conform to perimeter: [${allowed.join(', ')}]`
        });
      }
    }

    return {
      verdict: passed ? 'PASSED' : 'FAILED',
      contractPath,
      task: frontmatter.task,
      title: frontmatter.title,
      complexity: actualComplexity,
      maxComplexity,
      checks,
      validatedAt: new Date().toISOString()
    };
  }

  /**
   * KDD-Board stage columns
   */
  getBoardColumns() {
    return [
      { id: 'backlog', title: 'Backlog', color: 'border-slate-500 text-slate-400' },
      { id: 'ready', title: 'Ready for Agent', color: 'border-blue-500 text-blue-400' },
      { id: 'in_progress', title: 'In Progress (Ephemeral Dev)', color: 'border-amber-500 text-amber-400' },
      { id: 'needs_human_input', title: 'Needs Human Gate', color: 'border-purple-500 text-purple-400' },
      { id: 'done', title: 'Done (Gate Sealed)', color: 'border-emerald-500 text-emerald-400' }
    ];
  }

  /**
   * Move task card to next or target stage
   */
  async moveCard(cardId, newColumn) {
    return await this.store.updateKddCard(cardId, {
      column: newColumn,
      updatedAt: new Date().toISOString()
    });
  }
}

window.kddEngine = new KDDEngine(window.ghStore);
