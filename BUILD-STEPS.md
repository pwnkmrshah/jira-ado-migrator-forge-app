# Step-by-Step Build Instructions

**ESTIMATED TIME: 30-45 minutes for complete setup + first test**

---

## PHASE 1: Prerequisites Check (5 minutes)

### Step 1.1: Install Node.js 22 via nvm

> Forge CLI 13.x requires Node **22.x or 24.x**. Node 18 (the Ubuntu default) is NOT supported.
> Do NOT use `apt-get install nodejs` — it installs the wrong version and conflicts with system packages. Use nvm.

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Load nvm (or open a new terminal)
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh"

# Install and activate Node 22
nvm install 22 && nvm use 22 && nvm alias default 22

# Add to ~/.bashrc so it loads in every new terminal
grep -q 'NVM_DIR' ~/.bashrc || cat >> ~/.bashrc << 'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
EOF

node --version   # → v22.x.x
npm --version    # → v10.x.x
```

### Step 1.2: Install libsecret (Linux only)

```bash
sudo apt-get install -y libsecret-1-dev
```

### Step 1.3: Create a Forge-Scoped API Token

> A general Jira API token (starting with `ATATT3x...`) will NOT work for Forge CLI.
> You must create a token specifically scoped to Forge.

1. Go to: https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **"Create API token with scopes"** (not the plain "Create API token")
3. Name it: `forge-cli`
4. Select app: **Forge** (required — this is what enables developer access)
5. Click Create → copy the token immediately

---

## PHASE 2: Project Setup (10 minutes)

### Step 2.1: Navigate to Project
```bash
cd /home/pawan/ferret/jira-ado-migrator-forge-app

# Verify you see these files:
ls -la
# manifest.yml, package.json, README.md, QUICK-START.md, src/, etc.
```

### Step 2.2: Create .env File
```bash
cp .env.example .env

# Now edit .env with your values:
nano .env
```

**Fill in these fields:**
```
JIRA_SITE=your-company.atlassian.net
JIRA_API_TOKEN=<PASTE TOKEN FROM STEP 1.3>
JIRA_USER_EMAIL=your.email@company.com

ADO_ORG=your-azure-org
ADO_PAT=your_ado_token
ADO_PROJECT=DEV

PYTHON_CLI_PATH=/home/pawan/ferret/repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py
PYTHON_EXECUTABLE=python3
```

**Press Ctrl+O, Enter, Ctrl+X to save in nano**

### Step 2.3: Verify Python Path
```bash
ls -l /home/pawan/ferret/repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py
# Should show the file exists
```

---

## PHASE 3: Dependencies (10 minutes)

### Step 3.1: Install Forge CLI Globally
```bash
# Load nvm first every time you open a new terminal
export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 22

# CORRECT package name is @forge/cli (NOT @atlassian/forge-cli or @atlassian/cli)
npm install -g @forge/cli@latest

# Verify — must be 13.x+
forge --version
```

### Step 3.2: Install App Dependencies
```bash
# This installs @forge/api, @forge/react, and @babel/preset-react
npm install

# Should complete without errors.
```

### Step 3.3: Verify Installations
```bash
npm list @forge/api      # → @forge/api@2.x.x
npm list @forge/react    # → @forge/react@10.x.x
npm list @babel/preset-react   # → @babel/preset-react@8.x.x (devDependency)
```

### Step 3.4: Verify babel.config.json exists
```bash
cat babel.config.json
# Should show:
# { "presets": [["@babel/preset-react", { "runtime": "automatic" }]] }

# If missing, create it:
cat > babel.config.json << 'EOF'
{
  "presets": [
    ["@babel/preset-react", { "runtime": "automatic" }]
  ]
}
EOF
```

---

## PHASE 4: Jira Authentication (5 minutes)

### Step 4.1: Set Auth via Environment Variables

> Do NOT run `forge login` on headless Linux (Ubuntu/WSL without GNOME Keyring). It will fail
> with `Could not connect: No such file or directory` (Secret Service / Keytar error).
> Use env vars instead — forge reads these automatically:

```bash
export FORGE_EMAIL=your.email@gmail.com
export FORGE_API_TOKEN=<your-forge-scoped-token-from-step-1.3>
```

To persist across terminals:
```bash
echo 'export FORGE_EMAIL=your.email@gmail.com' >> ~/.bashrc
echo 'export FORGE_API_TOKEN=your-token' >> ~/.bashrc
```

Or put them in `.env` and source it:
```bash
source .env
```

### Step 4.2: Verify Auth Works
```bash
forge whoami
# Should show your email and organization
```

### Step 4.3: Register the App (One-Time)
```bash
forge register
# Assigns a real App ID - updates manifest.yml automatically
# You'll see: ✔ App registered successfully
```

---

## PHASE 5: First Development Run (10 minutes)

### Step 5.1: Start Tunnel Mode
```bash
npm run dev
```

**You'll see output like:**
```
✓ Build finished
✓ Tunnel ready
✓ App is available at: https://abcd1234.ngrok.io
```

**KEEP THIS TERMINAL OPEN!** (Don't Ctrl+C)

### Step 5.2: Install App in Jira (New Terminal Window)
```bash
# Open a NEW terminal while npm run dev is still running
# Then follow these steps:

1. Go to your Jira instance: https://your-company.atlassian.net
2. Click gear icon (Settings) → Apps → Manage apps
3. Click "Upload app" or "Install from URL"
4. Paste the URL from Step 5.1 (https://abcd1234.ngrok.io)
5. Click Install

# You should see: "Jira to ADO Migrator" appears in your apps
```

---

## PHASE 6: Test in Jira (5 minutes)

### Step 6.1: Go to Any Jira Board
```
1. In your Jira instance
2. Click any Project → Board
3. Look for board menu (top right, might be ⋮ or ⚙️)
```

### Step 6.2: Find Migration Button
```
1. Click board menu
2. Look for "🚀 Migrate to ADO" or similar
3. Click it
```

### Step 6.3: Test Form
```
1. Select a target project from dropdown
2. Scroll down to see AI-suggested mappings
3. Click "Start Migration"
4. Watch progress bar animate
5. See success screen
```

### Step 6.4: Browser Console Check
```
1. Press F12 to open DevTools
2. Click Console tab
3. You should see NO red errors
4. Should see some blue info logs
```

---

## PHASE 7: Stop and Rebuild (Optional)

### If You Made Changes:

```bash
# 1. Stop the tunnel (Ctrl+C in original terminal)

# 2. Rebuild
npm run build

# 3. Restart tunnel
npm run dev

# 4. Refresh Jira (Ctrl+R)
# Changes should appear automatically
```

---

## PHASE 8: Deploy to Production (Only When Ready)

### When You're Ready to Deploy:

```bash
# 1. Build
npm run build

# 2. Deploy
npm run deploy
# Returns a production URL

# 3. Install production URL in your Jira instance
# Now your app is live!
```

---

## TROUBLESHOOTING DURING BUILD

### Problem: `npm install` fails

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules package-lock.json

# Try again
npm install
```

### Problem: `forge login` fails (keychain / Secret Service error)

**Solution:** Do not use `forge login` on headless Linux. Use env vars:
```bash
export FORGE_EMAIL=your.email@gmail.com
export FORGE_API_TOKEN=<forge-scoped-token>
```
Forge reads these automatically — skip `forge login` entirely.

### Problem: `forge register` fails — `developerSpaceId can not be empty`

**Solution:** Two causes:
1. Wrong token type — general Jira tokens (`ATATT3x...`) don't work. Create a **Forge-scoped** token at https://id.atlassian.com → "Create API token with scopes" → select **Forge**.
2. Old CLI version — upgrade: `npm install -g @forge/cli@latest` (requires Node 22 first)

### Problem: Tunnel URL doesn't work

**Solution:**
1. Check ngrok is connected: `npm run dev` should show green checkmarks
2. Try hard refresh: Ctrl+Shift+R
3. Reinstall app in Jira: Settings → Apps → Uninstall, then reinstall

### Problem: Button doesn't appear

**Solution:**
1. Refresh Jira: Ctrl+R
2. Open browser console (F12) and check for red errors
3. Verify manifest.yml syntax is correct

### Problem: "Can't find Python script"

**Solution:**
```bash
# Verify path exists:
ls -l /home/pawan/ferret/repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py

# If not found, check your PYTHON_CLI_PATH in .env
# It should be the full absolute path
```

---

## WHAT TO DO NEXT

Once Phase 6 (Testing) succeeds:

1. ✅ **Record Demo Video** (2-3 minutes showing all 5 screens)
   - Use OBS or built-in screen recorder
   - Save as MP4
   - Keep for Aug 19-20 presentation

2. ✅ **Create PowerPoint** (10-12 slides with screenshots)
   - Use screenshots from demo
   - Include metrics: 98.7% accuracy, 3,000+ cards tested
   - Show business impact: $2,400 saved per project

3. ✅ **Practice Presentation** (5 minutes)
   - Run through slides + demo
   - Time yourself
   - Prepare Q&A answers

4. ✅ **Final Submission** (Due Aug 18)
   - App working (testable URL or deployed)
   - Demo video (MP4 or link)
   - PowerPoint slides
   - Documentation (README.md)

---

## VERIFICATION CHECKLIST

After each phase, verify:

**After Phase 1:**
- [ ] Node v16+
- [ ] npm v8+

**After Phase 2:**
- [ ] .env file exists and filled
- [ ] Python path verified

**After Phase 3:**
- [ ] `npm install` completed successfully
- [ ] `forge --version` works

**After Phase 4:**
- [ ] `forge whoami` shows your email

**After Phase 5:**
- [ ] `npm run dev` shows tunnel URL
- [ ] URL is accessible in browser

**After Phase 6:**
- [ ] Button appears in Jira board
- [ ] Form loads without errors
- [ ] All screens clickable
- [ ] F12 console shows no red errors

---

## TIME TRACKER

| Phase | Time | Status |
|-------|------|--------|
| Prerequisites | 5 min | ⏳ |
| Project Setup | 10 min | ⏳ |
| Dependencies | 10 min | ⏳ |
| Jira Auth | 5 min | ⏳ |
| Dev Run | 10 min | ⏳ |
| Testing | 5 min | ⏳ |
| **TOTAL** | **45 min** | ⏳ |

---

**Start Phase 1 now!** 🚀

Track your progress:
- ✅ Phase 1: Prerequisites Check
- ⏳ Phase 2: Project Setup
- ⏳ Phase 3: Dependencies
- ⏳ Phase 4: Jira Auth
- ⏳ Phase 5: Dev Run
- ⏳ Phase 6: Test in Jira
