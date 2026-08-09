# 🚀 Jira Forge App - Quick Build Guide

## SETUP CHECKLIST

```bash
# STEP 0 — Install Node 22 via nvm (Forge CLI 13.x requires Node 22+, NOT Node 18)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"
nvm install 22 && nvm use 22 && nvm alias default 22

# STEP 1 — Install Forge CLI (correct package is @forge/cli — NOT @atlassian/forge-cli)
npm install -g @forge/cli@latest
forge --version   # must be 13.x+

# STEP 2 — Install libsecret (Linux only)
sudo apt-get install -y libsecret-1-dev

# STEP 3 — Install app dependencies
cd /home/pawan/ferret/jira-ado-migrator-forge-app
npm install

# STEP 4 — Set auth via env vars (DO NOT run `forge login` on headless Linux — it will fail)
# Create a FORGE-SCOPED token at: https://id.atlassian.com/manage-profile/security/api-tokens
# → Click "Create API token with scopes" → select Forge → copy token
export FORGE_EMAIL=your.email@gmail.com
export FORGE_API_TOKEN=<your-forge-scoped-token>   # NOT a general JIRA token

# STEP 5 — Register the app (ONE TIME only — updates manifest.yml with App ID)
forge register

# STEP 6 — Deploy
forge deploy

# STEP 7 — Install into Jira
forge install
# → Site: yoursite.atlassian.net
# → Product: Jira

# STEP 8 (optional) — Dev tunnel for hot reload
forge tunnel
```

**Done!** Open any Jira project → look for "Migrate to ADO" in the left sidebar.

---

## CRITICAL: Before Running

### ✅ Prerequisites
- [ ] Node.js **22.x** via nvm (`node --version` → v22.x.x)
- [ ] npm 10+ (`npm --version`)
- [ ] Jira Cloud account (not Server/Data Center)
- [ ] Admin access to at least ONE Jira instance (for testing)
- [ ] **Forge-scoped** API token — NOT a general Jira token (see Step 4 above)

### ✅ Environment Setup (.env)
1. Copy `.env.example` to `.env`
2. Fill in YOUR values:
   ```
   JIRA_SITE=your-company.atlassian.net
   JIRA_API_TOKEN=<from step above>
   JIRA_USER_EMAIL=your.email@company.com
   
   ADO_ORG=your-azure-org
   ADO_PAT=<from Azure DevOps>
   ADO_PROJECT=your_project
   
   PYTHON_CLI_PATH=/home/pawan/ferret/repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py
   ```

---

## BUILD COMMAND REFERENCE

| Command | What It Does |
|---------|-------------|
| `npm install` | Install app dependencies (@forge/api, @forge/react) |
| `forge build` | Compile app for production |
| `forge deploy` | Deploy to Jira Forge registry |
| `forge install` | Install in your Jira instance |
| `forge tunnel` | Development mode with hot reload |
| `npm run lint` | Check code quality (eslint) |
| `forge login` | Login to Jira/Atlassian |
| `forge whoami` | Check if logged in |
| `forge register` | Register new app (gets an App ID) |

---

## FILE MAP

### Frontend (What User Sees)
- `src/frontend/App.jsx` → Main component (state management)
- `src/frontend/App.css` → All styling
- `src/frontend/components/MigrationForm.jsx` → Project selector + mappings display
- `src/frontend/components/ProgressIndicator.jsx` → Live progress bar + stats
- `src/frontend/components/SuccessScreen.jsx` → Success message

### Backend (What Runs on Server)
- `src/backend/index.js` → Forge handler functions
- `src/backend/python-runner.js` → Executes Python CLI tool
- `src/backend/copilot-mapper.js` → AI field mapping logic

### Config Files
- `manifest.yml` → App definition (entry points, permissions)
- `package.json` → Dependencies & scripts
- `.env.example` → Environment template
- `.gitignore` → What to exclude from git

---

## FIRST TEST (2 MINUTES)

```bash
cd /home/pawan/ferret/jira-ado-migrator-forge-app

# 1. Install
npm install

# 2. Start development server
npm run dev

# 3. You'll see:
#    ✓ Tunnel ready at: https://something.ngrok.io
#    ℹ️  App is available to install at above URL

# 4. Install in Jira:
#    → Settings (gear icon) → Apps → Manage apps
#    → Find "Jira to ADO Migrator"
#    → Click "Get it now"

# 5. Go to a board, click board menu (⚙️) → "Migrate Board to ADO"
#    → Should see form popup
```

---

## TROUBLESHOOTING QUICK REFERENCE

| Problem | Solution |
|---------|----------|
| Button doesn't appear | Refresh Jira (Ctrl+R), reinstall app |
| `npm install` fails | Delete `node_modules/`, run again |
| `forge login` fails | Check API token at https://id.atlassian.com |
| Python script not found | Verify `PYTHON_CLI_PATH` in .env exists |
| Tunnel disconnects | Just run `npm run dev` again |
| CORS errors | Check manifest.yml has correct permissions |

---

## NEXT STEPS (IN ORDER)

1. ✅ Run setup checklist above
2. ⏳ Run first test (2 min)
3. 🧪 Test all 5 screens in browser
4. 🔧 Edit UI/backend as needed
5. 🚀 Deploy to production (`npm run deploy`)
6. 📹 Record demo video for presentation
7. 📊 Create PowerPoint slides

---

## IMPORTANT DATES

- **Aug 12**: Forge app must be testable (today deadline if building)
- **Aug 13-18**: Recording demo, creating slides, practice
- **Aug 18**: Final submission deadline
- **Aug 19-20**: Live presentation (judges see live demo)

---

## GETTING HELP

- **Forge docs**: https://developer.atlassian.com/cloud/jira/platform/
- **React docs**: https://react.dev/
- **Node.js docs**: https://nodejs.org/docs/
- **Check logs**: Run `npm run dev` and watch terminal

---

**You're ready!** Start with `npm install` → `npm run dev` → Install in Jira.
