/**
 * comprehensive_e2e_suite.js
 * Batería de Pruebas de Extremo a Extremo (E2E) y Resiliencia para GitHub Client-Side Clone.
 * Incluye pruebas de Happy Path, Casos Borde y Forzado Sistemático de Errores.
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal reporting
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    testResults.push({ name: testName, status: 'PASS', details });
    console.log(`  ${GREEN}✓ PASS:${RESET} ${testName}`);
  } else {
    failedTests++;
    testResults.push({ name: testName, status: 'FAIL', details });
    console.error(`  ${RED}✗ FAIL:${RESET} ${testName} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runSuite() {
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   BATERÍA E2E: GITHUB CLIENT-SIDE (TAILWIND + HTMX + KDD + WEBMCP)   ${RESET}`);
  console.log(`${BOLD}${CYAN}   Probando Happy Path, Casos Borde y Forzado de Errores Riguroso    ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================\n${RESET}`);

  // Setup DOM / Browser Mock Environment
  const localStorageStore = {};
  global.localStorage = {
    getItem: (k) => localStorageStore[k] || null,
    setItem: (k, v) => { localStorageStore[k] = String(v); },
    removeItem: (k) => { delete localStorageStore[k]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); }
  };
  global.Blob = class {
    constructor(parts) { this.size = (parts || []).map(p => String(p)).join('').length; }
  };
  global.window = {
    location: { hash: '#/MauricioPerera/KDD' },
    addEventListener: () => {}
  };
  global.document = {};

  // Load Source Files
  const storeCode = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
  const gitCode = fs.readFileSync(path.join(__dirname, '../js/git-engine.js'), 'utf8');
  const kddCode = fs.readFileSync(path.join(__dirname, '../js/kdd-engine.js'), 'utf8');
  const actionsCode = fs.readFileSync(path.join(__dirname, '../js/actions-engine.js'), 'utf8');
  const mcpCode = fs.readFileSync(path.join(__dirname, '../js/webmcp-provider.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');

  eval(storeCode);
  eval(gitCode);
  eval(kddCode);
  eval(actionsCode);
  eval(mcpCode);

  const store = window.ghStore;
  const git = window.gitEngine;
  const kdd = window.kddEngine;
  const actions = window.actionsEngine;
  const webmcp = window.webMcpProvider;

  // Pre-seed storage using fallback localStorage mode for pure node execution
  store.useLocalStorageFallback = true;
  store.isReady = true;

  const rawSeed = fs.readFileSync(path.join(__dirname, '../data/seed-repos.json'), 'utf8');
  const seedData = JSON.parse(rawSeed);

  // -------------------------------------------------------------------------
  // MÓDULO 1: STORE.JS (IndexedDB / LocalStorage Persistence)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 1: store.js - Motor de Almacenamiento y Persistencia]${RESET}`);

  // Test 1.1: Carga y verificación de datos semilla
  await store.importBackup(seedData);
  const repos = await store.getRepositories();
  assert(repos.length === 3, 'store.getRepositories() retorna 3 repositorios semilla');

  // Test 1.2: Búsqueda de repositorio por owner/name (Happy Path)
  const kddRepo = await store.getRepository('MauricioPerera', 'KDD');
  assert(kddRepo !== null && kddRepo.name === 'KDD', 'store.getRepository() encuentra repositorio existente');

  // Test 1.3: Forzar error en getRepository con repositorio inexistente
  const ghostRepo = await store.getRepository('NonExistent', 'GhostRepo');
  assert(ghostRepo === null, 'store.getRepository() retorna null ante repositorio inexistente (Forzado)');

  // Test 1.4: Insensibilidad a mayúsculas/minúsculas
  const caseInsensitiveRepo = await store.getRepository('mauricioperera', 'kdd');
  assert(caseInsensitiveRepo !== null && caseInsensitiveRepo.id === kddRepo.id, 'store.getRepository() es insensible a mayúsculas/minúsculas');

  // Test 1.5: Creación de repositorio y archivos iniciales
  const newRepo = await store.createRepository({ owner: 'alice', name: 'demo-repo', description: 'Testing repo' });
  assert(newRepo && newRepo.owner === 'alice', 'store.createRepository() crea repositorio exitosamente');
  const newRepoFiles = await store.getFiles(newRepo.id, 'main');
  assert(newRepoFiles.some(f => f.path === 'README.md'), 'store.createRepository() autogenera README.md inicial');
  const newRepoCommits = await store.getCommits(newRepo.id, 'main');
  assert(newRepoCommits.length === 1, 'store.createRepository() autogenera commit inicial');

  // Test 1.6: getFile existente vs inexistente (Forzado)
  const existingFile = await store.getFile(kddRepo.id, 'main', 'README.md');
  assert(existingFile !== null && existingFile.content.includes('KDD'), 'store.getFile() obtiene archivo existente');
  const missingFile = await store.getFile(kddRepo.id, 'main', 'does_not_exist.py');
  assert(missingFile === null, 'store.getFile() retorna null ante archivo inexistente (Forzado)');

  // Test 1.7: Creación y borrado de archivo
  await store.saveFile(kddRepo.id, 'main', 'temp_test.txt', 'Temporary content');
  const savedFile = await store.getFile(kddRepo.id, 'main', 'temp_test.txt');
  assert(savedFile && savedFile.content === 'Temporary content', 'store.saveFile() guarda archivo correctamente');
  await store.deleteFile(kddRepo.id, 'main', 'temp_test.txt');
  const deletedFile = await store.getFile(kddRepo.id, 'main', 'temp_test.txt');
  assert(deletedFile === null, 'store.deleteFile() elimina el archivo correctamente');

  // Test 1.8: Issues y numeración incremental
  const issue1 = await store.createIssue({ repoId: kddRepo.id, title: 'Test issue 1', body: 'Body 1', author: 'tester' });
  const issue2 = await store.createIssue({ repoId: kddRepo.id, title: 'Test issue 2', body: 'Body 2', author: 'tester' });
  assert(issue2.number === issue1.number + 1, 'store.createIssue() incrementa número de issue deterministamente');

  // Test 1.9: getIssue existente vs inexistente (Forzado)
  const foundIssue = await store.getIssue(kddRepo.id, issue1.number);
  assert(foundIssue !== null && foundIssue.title === 'Test issue 1', 'store.getIssue() encuentra issue por número');
  const notFoundIssue = await store.getIssue(kddRepo.id, 999999);
  assert(notFoundIssue === null, 'store.getIssue() retorna null ante número inexistente (Forzado)');

  // Test 1.10: Pull Requests
  const pr = await store.createPullRequest({ repoId: kddRepo.id, title: 'New PR', sourceBranch: 'feature', targetBranch: 'main' });
  assert(pr && pr.number >= 1, 'store.createPullRequest() crea PR exitosamente');

  // Test 1.11: Tarjetas KDD y actualización
  const card = await store.createKddCard({ repoId: kddRepo.id, task: 'unit_test_task', title: 'Task Card' });
  assert(card && card.column === 'backlog', 'store.createKddCard() crea tarjeta en backlog por defecto');
  const updatedCard = await store.updateKddCard(card.id, { column: 'done', gateStatus: 'passed' });
  assert(updatedCard.column === 'done' && updatedCard.gateStatus === 'passed', 'store.updateKddCard() actualiza estado de tarjeta');
  const invalidCardUpdate = await store.updateKddCard('non-existent-card-id', { column: 'done' });
  assert(invalidCardUpdate === null, 'store.updateKddCard() retorna null ante ID inexistente (Forzado)');

  // Test 1.12: Exportación y Forzado de Error en Importación de Backup
  const backup = await store.exportBackup();
  assert(backup.repositories.length >= 3 && backup.files.length > 0, 'store.exportBackup() exporta estructura completa');
  
  let importErrorCaught = false;
  try {
    await store.importBackup(null);
  } catch (err) {
    importErrorCaught = true;
  }
  assert(importErrorCaught, 'store.importBackup(null) arroja error controlado (Forzado)');

  let importCorruptedCaught = false;
  try {
    await store.importBackup({ corrupt: true });
  } catch (err) {
    importCorruptedCaught = true;
  }
  assert(importCorruptedCaught, 'store.importBackup(corruptedData) arroja error controlado (Forzado)');

  // -------------------------------------------------------------------------
  // MÓDULO 2: GIT-ENGINE.JS (Virtual Git, Árboles, Ramas, Diff)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 2: git-engine.js - Motor Virtual Git y Diff]${RESET}`);

  // Test 2.1: Construcción de árbol de archivos raíz y subdirectorios
  const kddFiles = await store.getFiles(kddRepo.id, 'main');
  const rootTree = git.buildTree(kddFiles, '');
  assert(rootTree.items.some(i => i.name === 'knowledge' && i.type === 'dir'), 'git.buildTree("") identifica subdirectorio knowledge');
  assert(rootTree.items.some(i => i.name === 'README.md' && i.type === 'file'), 'git.buildTree("") identifica archivo README.md en raíz');

  const subTree = git.buildTree(kddFiles, 'knowledge');
  assert(subTree.breadcrumbs.length === 1 && subTree.breadcrumbs[0] === 'knowledge', 'git.buildTree("knowledge") genera breadcrumbs');
  assert(subTree.items.some(i => i.name === 'contracts' && i.type === 'dir'), 'git.buildTree("knowledge") identifica subdirectorio contracts');

  // Test 2.2: Normalización de barras en paths
  const treeWithSlashes = git.buildTree(kddFiles, '/knowledge/contracts/');
  assert(treeWithSlashes.items.length > 0, 'git.buildTree() normaliza slashes iniciales y finales');

  // Test 2.3: Detección de lenguajes (Happy Path & Fallback)
  assert(git.detectLanguage('script.py') === 'python', 'detectLanguage("script.py") -> python');
  assert(git.detectLanguage('app.ts') === 'typescript', 'detectLanguage("app.ts") -> typescript');
  assert(git.detectLanguage('doc.md') === 'markdown', 'detectLanguage("doc.md") -> markdown');
  assert(git.detectLanguage('config.yaml') === 'yaml', 'detectLanguage("config.yaml") -> yaml');
  assert(git.detectLanguage('unknown.xyz789') === 'plaintext', 'detectLanguage("unknown.xyz789") -> plaintext (Fallback forzado)');
  assert(git.detectLanguage('Dockerfile') === 'plaintext', 'detectLanguage("Dockerfile") sin extensión -> plaintext (Fallback forzado)');

  // Test 2.4: Creación de ramas y Forzado de Error por Duplicado
  await git.createBranch(kddRepo, 'feature/test-branch', 'main');
  assert(kddRepo.branches.includes('feature/test-branch'), 'git.createBranch() crea rama nueva y duplica archivos');
  
  let duplicateBranchError = false;
  try {
    await git.createBranch(kddRepo, 'feature/test-branch', 'main');
  } catch (err) {
    duplicateBranchError = true;
  }
  assert(duplicateBranchError, 'git.createBranch() rechaza creación de rama duplicada (Forzado)');

  // Test 2.5: Commit de archivo
  const commitRes = await git.commitFile({
    repoId: kddRepo.id,
    branch: 'main',
    path: 'new_feature.py',
    content: 'print("hello world")',
    message: 'feat: add new feature'
  });
  assert(commitRes.commit && commitRes.commit.id, 'git.commitFile() genera commit con ID');

  // Test 2.6: Star & Fork y Forzado de Errores
  const starRes = await git.toggleStar(kddRepo.id);
  assert(starRes.isStarred === true, 'git.toggleStar() marca con estrella');
  const unstarRes = await git.toggleStar(kddRepo.id);
  assert(unstarRes.isStarred === false, 'git.toggleStar() desmarca estrella');
  const invalidStar = await git.toggleStar('non-existent-repo-id');
  assert(invalidStar === null, 'git.toggleStar() retorna null ante repo inexistente (Forzado)');

  const forkedRepo = await git.forkRepository(kddRepo.id, 'bob');
  assert(forkedRepo.owner === 'bob' && forkedRepo.forkedFrom === 'MauricioPerera/KDD', 'git.forkRepository() duplica repo con puntero forkedFrom');

  let forkInvalidError = false;
  try {
    await git.forkRepository('non-existent-id', 'bob');
  } catch (err) {
    forkInvalidError = true;
  }
  assert(forkInvalidError, 'git.forkRepository() arroja error ante repositorio origen inexistente (Forzado)');

  // Test 2.7: Algoritmo de Diff línea por línea (Idéntico, Añadido, Eliminado, Mixto, Vacíos)
  const diffIdentical = git.computeLineDiff('a\nb\nc', 'a\nb\nc');
  assert(diffIdentical.every(d => d.type === 'unchanged'), 'computeLineDiff() identifica textos idénticos');

  const diffAdded = git.computeLineDiff('line 1', 'line 1\nline 2');
  assert(diffAdded.some(d => d.type === 'added' && d.text === 'line 2'), 'computeLineDiff() identifica líneas añadidas');

  const diffRemoved = git.computeLineDiff('line 1\nline 2', 'line 1');
  assert(diffRemoved.some(d => d.type === 'removed' && d.text === 'line 2'), 'computeLineDiff() identifica líneas removidas');

  const diffEmpty = git.computeLineDiff('', '');
  assert(diffEmpty.length === 1 && diffEmpty[0].type === 'unchanged', 'computeLineDiff() maneja textos vacíos sin crashear');

  // -------------------------------------------------------------------------
  // MÓDULO 3: KDD-ENGINE.JS (Parser OKF, Validador Determinista CCDD)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 3: kdd-engine.js - Motor KDD, OKF y Puerta Determinista CCDD]${RESET}`);

  // Test 3.1: Parser OKF (Happy Path)
  const validOKF = `---
type: 'Task Contract'
title: 'Test Contract'
description: 'Pure function'
tags: ['ccdd', 'test']
budget:
  max_cyclomatic_complexity: 4
---
# Contract Details
Links to [OKF-SPEC.md](../OKF-SPEC.md)
`;
  const parsedOKF = kdd.parseOKFNode(validOKF);
  assert(parsedOKF.hasFrontmatter === true, 'parseOKFNode() detecta delimitadores válidos');
  assert(parsedOKF.frontmatter.type === 'Task Contract', 'parseOKFNode() extrae campo type');
  assert(parsedOKF.frontmatter.budget.max_cyclomatic_complexity === 4, 'parseOKFNode() extrae sub-objeto anidado budget');
  assert(Array.isArray(parsedOKF.frontmatter.tags) && parsedOKF.frontmatter.tags.length === 2, 'parseOKFNode() extrae lista tags');

  // Test 3.2: Parser OKF - Forzado de Entradas Inválidas / Casos Borde
  assert(kdd.parseOKFNode(null).hasFrontmatter === false, 'parseOKFNode(null) maneja nulo de forma segura');
  assert(kdd.parseOKFNode('').hasFrontmatter === false, 'parseOKFNode("") maneja string vacío');
  assert(kdd.parseOKFNode(12345).hasFrontmatter === false, 'parseOKFNode(number) maneja tipos no string');
  assert(kdd.parseOKFNode('Sin frontmatter').hasFrontmatter === false, 'parseOKFNode() rechaza texto sin frontmatter');
  assert(kdd.parseOKFNode('---\nopen but not closed').hasFrontmatter === false, 'parseOKFNode() rechaza frontmatter sin cierre');

  // Test 3.3: Cálculo de Complejidad Ciclomática (Heurística Determinista)
  const simpleCode = 'def add(a, b):\n    return a + b\n';
  assert(kdd.calculateCyclomaticComplexity(simpleCode) === 1, 'calculateCyclomaticComplexity() para código plano = 1');

  const complexCode = `
def check(val):
    if val > 10:
        for x in range(val):
            if x % 2 == 0 or x % 3 == 0:
                pass
    elif val < 0:
        pass
    return True
`;
  // base (1) + if (1) + for (1) + if (1) + or (1) + elif (1) = 6
  const calcComp = kdd.calculateCyclomaticComplexity(complexCode);
  assert(calcComp === 6, `calculateCyclomaticComplexity() calcula correctamente ramificaciones (obtenido: ${calcComp})`);

  // Test 3.4: Los comentarios no deben incrementar complejidad
  const commentedCode = `
def test():
    # if this were code it would branch
    // while loop in comment
    return 1
`;
  assert(kdd.calculateCyclomaticComplexity(commentedCode) === 1, 'calculateCyclomaticComplexity() ignora palabras clave dentro de comentarios');

  // Test 3.5: Validación Determinista CCDD - Happy Path (implementar_verify_user.md)
  const validAudit = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/implementar_verify_user.md');
  assert(validAudit.verdict === 'PASSED', 'validateContract() dictamina PASSED en contrato conforme');
  assert(validAudit.checks.every(c => c.status === 'PASS'), 'validateContract() aprueba todos los checks individuales');

  // Test 3.6: Forzado de Error 1 - Archivo de contrato inexistente
  const auditMissingContract = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/non_existent.md');
  assert(auditMissingContract.verdict === 'FAILED', 'validateContract() rechaza contrato inexistente (Forzado)');

  // Test 3.7: Forzado de Error 2 - Frontmatter ausente
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/bad_no_fm.md', '# Solo Markdown sin frontmatter');
  const auditNoFm = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/bad_no_fm.md');
  assert(auditNoFm.verdict === 'FAILED' && auditNoFm.checks.some(c => c.name === 'OKF Frontmatter' && c.status === 'FAIL'), 'validateContract() falla si falta frontmatter (Forzado)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/bad_no_fm.md');

  // Test 3.8: Forzado de Error 3 - Tipo de nodo incorrecto
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/bad_type.md', '---\ntype: \'Standard\'\ntask: t\n---\nBody');
  const auditBadType = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/bad_type.md');
  assert(auditBadType.verdict === 'FAILED' && auditBadType.checks.some(c => c.name === 'Node Type' && c.status === 'FAIL'), 'validateContract() falla si type != "Task Contract" (Forzado)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/bad_type.md');

  // Test 3.9: Forzado de Error 4 - Campos requeridos faltantes
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/bad_missing_fields.md', '---\ntype: \'Task Contract\'\ntask: demo\n---\nBody');
  const auditMissingFields = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/bad_missing_fields.md');
  assert(auditMissingFields.verdict === 'FAILED' && auditMissingFields.checks.some(c => c.name === 'Required CCDD Fields' && c.status === 'FAIL'), 'validateContract() falla ante campos CCDD faltantes (Forzado)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/bad_missing_fields.md');

  // Test 3.10: Forzado de Error 5 - Archivo target de implementación inexistente
  const badTargetContract = `---
type: 'Task Contract'
task: bad_target
intent: 'Testing missing target'
target: src/ghost_target.py
signature: 'def test():'
test_command: 'pytest'
budget:
  max_cyclomatic_complexity: 4
tests: tests/test_verify_user.py
---
Ref [OKF-SPEC.md](../OKF-SPEC.md)
`;
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/bad_target.md', badTargetContract);
  const auditBadTarget = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/bad_target.md');
  assert(auditBadTarget.verdict === 'FAILED' && auditBadTarget.checks.some(c => c.name === 'Target Implementation' && c.status === 'FAIL'), 'validateContract() falla si target no existe (Forzado)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/bad_target.md');

  // Test 3.11: Forzado de Error 6 - Oráculo de prueba congelado inexistente
  const badTestContract = `---
type: 'Task Contract'
task: bad_tests
intent: 'Testing missing tests'
target: src/verify_user.py
signature: 'def test():'
test_command: 'pytest'
budget:
  max_cyclomatic_complexity: 4
tests: tests/ghost_test.py
---
Ref [OKF-SPEC.md](../OKF-SPEC.md)
`;
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/bad_tests.md', badTestContract);
  const auditBadTests = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/bad_tests.md');
  assert(auditBadTests.verdict === 'FAILED' && auditBadTests.checks.some(c => c.name === 'Frozen Test Oracle' && c.status === 'FAIL'), 'validateContract() falla si test oracle no existe (Forzado)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/bad_tests.md');

  // Test 3.12: Forzado de Error 7 - Violación de Presupuesto de Complejidad
  await store.saveFile(kddRepo.id, 'main', 'src/over_complex.py', complexCode);
  await store.saveFile(kddRepo.id, 'main', 'tests/test_over_complex.py', '# test oracle');
  const overBudgetContract = `---
type: 'Task Contract'
task: over_budget
intent: 'Testing budget overflow'
target: src/over_complex.py
signature: 'def check(val):'
test_command: 'pytest'
budget:
  max_cyclomatic_complexity: 3
tests: tests/test_over_complex.py
---
Ref [OKF-SPEC.md](../OKF-SPEC.md)
`;
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/over_budget.md', overBudgetContract);
  const auditOverBudget = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/over_budget.md');
  assert(auditOverBudget.verdict === 'FAILED' && auditOverBudget.checks.some(c => c.name === 'Cyclomatic Complexity Budget' && c.status === 'FAIL'), 'validateContract() rechaza código que supera el presupuesto de complejidad (Forzado: 6 > 3)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/over_budget.md');
  await store.deleteFile(kddRepo.id, 'main', 'src/over_complex.py');
  await store.deleteFile(kddRepo.id, 'main', 'tests/test_over_complex.py');

  // Test 3.13: Forzado de Error 8 - Violación de Perímetro de Dependencias (deps_allowed)
  const forbiddenImportCode = `
import requests
import re
def run(): pass
`;
  await store.saveFile(kddRepo.id, 'main', 'src/forbidden_deps.py', forbiddenImportCode);
  const forbiddenDepContract = `---
type: 'Task Contract'
task: forbidden_deps
intent: 'Testing deps violation'
target: src/forbidden_deps.py
signature: 'def run():'
test_command: 'pytest'
budget:
  max_cyclomatic_complexity: 4
tests: tests/test_over_complex.py
deps_allowed:
  - re
---
Ref [OKF-SPEC.md](../OKF-SPEC.md)
`;
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/forbidden_dep.md', forbiddenDepContract);
  const auditForbiddenDep = await kdd.validateContract(kddRepo.id, 'knowledge/contracts/forbidden_dep.md');
  assert(auditForbiddenDep.verdict === 'FAILED' && auditForbiddenDep.checks.some(c => c.name === 'Dependency Perimeter' && c.status === 'FAIL'), 'validateContract() detecta importaciones fuera de deps_allowed (Forzado: requests no permitido)');
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/forbidden_dep.md');
  await store.deleteFile(kddRepo.id, 'main', 'src/forbidden_deps.py');

  // -------------------------------------------------------------------------
  // MÓDULO 4: WEBMCP-PROVIDER.JS (FastWebMCP, WebMCP Tools, Playground)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 4: webmcp-provider.js - FastWebMCP & Estándar webmcp.com]${RESET}`);

  // Test 4.1: Registro de herramientas y validación de nombres según spec WebMCP
  assert(webmcp.registry.size === 12, 'webmcp tiene exactamente 12 herramientas registradas');

  let invalidCharToolError = false;
  try {
    webmcp.registerImperativeTool({ name: 'invalid tool with spaces!!', execute: async () => {} });
  } catch (err) {
    invalidCharToolError = true;
  }
  assert(invalidCharToolError, 'registerImperativeTool() rechaza nombres con caracteres no conformes con WebMCP (Forzado)');

  let emptyToolError = false;
  try {
    webmcp.registerImperativeTool({ name: '', execute: async () => {} });
  } catch (err) {
    emptyToolError = true;
  }
  assert(emptyToolError, 'registerImperativeTool() rechaza nombres vacíos (Forzado)');

  // Test 4.2: Invocación de herramientas - Happy Path de las 10 herramientas
  const t1 = await webmcp.invokeTool('list_repositories', {});
  assert(t1.status === 'success' && t1.result.length >= 3, 'Tool 1: list_repositories retorna repositorios');

  const t2 = await webmcp.invokeTool('get_repository', { owner: 'MauricioPerera', name: 'KDD' });
  assert(t2.status === 'success' && t2.result.name === 'KDD', 'Tool 2: get_repository retorna repositorio');

  const t3 = await webmcp.invokeTool('get_file', { owner: 'MauricioPerera', name: 'KDD', path: 'README.md', branch: 'main' });
  assert(t3.status === 'success' && t3.result.content.length > 0, 'Tool 3: get_file retorna contenido');

  const t4 = await webmcp.invokeTool('create_or_update_file', {
    owner: 'MauricioPerera',
    name: 'KDD',
    path: 'agent_file.txt',
    content: 'Created via WebMCP',
    message: 'test commit'
  });
  assert(t4.status === 'success' && t4.result.commitId, 'Tool 4: create_or_update_file realiza commit exitoso');

  const t5 = await webmcp.invokeTool('list_issues', { owner: 'MauricioPerera', name: 'KDD', state: 'all' });
  assert(t5.status === 'success' && t5.result.length > 0, 'Tool 5: list_issues lista incidencias');

  const t6 = await webmcp.invokeTool('create_issue', { owner: 'MauricioPerera', name: 'KDD', title: 'Issue via WebMCP', body: 'Test' });
  assert(t6.status === 'success' && t6.result.title === 'Issue via WebMCP', 'Tool 6: create_issue crea incidencia');

  const t7 = await webmcp.invokeTool('create_pull_request', {
    owner: 'MauricioPerera',
    name: 'KDD',
    title: 'PR via WebMCP',
    sourceBranch: 'feature/test-branch',
    targetBranch: 'main'
  });
  assert(t7.status === 'success' && t7.result.number >= 1, 'Tool 7: create_pull_request crea PR');

  const t8 = await webmcp.invokeTool('validate_kdd_contract', {
    owner: 'MauricioPerera',
    name: 'KDD',
    contract_path: 'knowledge/contracts/implementar_verify_user.md'
  });
  assert(t8.status === 'success' && t8.result.verdict === 'PASSED', 'Tool 8: validate_kdd_contract valida contrato vía MCP');

  const t9 = await webmcp.invokeTool('get_kdd_board', { owner: 'MauricioPerera', name: 'KDD' });
  assert(t9.status === 'success' && t9.result.columns.length === 5, 'Tool 9: get_kdd_board retorna tablero de 5 columnas');

  const t10 = await webmcp.invokeTool('update_kdd_task', { card_id: 'card-1', column: 'done' });
  assert(t10.status === 'success' && t10.result.column === 'done', 'Tool 10: update_kdd_task mueve tarjeta a done');

  const t11 = await webmcp.invokeTool('trigger_workflow', { owner: 'MauricioPerera', name: 'KDD', workflow_name: 'validate-contracts' });
  assert(t11.status === 'success' && t11.result.id && t11.result.status === 'completed', 'Tool 11: trigger_workflow dispara y completa workflow CI/CD');

  const t12 = await webmcp.invokeTool('get_workflow_runs', { owner: 'MauricioPerera', name: 'KDD' });
  assert(t12.status === 'success' && t12.result.length >= 1, 'Tool 12: get_workflow_runs lista ejecuciones de workflow');

  const t12Single = await webmcp.invokeTool('get_workflow_runs', { owner: 'MauricioPerera', name: 'KDD', run_id: t11.result.id });
  assert(t12Single.status === 'success' && t12Single.result.id === t11.result.id, 'Tool 12b: get_workflow_runs inspecciona ejecución específica por ID');

  // Test 4.3: Invocación de herramientas - Forzado de Errores
  const nonExistentTool = await webmcp.invokeTool('ghost_tool', {});
  assert(nonExistentTool.status === 'error' && nonExistentTool.error.includes('not found'), 'invokeTool() maneja herramienta inexistente (Forzado)');

  const getRepoMissing = await webmcp.invokeTool('get_repository', { owner: 'ghost', name: 'ghost' });
  assert(getRepoMissing.status === 'error', 'Tool get_repository maneja repo inexistente retornando error (Forzado)');

  const getFileMissing = await webmcp.invokeTool('get_file', { owner: 'MauricioPerera', name: 'KDD', path: 'no_file.md' });
  assert(getFileMissing.status === 'error', 'Tool get_file maneja archivo inexistente retornando error (Forzado)');

  const updateCardMissing = await webmcp.invokeTool('update_kdd_task', { card_id: 'ghost-card', column: 'done' });
  assert(updateCardMissing.status === 'error', 'Tool update_kdd_task maneja tarjeta inexistente retornando error (Forzado)');

  const triggerWorkflowMissingRepo = await webmcp.invokeTool('trigger_workflow', { owner: 'ghost', name: 'ghost' });
  assert(triggerWorkflowMissingRepo.status === 'error', 'Tool trigger_workflow rechaza repositorio inexistente (Forzado)');

  const getRunsMissingRepo = await webmcp.invokeTool('get_workflow_runs', { owner: 'ghost', name: 'ghost' });
  assert(getRunsMissingRepo.status === 'error', 'Tool get_workflow_runs rechaza repositorio inexistente (Forzado)');

  const getRunsMissingRunId = await webmcp.invokeTool('get_workflow_runs', { owner: 'MauricioPerera', name: 'KDD', run_id: 'non-existent-run-id' });
  assert(getRunsMissingRunId.status === 'error', 'Tool get_workflow_runs maneja run_id inexistente (Forzado)');

  // Test 4.4: Declarative WebMCP API (defineDeclarativeTool)
  const mockForm = {
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = v; },
    querySelector: function () {
      return {
        attrs: {},
        setAttribute: function (k, v) { this.attrs[k] = v; }
      };
    }
  };
  webmcp.defineDeclarativeTool(mockForm, {
    name: 'test_form_tool',
    description: 'Declarative test description',
    autoSubmit: true,
    fields: [{ name: 'f1', description: 'Field 1 desc' }]
  });
  assert(mockForm.attrs['toolname'] === 'test_form_tool' && mockForm.attrs['toolautosubmit'] === 'true', 'defineDeclarativeTool() aplica atributos WebMCP a formulario');

  // Test 4.5: Exportación de Directorio JSON compatible con webmcp.com
  const dirJson = webmcp.exportDirectorySchema();
  assert(dirJson.standard === 'https://webmcp.com' && dirJson.toolsCount === 12, 'exportDirectorySchema() cumple especificación webmcp.com con 12 herramientas');

  // -------------------------------------------------------------------------
  // MÓDULO 5: APP.JS (Seguridad, XSS, Fechas y UI Helpers)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 5: app.js - Seguridad, Escapado XSS y Funciones de Utilidad]${RESET}`);

  // Mock global DOM elements for app instance
  global.document = {
    documentElement: { classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {} }, appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null
  };
  eval(appCode);
  const app = window.app;

  // Test 5.1: Prevención XSS (escapeHtml)
  const xssInput = '<script>alert("xss")</script>&<tag attr=\'val\'>';
  const escaped = app.escapeHtml(xssInput);
  assert(!escaped.includes('<script>') && escaped.includes('&lt;script&gt;') && escaped.includes('&amp;'), 'escapeHtml() neutraliza inyecciones XSS de etiquetas y caracteres');

  // Test 5.2: Formateador de tiempo relativo (timeAgo)
  const now = new Date().toISOString();
  assert(app.timeAgo(now) === 'just now', 'timeAgo(now) -> just now');

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert(app.timeAgo(fiveMinutesAgo) === '5m ago', 'timeAgo(5m) -> 5m ago');

  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  assert(app.timeAgo(twoHoursAgo) === '2h ago', 'timeAgo(2h) -> 2h ago');

  const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  assert(app.timeAgo(threeDaysAgo) === '3d ago', 'timeAgo(3d) -> 3d ago');

  // -------------------------------------------------------------------------
  // MÓDULO 6: ACTIONS-ENGINE.JS (KDD Actions & Client-Side CI/CD Runner)
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}[SUITE 6: actions-engine.js - Motor CI/CD Client-Side KDD Actions]${RESET}`);

  // Test 6.1: Detección de workflows definidos (.github/workflows/*.yml)
  const wfList = await actions.getWorkflows(kddRepo.id, 'main');
  assert(Array.isArray(wfList) && wfList.length >= 1, 'getWorkflows() detecta archivos de workflow en repositorio');
  assert(wfList.some(w => w.name === 'validate-contracts'), 'getWorkflows() localiza el workflow validate-contracts');

  // Test 6.2: Ejecución completa y determinista del pipeline CI/CD (7 pasos)
  let updateCallbackCount = 0;
  const ciRun = await actions.runWorkflow({
    repoId: kddRepo.id,
    branch: 'main',
    workflowName: 'validate-contracts',
    event: 'workflow_dispatch',
    onUpdate: (r) => { updateCallbackCount++; }
  });

  assert(ciRun.id.startsWith('run-'), 'runWorkflow() genera ID único con prefijo run-');
  assert(ciRun.status === 'completed', 'runWorkflow() finaliza con estado completed');
  assert(ciRun.conclusion === 'success', 'runWorkflow() concluye con veredicto success');
  assert(ciRun.steps.length === 7, 'runWorkflow() ejecuta los 7 pasos del pipeline determinista');
  assert(ciRun.steps.every(s => s.status === 'completed' && s.conclusion === 'success'), 'Todos los 7 pasos culminaron exitosamente (status completed, conclusion success)');
  assert(ciRun.logs.includes('[SUCCESS]') && ciRun.logs.includes('Step 7/7'), 'Terminal de logs contiene salida detallada y reporte sellado');
  assert(updateCallbackCount >= 7, 'Callback onUpdate() recibe actualizaciones reactivas durante la ejecución');

  // Test 6.3: Verificación de persistencia en store (IndexedDB / LocalStorage)
  const storedRuns = await store.getWorkflowRuns(kddRepo.id);
  assert(storedRuns.length >= 1 && storedRuns.some(r => r.id === ciRun.id), 'store.getWorkflowRuns() persiste la ejecución del pipeline');

  const singleStoredRun = await store.getWorkflowRun(ciRun.id);
  assert(singleStoredRun && singleStoredRun.steps.length === 7, 'store.getWorkflowRun() recupera ejecución completa con sus 7 pasos');

  // Test 6.4: Reporte de evidencia sellado generado en el repositorio
  const reportFiles = await store.getFiles(kddRepo.id, 'main');
  const sealedReport = reportFiles.find(f => f.path.startsWith('.agents/logs/ci-run-') && f.path.endsWith('-REPORT.md'));
  assert(sealedReport && sealedReport.content.includes('PASSED'), 'Paso 7 genera y sella el reporte de evidencia en .agents/logs/*-REPORT.md');

  // Test 6.5: Forzado de Error CI/CD - Nodo OKF sin Frontmatter
  await store.saveFile(kddRepo.id, 'main', 'knowledge/broken_ci_node.md', '# Broken Node\nSin YAML frontmatter');
  const brokenOkfRun = await actions.runWorkflow({
    repoId: kddRepo.id,
    branch: 'main',
    workflowName: 'validate-contracts',
    event: 'push',
    commitMessage: 'Commit with broken OKF node'
  });
  assert(brokenOkfRun.status === 'completed' && brokenOkfRun.conclusion === 'failure', 'runWorkflow() falla determinísticamente ante nodo OKF inválido (Forzado)');
  assert(brokenOkfRun.steps[1].conclusion === 'failure', 'Paso 2 (Validate OKF Structure) marca conclusion failure ante nodo corrupto');
  assert(brokenOkfRun.logs.includes('[FAIL] Node \'knowledge/broken_ci_node.md\' missing valid YAML frontmatter'), 'Logs del terminal reflejan falla explícita de validación OKF');
  // Limpieza
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/broken_ci_node.md');

  // Test 6.6: Forzado de Error CI/CD - Tarea que viola el presupuesto de complejidad ciclomática
  const heavyContract = `---
type: Task Contract
title: Heavy Task
target: src/heavy.py
tests: tests/test_heavy.py
budget:
  max_cyclomatic_complexity: 2
---
# Contract Exceeding Budget
`;
  const heavyCode = `
def complex_fn(a, b, c):
    if a:
        if b:
            return 1
        elif c:
            return 2
    return 0
`;
  await store.saveFile(kddRepo.id, 'main', 'knowledge/contracts/heavy_task.md', heavyContract);
  await store.saveFile(kddRepo.id, 'main', 'src/heavy.py', heavyCode);

  const budgetFailRun = await actions.runWorkflow({
    repoId: kddRepo.id,
    branch: 'main',
    workflowName: 'validate-contracts',
    event: 'workflow_dispatch'
  });
  assert(budgetFailRun.conclusion === 'failure', 'runWorkflow() rechaza pipeline cuando el código excede presupuesto de complejidad (Forzado)');
  assert(budgetFailRun.steps[3].conclusion === 'failure', 'Paso 4 (Cyclomatic Complexity Budget Check) marca conclusion failure');

  // Limpieza
  await store.deleteFile(kddRepo.id, 'main', 'knowledge/contracts/heavy_task.md');
  await store.deleteFile(kddRepo.id, 'main', 'src/heavy.py');

  // -------------------------------------------------------------------------
  // RESUMEN FINAL DE EJECUCIÓN
  // -------------------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}======================================================================${RESET}`);
  console.log(`${BOLD}RESUMEN DE LA BATERÍA DE PRUEBAS DE EXTREMO A EXTREMO:${RESET}`);
  console.log(`Total Pruebas Ejecutadas: ${BOLD}${totalTests}${RESET}`);
  console.log(`Pruebas Superadas (PASS): ${BOLD}${GREEN}${passedTests}${RESET}`);
  console.log(`Pruebas Fallidas (FAIL):  ${BOLD}${failedTests === 0 ? GREEN : RED}${failedTests}${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================================${RESET}\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal Error en Suite:', err);
  process.exit(1);
});
