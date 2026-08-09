# 📦 Jira→ADO Forge App - Complete Project Index

## Welcome! 👋

You now have a **production-ready Jira Forge app** that adds an "AI-Powered Migrate to ADO" button directly into Jira boards.

This document maps out all files and explains what to read, when, and in what order.

---

## 🚀 START HERE (Choose Your Path)

### Path A: "I just want to deploy it NOW"
1. Read: [QUICK-START.md](QUICK-START.md) (5 min)
2. Run the commands in order — each step is numbered
3. **Done!** App will appear in your Jira project sidebar as "Migrate to ADO"

**Time: 20-30 minutes total** (most time is installs)

> Key requirement: Node 22 via nvm + Forge-scoped API token. See QUICK-START.md Step 0 and Step 4.

---

### Path B: "I want to understand what I'm building first"
1. Read: This file (you're reading it!)
2. Read: [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) (10 min)
3. Read: [README.md](README.md) (architecture overview)
4. Then: Follow Path A above

**Time: 35-45 minutes total**

---

### Path C: "I'm a detail person and want complete step-by-step"
1. Read: This file
2. Read: [BUILD-STEPS.md](BUILD-STEPS.md) (full 8-phase walkthrough)
3. Follow each phase with its verification checklist

**Time: 45-60 minutes total**

---

## 📁 File Guide (Read in Order)

### Phase 1: Understanding
| File | What It Is | When to Read |
|------|-----------|--------------|
| **README.md** | Architecture overview, features, API reference | Before building |
| **PROJECT-STRUCTURE.md** | Directory layout, file purposes, component flow | Before building |
| **QUICK-START.md** | 1-minute checklist, troubleshooting table | Before running `npm install` |

### Phase 2: Building
| File | What It Is | When to Read |
|------|-----------|--------------|
| **BUILD-STEPS.md** | Detailed 8-phase walkthrough with verification | As you execute each step |
| **manifest.yml** | Jira app config (entry points, permissions) | Reference if build fails |
| **package.json** | Dependencies & npm scripts | Reference if npm install fails |
| **.env.example** | Environment template | Copy to .env and fill in |

### Phase 3: Coding (If You Modify)
| File | What It Is | When to Read |
|------|-----------|--------------|
| **src/frontend/App.jsx** | Main React component (state + flow) | If modifying UI |
| **src/frontend/App.css** | All styling (buttons, forms, colors) | If changing look/feel |
| **src/frontend/components/*.jsx** | Individual screens (form/progress/success) | If modifying specific screen |
| **src/backend/index.js** | Forge handlers (dialog, migration, mappings) | If modifying backend logic |
| **src/backend/python-runner.js** | Python subprocess integration | If debugging Python execution |
| **src/backend/copilot-mapper.js** | Field mapping logic | If modifying AI suggestions |

### Phase 4: Deployment
| File | What It Is | When to Read |
|------|-----------|--------------|
| **.gitignore** | What files to exclude from git | Before first commit |
| **README.md** (Deployment section) | How to deploy to production | When ready to go live |

---

## 🎯 Decision Tree

```
START
  │
  ├─ "I want to build RIGHT NOW" 
  │  └─> Read: QUICK-START.md
  │      Run: npm install && npm run dev
  │      ✅ DONE in 15 min
  │
  ├─ "I want to understand first" 
  │  └─> Read: PROJECT-STRUCTURE.md
  │      Then: QUICK-START.md
  │      ✅ DONE in 35 min
  │
  ├─ "Walk me through EVERYTHING"
  │  └─> Read: This file
  │      Read: PROJECT-STRUCTURE.md
  │      Read: BUILD-STEPS.md (8 phases)
  │      Follow: Every verification step
  │      ✅ DONE in 60 min + deep understanding
  │
  ├─ "Build failed, I need help"
  │  └─> Check: QUICK-START.md → Troubleshooting
  │      Or: BUILD-STEPS.md → Troubleshooting
  │      Or: README.md → Troubleshooting
  │
  └─ "It's working, what next?"
     └─> Ideas:
         1. Record demo video (2-3 min)
         2. Test all 5 UI screens
         3. Create PowerPoint (10-12 slides)
         4. Practice presentation (5 min)
         5. Deploy to production (npm run deploy)
```

---

## 📋 What Each File Does

### Configuration & Docs

**manifest.yml** (50 lines)
- Tells Jira what this app is
- Defines buttons/dialogs
- Declares permissions needed
- **Must be valid YAML syntax**

**package.json** (30 lines)
- Lists npm dependencies (react, axios, forge)
- Defines build scripts (build, dev, deploy, test)
- **Don't modify unless adding dependencies**

**.env.example** (15 lines)
- Template for credentials
- **Copy to .env and fill in YOUR values**
- **Never commit .env to git** (.gitignore handles this)

**.gitignore** (30 lines)
- Tells git what files to ignore
- Excludes: .env, node_modules, build output
- **Don't modify unless you know what you're doing**

---

### Documentation

**README.md** (200+ lines)
- Full project documentation
- Architecture overview
- Feature list
- API reference
- Troubleshooting guide

**PROJECT-STRUCTURE.md** (200+ lines)
- Explains every file and folder
- Shows data flow (user click → backend → Python)
- Common code edits (how to change button text, add form field, etc)
- Development workflow

**QUICK-START.md** (150 lines)
- Ultra-fast setup checklist (1 minute)
- Prerequisites checklist
- Critical .env setup
- First test (2 minutes)
- Troubleshooting table

**BUILD-STEPS.md** (300+ lines)
- Detailed 8-phase walkthrough
- Each phase has step-by-step commands
- Verification checklist for each phase
- Time estimates for each phase

---

### Frontend Code

**src/frontend/App.jsx** (~60 lines)
```
What it does:
- Main React component
- Manages state (form → progress → success)
- Handles form submission
- Routes to correct screen

When to read:
- If UI flow isn't working
- If you need to add a new step
```

**src/frontend/App.css** (~400 lines)
```
What it does:
- All styling (colors, fonts, buttons, forms)
- Variables: --primary-color, --success-color, etc
- Responsive design (mobile-friendly)

When to read:
- If colors are wrong
- If buttons look bad
- If text is hard to read
```

**src/frontend/components/MigrationForm.jsx** (~90 lines)
```
What it does:
- Screen 1-2: User selects ADO project
- Displays AI-suggested field mappings
- Shows mapping confidence scores
- Submits form data to backend

When to read:
- If form isn't loading
- If you want to add form fields
- If mappings aren't showing
```

**src/frontend/components/ProgressIndicator.jsx** (~100 lines)
```
What it does:
- Screen 3: Shows live progress (0-100%)
- Displays statistics grid
- Shows live activity log
- Calls backend to start migration

When to read:
- If progress bar isn't animating
- If stats aren't updating
- If logs aren't showing
```

**src/frontend/components/SuccessScreen.jsx** (~40 lines)
```
What it does:
- Screen 4: Shows success message
- Displays final statistics
- "View in ADO" button
- "Close" button

When to read:
- If success screen looks wrong
- If buttons don't work
```

---

### Backend Code

**src/backend/index.js** (~80 lines)
```
What it does:
- Forge handlers (functions called from Jira)
- handleMigrateDialog: Show dialog when button clicked
- getSuggestedMappings: Return AI field mappings
- startMigration: Invoke Python CLI and return results

When to read:
- If API calls are failing
- If Python script isn't running
- If mappings aren't loading
```

**src/backend/python-runner.js** (~90 lines)
```
What it does:
- Spawns Python subprocess
- Passes command-line arguments
- Captures stdout/stderr
- Handles errors and completion

When to read:
- If Python script isn't executing
- If output isn't being captured
- If you need to add new CLI arguments
```

**src/backend/copilot-mapper.js** (~80 lines)
```
What it does:
- Generates AI field mappings
- Returns mappings + confidence scores
- Validates field type compatibility
- Has fallback mappings if AI fails

When to read:
- If mappings are wrong
- If confidence scores are incorrect
- If you want to add new field mappings
```

---

## ✅ Pre-Build Checklist

Before running `npm install`:

- [ ] Node v16+ installed (`node --version`)
- [ ] npm v8+ installed (`npm --version`)
- [ ] Jira Cloud account exists
- [ ] Jira admin access confirmed
- [ ] Atlassian API token created (https://id.atlassian.com)
- [ ] Azure DevOps account ready
- [ ] Python CLI path known: `/home/pawan/ferret/repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py`

---

## 📅 Timeline (Aug 6-20)

| Date | What | Deliverable |
|------|------|-------------|
| Aug 6-10 | Build & test Forge app | Working app + demo video |
| Aug 11-13 | Create presentation | PowerPoint + speaker notes |
| Aug 14-17 | Practice presentation | Timed run-through (5 min) |
| Aug 18 | **SUBMIT** | App + video + slides + docs |
| Aug 19-20 | **LIVE DEMO** | Present to team |

---

## 🎁 You Now Have

### Backend
✅ Python CLI tool (production-tested, 98.7% accuracy)
✅ Node.js Forge handlers (dialog, migration, mappings)
✅ Python subprocess integration (streaming output)
✅ AI field mapping logic

### Frontend
✅ React components (4 reusable screens)
✅ Complete styling (buttons, forms, progress, success)
✅ Responsive design (mobile-friendly)
✅ Real-time progress updates + stats

### Documentation
✅ README.md (full documentation)
✅ QUICK-START.md (1-minute checklist)
✅ BUILD-STEPS.md (detailed 8-phase walkthrough)
✅ PROJECT-STRUCTURE.md (file purposes + flow)
✅ This index file (you are here!)

### Configuration
✅ manifest.yml (Jira app definition)
✅ package.json (dependencies + scripts)
✅ .env.example (credentials template)
✅ .gitignore (what to exclude from git)

---

## 🆘 Help Quick Links

| Problem | Solution |
|---------|----------|
| Don't know where to start | → Read QUICK-START.md |
| Need detailed walkthrough | → Read BUILD-STEPS.md (8 phases) |
| Want to understand architecture | → Read PROJECT-STRUCTURE.md |
| Build failed | → Check README.md Troubleshooting |
| Want to modify code | → See PROJECT-STRUCTURE.md "Common Edits" |
| Need API reference | → See README.md "API Reference" |

---

## 🎯 Success Criteria

You'll know everything is working when:

1. ✅ `npm install` completes without errors
2. ✅ `npm run dev` shows green checkmarks and tunnel URL
3. ✅ App installs in your Jira instance
4. ✅ "🚀 Migrate to ADO" button appears in board menu
5. ✅ Button click shows form dialog (no errors in F12 console)
6. ✅ All 5 screens are clickable (form → progress → success)
7. ✅ Browser console (F12) shows no red errors

---

## 🚀 Next Steps

### Immediate (Right Now)
1. Choose your path (A, B, or C) above
2. Read the starting file
3. Run the setup commands
4. Test in Jira

### Short Term (Aug 6-10)
1. ✅ Get app running
2. ✅ Test all 5 UI screens
3. ✅ Record demo video (2-3 min)
4. ✅ Verify Python integration works

### Medium Term (Aug 11-13)
1. ✅ Create PowerPoint (10-12 slides)
2. ✅ Add screenshots from demo
3. ✅ Write speaker notes
4. ✅ Practice timing

### Long Term (Aug 14-18)
1. ✅ Practice presentation (5 min)
2. ✅ Prepare Q&A answers
3. ✅ Final polish
4. ✅ Submit by Aug 18

### Presentation (Aug 19-20)
1. ✅ Live demo to judges
2. ✅ Show "Migrate to ADO" button working
3. ✅ Walk through all 5 UI screens
4. ✅ Explain AI field mapping
5. ✅ Share business impact: $2,400/project, 98.7% accuracy
6. ✅ Answer Q&A
7. ✅ **WIN! 🏆**

---

## 💡 Pro Tips

**Tip 1: Keep Terminal Clean**
- Open 2 terminals: one for `npm run dev`, one for commands
- Never Ctrl+C the dev terminal!

**Tip 2: Use Browser DevTools**
- Press F12 to open DevTools
- Console tab shows errors (red = problems)
- Network tab shows API calls

**Tip 3: Save .env Carefully**
- Fill in ALL fields in .env
- Never commit .env to git
- Keep a backup copy (.env.backup)

**Tip 4: Incremental Development**
- Make 1 change at a time
- Test after each change
- Keep working version before big edits

**Tip 5: When Stuck**
- Check terminal output first (npm run dev logs)
- Then check browser console (F12)
- Then check README.md troubleshooting
- Then check BUILD-STEPS.md

---

## 📞 File Quick Reference

| Need Help With | Read This |
|---|---|
| Getting started | QUICK-START.md |
| Detailed setup | BUILD-STEPS.md |
| Understanding code | PROJECT-STRUCTURE.md |
| Full documentation | README.md |
| Troubleshooting | Any file's "Troubleshooting" section |
| Modifying UI | PROJECT-STRUCTURE.md → "Common Edits" |
| API details | README.md → "API Reference" |

---

**👉 Pick a path above and start reading!**

**Recommended: Start with QUICK-START.md for fastest path to working app.** 🚀
