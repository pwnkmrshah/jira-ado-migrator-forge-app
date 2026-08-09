# Project Structure Explained

## Directory Layout

```
jira-ado-migrator-forge-app/
│
├── 📄 manifest.yml              ← App definition (entry point, permissions)
├── 📄 package.json              ← Dependencies & npm scripts
├── 📄 .env.example              ← Environment template (COPY & FILL THIS)
├── 📄 .gitignore                ← Git ignore rules
├── 📄 README.md                 ← Full documentation
├── 📄 QUICK-START.md            ← This file
│
├── 📁 src/                      ← Source code
│   │
│   ├── 📁 frontend/             ← React components (what user sees)
│   │   ├── App.jsx              ← Main component, state management
│   │   ├── App.css              ← All styling (forms, buttons, progress)
│   │   └── 📁 components/       ← Reusable components
│   │       ├── MigrationForm.jsx        ← Step 1-2: Form + mappings
│   │       ├── ProgressIndicator.jsx    ← Step 3: Progress bar + log
│   │       └── SuccessScreen.jsx        ← Step 4: Success message
│   │
│   └── 📁 backend/              ← Node.js handlers (what runs on server)
│       ├── index.js             ← Forge handlers (handleMigrateDialog, startMigration, etc)
│       ├── python-runner.js     ← Spawns Python CLI process, streams output
│       └── copilot-mapper.js    ← AI field mapping logic
│
└── 📁 dist/                     ← Compiled output (auto-generated after build)
    └── (compiled JavaScript)
```

## File Purposes at a Glance

### Entry Point
| File | Purpose |
|------|---------|
| `manifest.yml` | Tells Jira what this app is, what buttons it adds, what permissions it needs, and which Node runtime to use |
| `babel.config.json` | Tells the Forge bundler how to compile JSX syntax |

### Frontend (UI Kit 2, `@forge/react`)
| File | Purpose |
|------|---------|
| `src/index.js` | All UI: SetupForm + InProgress + Success screens. Manages state transitions. |

### Backend (Node.js)
| File | Purpose |
|------|---------|
| `src/backend/index.js` | Forge resolver handlers — called by the frontend via `invoke()` |
| `src/backend/python-runner.js` | Spawns Python subprocess to run `worker_jira_to_ado_copy.py` |
| `src/backend/copilot-mapper.js` | AI field mapping suggestions with confidence scores |

### Config Files
| File | Purpose |
|------|---------|
| `package.json` | Dependencies: `@forge/api`, `@forge/react`, `@babel/preset-react` (dev) + npm scripts |
| `.env.example` | Template for your credentials |
| `.gitignore` | Prevents .env, node_modules, dist from being committed |
| `README.md` | Full documentation |

---

## What Happens at Each Step

### 1️⃣ npm install
```
Reads package.json
↓
Downloads react, axios, forge libraries
↓
Creates node_modules/ folder (500+ MB)
```

### 2️⃣ npm run dev
```
Starts forge tunnel (ngrok-like)
↓
Opens persistent connection
↓
Prints: https://xyz.ngrok.io
↓
You install this URL in Jira
↓
Changes to code auto-sync to Jira
```

### 3️⃣ User Clicks Button in Jira
```
React component (MigrationForm) loads
↓
Calls backend: getSuggestedMappings()
↓
Backend calls copilot-mapper.js
↓
Returns AI mappings
↓
Form displays project selector + mappings
```

### 4️⃣ User Clicks "Start Migration"
```
React component calls backend: startMigration()
↓
Backend (index.js) calls python-runner.js
↓
python-runner spawns subprocess:
  → python worker_jira_to_ado_copy.py ...
↓
Python script runs migration (30+ min)
↓
Output streamed back to frontend
↓
ProgressIndicator shows live updates
↓
On completion → SuccessScreen
```

---

## Development Workflow

### Add a New Component
1. Create file: `src/frontend/components/MyComponent.jsx`
2. Export function: `export default function MyComponent() { ... }`
3. Import in `App.jsx`: `import MyComponent from './components/MyComponent'`
4. Use in JSX: `<MyComponent data={data} />`
5. Auto-syncs to Jira (while `npm run dev` running)

### Edit Styles
1. Edit `src/frontend/App.css`
2. Add CSS classes
3. Reference in JSX: `<div className="my-class">`
4. Changes appear in Jira immediately

### Add Backend Handler
1. Edit `src/backend/index.js`
2. Create new function: `export async function myHandler(req, res) { ... }`
3. Update `manifest.yml` to call it
4. Redeploy: `npm run deploy`

### Debug
```bash
npm run dev
# Terminal shows logs from backend

# Browser (F12):
# → Console tab shows frontend logs
# → Network tab shows API calls
```

---

## Key Concepts

### Forge vs Traditional Plugin
- **Traditional**: JAR file, runs on your server, complex setup
- **Forge**: JavaScript, runs on Atlassian cloud, simple deploy
- **We chose Forge** because it's modern and easier to develop

### React Components
Each component is a reusable function that returns JSX (HTML-like syntax):
```javascript
export default function MyComponent({ data }) {
  return <div className="my-component">Hello {data.name}</div>;
}
```

### Backend Handlers
Forge calls these functions in response to user actions:
```javascript
export async function startMigration(req, res) {
  // 1. Get request data
  // 2. Run business logic
  // 3. Return response
}
```

### Python Integration
Backend spawns Python subprocess:
```javascript
const python = spawn('python3', ['script.py', '--args']);
python.stdout.on('data', (data) => {
  // Stream output back to frontend
});
```

---

## Common Edits You'll Make

### Change Button Text
File: `src/frontend/components/MigrationForm.jsx`
```javascript
// Find this:
<button type="submit" className="btn btn-primary">
  Start Migration
</button>

// Change to:
<button type="submit" className="btn btn-primary">
  ⚡ Migrate Now
</button>
```

### Add New Field to Form
File: `src/frontend/components/MigrationForm.jsx`
```javascript
// In form, add:
<div className="form-group">
  <label htmlFor="newField">New Field</label>
  <input 
    id="newField" 
    value={newField}
    onChange={(e) => setNewField(e.target.value)}
  />
</div>
```

### Change Color Scheme
File: `src/frontend/App.css`
```css
:root {
  --primary-color: #0066cc;  ← Change this
  --success-color: #4caf50;  ← or this
}
```

### Add New Backend API
File: `src/backend/index.js`
```javascript
export async function myNewHandler(req, res) {
  console.log('🚀 Handler called');
  return { status: 'success', data: 'something' };
}
```
Then in `manifest.yml`, add to `modules.function` array.

---

## Testing Locally (No Jira Needed)

To test UI without full Jira setup:

1. Create test HTML file that loads components
2. Run simple HTTP server: `npx serve src/frontend`
3. Open in browser: http://localhost:3000

(We already have standalone UI prototype at `/home/pawan/ferret/UI-FLOW-PROTOTYPE.html` for exactly this!)

---

## Deployment Checklist

- [ ] `.env` filled with real credentials
- [ ] `npm run build` succeeds (no errors)
- [ ] `npm run dev` connects successfully
- [ ] Button appears in Jira board menu
- [ ] Form loads without errors (F12 console)
- [ ] All 5 screens clickable
- [ ] Python script path valid in .env
- [ ] Ready to record demo

---

**Next:** Run QUICK-START.md checklist to get started! 🚀
