# GitHub Client-Side Clone (KDD & WebMCP Powered)

[![WebMCP Ready](https://img.shields.io/badge/WebMCP-10%20Tools%20Active-06b6d4)](https://webmcp.com)
[![KDD Methodology](https://img.shields.io/badge/KDD-Deterministic%20Gates-10b981)](https://github.com/MauricioPerera/KDD)
[![fastwebmcp](https://img.shields.io/badge/fastwebmcp-v0.4.2-f97316)](https://mauricioperera.github.io/fastwebmcp/)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-238636)](https://pages.github.com/)

Un clon de GitHub **100% funcional y 100% client-side**, diseñado específicamente para ejecutarse en **GitHub Pages** (o cualquier servidor de archivos estáticos) sin necesidad de infraestructura de backend.

Impulsado por:
- **[Tailwind CSS](https://tailwindcss.com/)**: Estética idéntica a GitHub (Dark Primer mode por defecto, Light mode toggle, explorador de archivos, badges, modales, visual diff viewer).
- **[HTMX](https://htmx.org/)**: Navegación y swaps declarativos en el cliente sin recarga de página a través del puente `htmx-bridge.js`.
- **[KDD (Knowledge-Driven Development)](https://github.com/MauricioPerera/KDD)**: Metodología creada por Mauricio Perera que unifica **OKF** (Open Knowledge Format) y **CCDD** (Contract-Driven Development) para gobernar agentes de IA con puertas deterministas (sin jueces LLM).
- **[fastwebmcp](https://mauricioperera.github.io/fastwebmcp/) & [webmcp.com](https://webmcp.com)**: Exposición de herramientas MCP directamente en el navegador del cliente mediante `document.modelContext`, permitiendo que agentes de IA naveguen, lean y modifiquen repositorios de manera nativa.

---

## 🌟 Características Principales

### 1. Interfaz y Motor Git Virtual 100% Client-Side
- **Explorador de Archivos**: Árbol jerárquico de carpetas con conteo de elementos y navegación breadcrumb.
- **Visor de Código y Markdown**:
  - Resaltado de sintaxis automático con Highlight.js (Python, JavaScript, TypeScript, Markdown, JSON, YAML, Bash, etc.).
  - Renderizado Markdown interactivo para `README.md` y documentación con `marked.js`.
- **Editor y Sistema de Commits**: Permite crear nuevos archivos, editar archivos existentes y generar commits con autor, timestamp y hash SHA simulado.
- **Gestor de Ramas (Branches)**: Creación y conmutación instantánea entre ramas (`main`, `feature/observability-gate`, etc.).
- **Visual Line-by-Line Diff Viewer**: Comparador visual de diferencias entre ramas o versiones con resaltado de adiciones (+) en verde y supresiones (-) en rojo.
- **Issues y Pull Requests**: Gestión completa con estados (abierto/cerrado), autor, etiquetas de colores y comentarios.
- **Star & Fork Simulation**: Marca repositorios con estrella o crea forks independientes en el espacio del usuario.
- **Persistencia en IndexedDB / localStorage**: Todos los datos sobreviven recargas de página y sesiones del navegador.

### 2. Soporte Nativo para KDD (Knowledge-Driven Development)
- **OKF Inspector**: Parseo automático de Frontmatter YAML en documentos Markdown (`type`, `title`, `description`, `tags`).
- **Validador Determinista CCDD en el Navegador**:
  - Verifica campos obligatorios (`task`, `intent`, `target`, `signature`, `test_command`, `budget`, `tests`).
  - Audita el presupuesto de complejidad ciclomática (`max_cyclomatic_complexity`) analizando el código objetivo en tiempo real.
  - Valida el perímetro de dependencias permitidas (`deps_allowed`).
  - Confirma la existencia de implementaciones y oráculos de prueba congelados (`tests`).
  - Verifica la regla OKF de enlaces relativos (`[link](...)`) para evitar redundancia de reglas de negocio.
- **KDD-Board (Kanban)**:
  - Tablero de 5 columnas:
    1. `backlog`
    2. `ready` (Listo para agente efímero)
    3. `in_progress` (Desarrollo en curso por agente)
    4. `needs_human_input` (Puerta de decisión humana)
    5. `done` (Contrato sellado y validado)
  - Botón de ejecución del "Deterministic Gate" directamente desde cualquier tarjeta del tablero.

### 3. Integración con FastWebMCP y WebMCP (webmcp.com)
- **API Imperativa en `document.modelContext`**:
  Registra 10 herramientas MCP que cualquier agente de IA o extensión de navegador WebMCP puede invocar:
  1. `list_repositories`: Lista repositorios disponibles.
  2. `get_repository`: Obtiene ramas, estrellas y metadatos.
  3. `get_file`: Lee archivos en una rama y ruta específica.
  4. `create_or_update_file`: Realiza commits de archivos nuevos o modificados.
  5. `list_issues`: Lista y filtra incidencias.
  6. `create_issue`: Crea un nuevo issue.
  7. `create_pull_request`: Abre un PR entre ramas.
  8. `validate_kdd_contract`: Ejecuta la validación determinista de un contrato CCDD.
  9. `get_kdd_board`: Obtiene el estado del tablero Kanban KDD.
  10. `update_kdd_task`: Mueve tarjetas entre etapas o asigna agentes.
- **API Declarativa**: Atributos `toolname`, `tooldescription` y `toolparamdescription` integrados en los formularios de la UI.
- **WebMCP Agent Playground**: Consola flotante integrada para inspectores y desarrolladores. Permite probar cualquier herramienta en vivo con argumentos JSON y ver la respuesta JSON-RPC formateada en tiempo real.
- **Exportación de Directorio JSON**: Compatible con el formato de índice de `webmcp.com`.

### 4. Portabilidad y Copias de Seguridad
- **Exportar JSON**: Descarga una copia completa de todos los repositorios, ramas, archivos, commits y tableros.
- **Importar JSON**: Restaura cualquier estado previamente exportado con un solo clic.
- **Reset to Seed Data**: Restaura instantáneamente los repositorios muestra (`MauricioPerera/KDD`, `MauricioPerera/fastwebmcp`, `octocat/Hello-World`).

---

## 🚀 Despliegue en GitHub Pages

Este proyecto no requiere compilación previa (`npm run build`), Webpack ni Vite. Es 100% código estático nativo.

### Pasos para desplegar:
1. Crea un repositorio en GitHub (por ejemplo, `github-client`).
2. Sube los archivos de este directorio:
   ```bash
   git init
   git add .
   git commit -m "feat: initial commit of client-side github clone"
   git branch -M main
   git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
   git push -u origin main
   ```
3. En GitHub, ve a **Settings** -> **Pages**.
4. En **Build and deployment** -> **Source**, selecciona **Deploy from a branch**.
5. Selecciona la rama `main` y la carpeta `/ (root)`, luego haz clic en **Save**.
6. En un par de minutos, tu sitio estará publicado en:
   `https://<tu-usuario>.github.io/<tu-repo>/`

---

## 📁 Estructura del Proyecto

```
github-kdd-clone/
├── index.html                 # Página principal y layout auténtico de GitHub
├── 404.html                   # Manejador SPA para GitHub Pages
├── README.md                  # Este documento
├── css/
│   └── custom.css             # Ajustes de tema, scrollbars y estilos Markdown
├── js/
│   ├── store.js               # Motor de persistencia en IndexedDB / localStorage
│   ├── git-engine.js          # Motor Git: árboles, commits, ramas y visual diff
│   ├── kdd-engine.js          # Motor KDD: parser OKF, validador CCDD y KDD-Board
│   ├── webmcp-provider.js     # Proveedor WebMCP y consola interactiva para agentes
│   ├── htmx-bridge.js         # Puente HTMX para interactividad client-side
│   └── app.js                 # Router hash y orquestador de vistas
└── data/
    └── seed-repos.json        # Repositorios precargados (KDD, fastwebmcp, Hello-World)
```

---

## 🧪 Verificación Local

Puedes probar la aplicación localmente abriendo `index.html` en tu navegador o utilizando cualquier servidor estático:

```bash
# Con Python
python -m http.server 8000

# O con npx
npx serve .
```

Luego visita `http://localhost:8000`.
