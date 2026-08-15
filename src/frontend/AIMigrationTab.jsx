import {
  Box,
  Button,
  Checkbox,
  Inline,
  Label,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import React, { useState, useEffect, useRef } from 'react';

// Dot rating for confidence: ●●●○ 74%
const ConfidenceDots = ({ score }) => {
  const filled = score >= 90 ? 4 : score >= 75 ? 3 : score >= 60 ? 2 : 1;
  const dots = Array.from({ length: 4 }, (_, i) => (i < filled ? '●' : '○')).join('');
  const color = score >= 90 ? '✅' : score >= 75 ? '⚠️' : '🔴';
  return <Text>{color} {dots} {score}%</Text>;
};

const tileStyle = xcss({ padding: 'space.200', textAlign: 'center' });

const FIELD_GROUPS = [
  {
    label: 'Content',
    fields: [
      { id: 'description',  label: 'Descriptions' },
      { id: 'comments',     label: 'Comments' },
      { id: 'attachments',  label: 'Attachments' },
    ],
  },
  {
    label: 'Links & Structure',
    fields: [
      { id: 'links',    label: 'Linked Issues / Relations' },
      { id: 'sprint',   label: 'Sprint / Iteration' },
      { id: 'labels',   label: 'Labels / Tags' },
    ],
  },
  {
    label: 'Metadata',
    fields: [
      { id: 'assignee',      label: 'Assignee' },
      { id: 'reporter',      label: 'Reporter / Created By' },
      { id: 'priority',      label: 'Priority' },
      { id: 'dates',         label: 'Created & Updated Dates' },
      { id: 'custom_fields', label: 'Custom Fields' },
    ],
  },
];
const FIELD_OPTIONS = FIELD_GROUPS.flatMap(g => g.fields);

const SCOPE_OPTIONS = [
  { label: 'Entire board', value: 'entire_board' },
  { label: 'Jira saved filter', value: 'filter' },
  { label: 'Specific issues', value: 'specific' },
];

const AIMigrationTab = ({ adoProjects, isLoadingProjects, onMigrationStateChange, onScreenChange }) => {
  // aiScreen: 'setup' | 'analyzing' | 'results' | 'mapping' | 'plan'
  const [aiScreen, setAiScreen] = useState('setup');

  // Board / scope selection
  const [boards, setBoards] = useState([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [selectedFields, setSelectedFields] = useState(FIELD_OPTIONS.map(f => f.id));
  const [selectedAdoProject, setSelectedAdoProject] = useState(null);

  // Migration scope
  const [migrationScope, setMigrationScope] = useState(SCOPE_OPTIONS[0]);
  const [jiraFilters, setJiraFilters] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [specificIssues, setSpecificIssues] = useState('');
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);

  // Results screen field customization
  const [showFieldCustomize, setShowFieldCustomize] = useState(false);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState(null);
  const [typeMappings, setTypeMappings] = useState([]);
  const [analyzeError, setAnalyzeError] = useState('');
  const [approving, setApproving] = useState(false);
  const [migrationJob, setMigrationJob] = useState(null); // { jobId?, error?, status?, summary?, liveLog? }
  const pollRef = useRef(null);

  // Poll every 4 s, stop as soon as a final status arrives. Only restarts when jobId changes.
  useEffect(() => {
    const jobId = migrationJob?.jobId;
    if (!jobId) return;
    const FINAL = ['completed', 'failed', 'cancelled', 'warning'];

    pollRef.current = setInterval(async () => {
      try {
        const res = await invoke('pollJobStatus', { jobId });
        // Only bail if the resolver itself failed (no `status` field means a resolver-level error)
        if (!res || !res.status) return;
        setMigrationJob(prev => ({
          ...prev,
          status:   res.status,
          summary:  res.error_summary,
          progress: res.progress,
          cardCsv:  res.card_csv || prev?.cardCsv,
        }));
        if (FINAL.includes(res.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (_) { /* network blip — keep polling */ }
    }, 4000);

    return () => { clearInterval(pollRef.current); pollRef.current = null; };
  }, [migrationJob?.jobId]);

  // Notify parent of screen changes for modal title and migration lock
  useEffect(() => {
    onMigrationStateChange?.(aiScreen !== 'setup');
    onScreenChange?.(aiScreen);
  }, [aiScreen]);

  // Load boards on mount
  useEffect(() => {
    invoke('getJiraBoards').then(res => {
      setBoards((res.boards || []).map(b => ({
        label: `${b.name} (${b.projectKey})`,
        value: b.projectKey,
        boardId: b.id,
        boardName: b.name,
      })));
      setIsLoadingBoards(false);
    });
  }, []);

  const handleBoardChange = (opt) => {
    setSelectedBoard(opt);
    setSelectedFilter(null);
    setJiraFilters([]);
    // If scope is already 'filter', fetch filters for the new board
    if (migrationScope.value === 'filter' && opt?.value) {
      fetchJiraFilters(opt.value);
    }
  };

  const fetchJiraFilters = (projectKey) => {
    setIsLoadingFilters(true);
    invoke('getJiraFilters', { projectKey }).then(res => {
      setJiraFilters((res.filters || []).map(f => ({ label: f.name, value: f.id, jql: f.jql })));
      setIsLoadingFilters(false);
    });
  };

  const handleScopeChange = (opt) => {
    setMigrationScope(opt);
    setSelectedFilter(null);
    if (opt.value === 'filter' && selectedBoard?.value) {
      fetchJiraFilters(selectedBoard.value);
    }
  };

  const toggleField = (fieldId) => {
    setSelectedFields(prev =>
      prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]
    );
  };

  const [aiPlanError, setAiPlanError] = useState('');
  const [analyzingStage, setAnalyzingStage] = useState(''); // 'data' | 'ai'

  const handleAnalyze = async () => {
    if (!selectedBoard || !selectedAdoProject) return;
    if (migrationScope.value === 'filter' && !selectedFilter) return;
    setAiScreen('analyzing');
    setAnalyzeError('');
    setAiPlanError('');
    setAnalyzingStage('data');

    try {
      const result = await invoke('runAnalysis', {
        adoProject: selectedAdoProject.label,
        jiraProjectKey: selectedBoard.value,
        statusFilter: [],
        fieldFilter: selectedFields,
        migrationScope: migrationScope.value,
        filterId: migrationScope.value === 'filter' ? selectedFilter?.value : undefined,
        jiraKeys: migrationScope.value === 'specific' ? specificIssues.trim() : undefined,
      });

      if (result.error) {
        setAnalyzeError(result.error);
        setAiScreen('setup');
        return;
      }

      setAnalysisResult(result);

      // If analysis already returned type_mappings (from Flask), use them directly.
      // Otherwise call OpenAI to generate them.
      let mappings = result.type_mappings || [];

      if (mappings.length === 0) {
        setAnalyzingStage('ai');
        const aiResult = await invoke('runAIPlan', {
          byType: result.by_type || [],
          adoTypes: result.ado_available_types || [],
          userGaps: result.user_gaps || [],
          adoProject: selectedAdoProject.label,
        });

        if (aiResult.error) {
          setAiPlanError(aiResult.error);
          // Still continue to results — user can manually set mappings
        } else {
          mappings = aiResult.type_mappings || [];
        }
      }

      setTypeMappings(
        mappings.map(m => ({ ...m, userApproved: m.confidence >= 90 }))
      );
      setAiScreen('results');
    } catch (err) {
      setAnalyzeError(`Analysis failed: ${err.message}`);
      setAiScreen('setup');
    }
  };

  const handleMappingChange = (jiraType, newAdoType) => {
    setTypeMappings(prev => prev.map(m =>
      m.jira === jiraType ? { ...m, ado: newAdoType, userApproved: true } : m
    ));
  };

  const handleApproveMapping = (jiraType) => {
    setTypeMappings(prev => prev.map(m =>
      m.jira === jiraType ? { ...m, userApproved: true } : m
    ));
  };

  const handleApproveMigration = async () => {
    setApproving(true);
    const approvedPlan = {
      adoProject: selectedAdoProject?.label,
      jiraProjectKey: selectedBoard?.value,
      jql: analysisResult?.jql_used,
      scope: analysisResult?.total_issues,
      selectedStatuses: [],
      type_mappings: Object.fromEntries(typeMappings.map(m => [m.jira, m.ado])),
      field_filter: selectedFields,
      warnings: [
        ...(analysisResult?.user_gaps || []).map(u => `${u.jira_user} has no ADO account — will be preserved in card description`),
        ...typeMappings.filter(m => m.confidence < 80).map(m => `"${m.jira}" mapped to "${m.ado}" (${m.confidence}% confidence — review recommended)`),
      ],
    };
    const result = await invoke('approveMigrationPlan', approvedPlan);
    setApproving(false);
    if (result?.error) {
      setMigrationJob({ error: result.error });
    } else {
      setMigrationJob({ jobId: result?.job_id });
    }
    setAiScreen('migrating');
  };

  const allMappingsApproved = typeMappings.length > 0 && typeMappings.every(m => m.userApproved);
  const adoTypeOptions = (analysisResult?.ado_available_types || []).map(t => ({ label: t, value: t }));
  const needsReview = typeMappings.filter(m => !m.userApproved);
  const userGaps = analysisResult?.user_gaps || [];

  // ── Screen 1: Setup (Board + Status + Field + ADO) ──────────────────────────
  if (aiScreen === 'setup') {
    return (
      <Stack space="space.300">

        {/* Subtitle */}
        <Text>Choose your source, scope, and destination. We'll analyze the migration before anything is changed.</Text>

        {/* Board selector */}
        <Stack space="space.050">
          <Text>SOURCE</Text>
          <Label labelFor="ai-board">Jira Board *</Label>
          {isLoadingBoards ? <Spinner size="small" /> : (
            <Select
              inputId="ai-board"
              options={boards}
              value={selectedBoard}
              onChange={handleBoardChange}
              placeholder="Select a Jira board..."
            />
          )}
        </Stack>

        {/* Migration Scope */}
        <Stack space="space.050">
          <Text>SCOPE</Text>
          <Label labelFor="ai-scope">Migration Scope *</Label>
          <Select
            inputId="ai-scope"
            options={SCOPE_OPTIONS}
            value={migrationScope}
            onChange={handleScopeChange}
          />
        </Stack>

        {/* Filter picker — shown when scope = 'filter' */}
        {migrationScope.value === 'filter' && selectedBoard && (
          <Stack space="space.100">
            <Label labelFor="ai-filter">Saved Jira Filter *</Label>
            {isLoadingFilters ? <Spinner size="small" /> : (
              <Select
                inputId="ai-filter"
                options={jiraFilters}
                value={selectedFilter}
                onChange={setSelectedFilter}
                placeholder="Select a saved filter..."
              />
            )}
            {!isLoadingFilters && jiraFilters.length === 0 && (
              <Text>No saved filters found for this project.</Text>
            )}
          </Stack>
        )}

        {/* Specific issues input — shown when scope = 'specific' */}
        {migrationScope.value === 'specific' && (
          <Stack space="space.100">
            <Label labelFor="ai-keys">🔑 Issue Keys * (comma-separated)</Label>
            <TextArea
              id="ai-keys"
              value={specificIssues}
              onChange={e => setSpecificIssues(e.target.value)}
              placeholder="e.g. PROJ-101, PROJ-102, PROJ-103"
            />
          </Stack>
        )}

        {/* ADO target */}
        <Stack space="space.050">
          <Text>TARGET</Text>
          <Label labelFor="ai-ado-project">Azure DevOps Project *</Label>
          {isLoadingProjects ? <Spinner size="small" /> : (
            <Select
              inputId="ai-ado-project"
              options={adoProjects}
              value={selectedAdoProject}
              onChange={setSelectedAdoProject}
              placeholder="Select ADO project..."
            />
          )}
        </Stack>

        {/* What AI will analyze */}
        <SectionMessage appearance="information">
          <Stack space="space.150">
            <Text>✨ What AI will analyze</Text>
            <Stack space="space.050">
              <Text>• Issue types and field mappings</Text>
              <Text>• Users, assignments and account gaps</Text>
              <Text>• Relationships, hierarchy and links</Text>
              <Text>• Attachments, comments and metadata</Text>
              <Text>• Migration risks and unsupported fields</Text>
            </Stack>
            <Text>ℹ Analysis is read-only. Nothing will be migrated yet.</Text>
          </Stack>
        </SectionMessage>

        {analyzeError && (
          <SectionMessage appearance="error"><Text>❌ {analyzeError}</Text></SectionMessage>
        )}

        <Inline spread="space-between" alignBlock="center">
          <Text> </Text>
          <Button
            appearance="primary"
            onClick={handleAnalyze}
            isDisabled={
              !selectedBoard || !selectedAdoProject ||
              (migrationScope.value === 'filter' && !selectedFilter) ||
              (migrationScope.value === 'specific' && !specificIssues.trim())
            }
          >
            Analyze Migration →
          </Button>
        </Inline>
      </Stack>
    );
  }

  // ── Screen: Analyzing ───────────────────────────────────────────────────────
  if (aiScreen === 'analyzing') {
    return (
      <Stack space="space.300" alignInline="center">
        <Spinner size="large" />
        {analyzingStage === 'ai' ? (
          <Stack space="space.100" alignInline="center">
            <Text>✨ AI is generating type mappings…</Text>
            <Text>Asking OpenAI to match your Jira types to ADO work item types.</Text>
          </Stack>
        ) : (
          <Stack space="space.100" alignInline="center">
            <Text>Analyzing your Jira project and Azure DevOps target…</Text>
            <Text>Fetching issue types, checking ADO compatibility, identifying gaps.</Text>
          </Stack>
        )}
      </Stack>
    );
  }

  // ── Screen 2: Analysis Results ──────────────────────────────────────────────
  if (aiScreen === 'results') {
    const r = analysisResult;
    return (
      <Stack space="space.400">
        <Text>📊 Migration Analysis — {selectedAdoProject?.label}</Text>

        {aiPlanError && (
          <SectionMessage appearance="warning">
            <Text>⚠ AI mapping unavailable: {aiPlanError} — mappings set to best-guess defaults. You can adjust them on the next screen.</Text>
          </SectionMessage>
        )}

        {/* 4 stat tiles */}
        <Inline space="space.200">
          <Box xcss={tileStyle}>
            <Stack space="space.050" alignInline="center">
              <Text>{r.total_issues ?? '—'}</Text>
              <Text>Issues</Text>
            </Stack>
          </Box>
          <Box xcss={tileStyle}>
            <Stack space="space.050" alignInline="center">
              <Text>{needsReview.length}</Text>
              <Text>Need Review</Text>
            </Stack>
          </Box>
          <Box xcss={tileStyle}>
            <Stack space="space.050" alignInline="center">
              <Text>{userGaps.length}</Text>
              <Text>User Gaps</Text>
            </Stack>
          </Box>
          <Box xcss={tileStyle}>
            <Stack space="space.050" alignInline="center">
              <Text>{r.attachment_count ?? 0}</Text>
              <Text>Attachments</Text>
            </Stack>
          </Box>
        </Inline>

        {/* AI Findings — grouped by severity */}
        <Stack space="space.200">
          <Text>AI Findings</Text>

          {typeMappings.filter(m => m.confidence >= 90).length > 0 && (
            <SectionMessage appearance="success">
              <Stack space="space.100">
                <Text>🟢 Ready</Text>
                {typeMappings.filter(m => m.confidence >= 90).map(m => (
                  <Text key={m.jira}>{m.jira} maps directly to {m.ado}.</Text>
                ))}
              </Stack>
            </SectionMessage>
          )}

          {needsReview.length > 0 && (
            <SectionMessage appearance="warning">
              <Stack space="space.150">
                <Text>🟡 Needs review</Text>
                {needsReview.map(m => (
                  <Stack key={m.jira} space="space.050">
                    <Text>"{m.jira}" requires a mapping decision</Text>
                    <Text>{m.confidence}% confidence — {m.reason || 'review recommended'}</Text>
                  </Stack>
                ))}
              </Stack>
            </SectionMessage>
          )}

          {userGaps.length > 0 && (
            <SectionMessage appearance="information">
              <Stack space="space.100">
                <Text>🔵 Informational</Text>
                {userGaps.map(u => (
                  <Text key={u.jira_user}>{u.jira_user} has no ADO account — their name will be preserved in the migrated card description.</Text>
                ))}
              </Stack>
            </SectionMessage>
          )}

          {needsReview.length === 0 && userGaps.length === 0 && (
            <SectionMessage appearance="success">
              <Text>🟢 All types map cleanly — no issues found.</Text>
            </SectionMessage>
          )}
        </Stack>

        {/* AI-recommended migration content */}
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center">
            <Text>✨ AI-recommended migration content</Text>
            <Button appearance="subtle" onClick={() => setShowFieldCustomize(v => !v)}>
              {showFieldCustomize ? 'Hide' : 'Customize →'}
            </Button>
          </Inline>
          {!showFieldCustomize ? (
            <Inline space="space.400" alignBlock="start">
              {FIELD_GROUPS.map(group => (
                <Stack key={group.label} space="space.050">
                  <Text>{group.label}</Text>
                  {group.fields.map(f => (
                    <Text key={f.id}>{selectedFields.includes(f.id) ? '✓' : '○'} {f.label}</Text>
                  ))}
                </Stack>
              ))}
            </Inline>
          ) : (
            <Inline space="space.400" alignBlock="start">
              {FIELD_GROUPS.map(group => (
                <Stack key={group.label} space="space.100">
                  <Text>{group.label}</Text>
                  {group.fields.map(f => (
                    <Checkbox
                      key={f.id}
                      label={f.label}
                      isChecked={selectedFields.includes(f.id)}
                      onChange={() => toggleField(f.id)}
                    />
                  ))}
                </Stack>
              ))}
            </Inline>
          )}
        </Stack>

        <Inline space="space.100">
          <Button appearance="subtle" onClick={() => setAiScreen('setup')}>← Back</Button>
          <Button appearance="primary" onClick={() => setAiScreen('mapping')}>Review Mappings →</Button>
        </Inline>
      </Stack>
    );
  }

  // ── Screen 3: Mapping Review ────────────────────────────────────────────────
  if (aiScreen === 'mapping') {
    return (
      <Stack space="space.400">
        <Text>🗺 Type Mappings (AI Recommended)</Text>

        <Stack space="space.200">
          {typeMappings.map(m => (
            <SectionMessage
              key={m.jira}
              appearance={m.userApproved ? 'success' : m.confidence < 75 ? 'warning' : 'information'}
            >
              <Stack space="space.100">
                <Inline spread="space-between" alignBlock="center">
                  <Text>{m.jira} ({m.count}) →</Text>
                  <Box xcss={xcss({ minWidth: '180px' })}>
                    <Select
                      options={adoTypeOptions}
                      value={{ label: m.ado, value: m.ado }}
                      onChange={opt => handleMappingChange(m.jira, opt.value)}
                    />
                  </Box>
                  <ConfidenceDots score={m.confidence} />
                  {!m.userApproved ? (
                    <Button appearance="default" onClick={() => handleApproveMapping(m.jira)}>Accept</Button>
                  ) : (
                    <Text>✓ Accepted</Text>
                  )}
                </Inline>
                {m.confidence < 80 && (
                  <Text>Reason: {m.reason}</Text>
                )}
              </Stack>
            </SectionMessage>
          ))}
        </Stack>

        {!allMappingsApproved && (
          <SectionMessage appearance="warning">
            <Text>⚠ {needsReview.length} mapping(s) need your review before continuing.</Text>
          </SectionMessage>
        )}

        <Inline space="space.100">
          <Button appearance="subtle" onClick={() => setAiScreen('results')}>← Back</Button>
          <Button
            appearance="primary"
            onClick={() => setAiScreen('plan')}
            isDisabled={!allMappingsApproved}
          >
            Continue to Plan →
          </Button>
        </Inline>
      </Stack>
    );
  }

  // ── Screen 4: Migration Plan Approval ──────────────────────────────────────
  const warnings = [
    ...userGaps.map(u => `${u.jira_user} has no ADO account — name preserved in description`),
    ...typeMappings.filter(m => m.confidence < 80).map(m => `"${m.jira}" → "${m.ado}" (${m.confidence}% confidence)`),
  ];

  if (aiScreen === 'plan') {
  return (
    <Stack space="space.400">
      <Text>📋 Migration Plan</Text>

      <Stack space="space.200">
        <SectionMessage appearance="information">
          <Stack space="space.100">
            <Inline space="space.300">
              <Text>SOURCE</Text><Text>{selectedBoard?.boardName || selectedBoard?.value} ({selectedBoard?.value})</Text>
            </Inline>
            <Inline space="space.300">
              <Text>TARGET</Text><Text>{selectedAdoProject?.label} (ADO)</Text>
            </Inline>
            <Inline space="space.300">
              <Text>SCOPE</Text><Text>{migrationScope.label}{selectedFilter ? ` — ${selectedFilter.label}` : ''}{specificIssues ? ` — ${specificIssues.split(',').length} issue(s)` : ''}</Text>
            </Inline>
            <Inline space="space.300">
              <Text>ISSUES</Text><Text>{analysisResult?.total_issues} total</Text>
            </Inline>
          </Stack>
        </SectionMessage>

        <Stack space="space.100">
          <Text>Migration Content</Text>
          <Inline space="space.400" alignBlock="start">
            {FIELD_GROUPS.map(group => (
              <Stack key={group.label} space="space.050">
                <Text>{group.label}</Text>
                {group.fields.filter(f => selectedFields.includes(f.id)).map(f => (
                  <Text key={f.id}>✓ {f.label}</Text>
                ))}
              </Stack>
            ))}
          </Inline>
        </Stack>

        <Text>Type Mappings</Text>
        {typeMappings.map(m => (
          <Text key={m.jira}>  {m.jira} → {m.ado}</Text>
        ))}

        {warnings.length > 0 && (
          <SectionMessage appearance="warning">
            <Stack space="space.100">
              <Text>Warnings</Text>
              {warnings.map((w, i) => <Text key={i}>⚠ {w}</Text>)}
            </Stack>
          </SectionMessage>
        )}
      </Stack>

      <Inline space="space.100">
        <Button appearance="subtle" onClick={() => setAiScreen('mapping')}>← Edit Plan</Button>
        <Button
          appearance="primary"
          onClick={handleApproveMigration}
          isDisabled={approving}
        >
          {approving ? 'Starting...' : 'Approve & Migrate'}
        </Button>
      </Inline>
    </Stack>
  );
  }

  // ── Screen 5: Migration Status ───────────────────────────────────────────────
  if (aiScreen === 'migrating') {
    const status = migrationJob?.status;
    const isFinal = ['completed', 'failed', 'cancelled', 'warning'].includes(status);
    const isRunning = !isFinal && migrationJob?.jobId && !migrationJob?.error;
    const prog = migrationJob?.progress;
    const total = prog?.total ?? 0;
    const done  = prog?.done  ?? 0;
    const pct   = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const bars  = Math.round(pct / 10);

    // Parse succeeded/failed from summary e.g. "5 processed: 1 succeeded, 4 failed"
    const summaryMatch = (migrationJob?.summary || '').match(/(\d+) processed/);
    const processedCount = summaryMatch ? summaryMatch[1] : (done || '?');
    const failedMatch = (migrationJob?.summary || '').match(/(\d+) failed/);
    const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    const downloadCsv = () => {
      const csv = migrationJob?.cardCsv;
      if (!csv) return;
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      a.download = `migration-report-${migrationJob.jobId?.slice(0, 8)}.csv`;
      a.click();
    };

    let appearance = 'information';
    let title = 'Migration queued — starting worker…';
    if (isRunning && prog?.current_card && total === 0) title = 'Migration started — counting issues…';
    if (isRunning && total > 0) title = `Migrating… ${done} of ${total} done · ${total - done} remaining`;
    if (status === 'completed') { appearance = 'success'; title = `Migration complete — ${processedCount} card(s) migrated ✓`; }
    if (status === 'warning' && failedCount === 0) { appearance = 'success'; title = `Migration complete — ${processedCount} card(s) migrated ✓`; }
    if (status === 'warning' && failedCount > 0)   { appearance = 'warning'; title = `Migration finished with warnings — ${processedCount} card(s) processed`; }
    if (status === 'failed')    { appearance = 'error';   title = 'Migration failed'; }
    if (migrationJob?.error)    { appearance = 'error';   title = 'Failed to start migration'; }

    return (
      <Stack space="space.300">
        <Text>Migration</Text>
        {migrationJob?.error ? (
          <SectionMessage appearance="error">
            <Stack space="space.100">
              <Text>{title}</Text>
              <Text>{migrationJob.error}</Text>
            </Stack>
          </SectionMessage>
        ) : (
          <SectionMessage appearance={appearance}>
            <Stack space="space.200">
              <Text>{title}</Text>

              {/* Progress bar + card status while running */}
              {isRunning && (
                <Stack space="space.050">
                  {total > 0 && (
                    <Text>{'█'.repeat(bars)}{'░'.repeat(10 - bars)} {pct}%</Text>
                  )}
                  {prog?.current_card ? (
                    <Inline space="space.100" alignBlock="center">
                      <Spinner size="small" />
                      <Text>
                        {prog.current_action === 'created'   ? '✅ Created' :
                         prog.current_action === 'updated'   ? '↻ Updated' :
                         prog.current_action === 'failed'    ? '❌ Failed' :
                         prog.current_action === 'duplicate' ? '⚠ Duplicate' :
                         '⏳ Processing'}{' '}{prog.current_card}
                        {prog.current_ado ? ` → ADO #${prog.current_ado}` : ''}
                        {total === 0 ? ' (counting issues…)' : ` · ${total - done} pending`}
                      </Text>
                    </Inline>
                  ) : (
                    <Inline space="space.100" alignBlock="center">
                      <Spinner size="small" />
                      <Text>Connecting to Jira…</Text>
                    </Inline>
                  )}
                </Stack>
              )}

              {/* Final human-readable summary — suppress backend text when appearance was upgraded to success */}
              {isFinal && migrationJob?.summary && !(status === 'warning' && failedCount === 0) && (
                <Text>{migrationJob.summary}</Text>
              )}
              {isFinal && status === 'warning' && failedCount > 0 && (
                <Text>Some field values (e.g. Assigned To, Requested By) could not be set because the user is not in ADO. The name was preserved in the card description.</Text>
              )}
            </Stack>
          </SectionMessage>
        )}

        {/* CSV download — only shown once report is ready */}
        {migrationJob?.cardCsv && isFinal && (
          <Button appearance="default" onClick={downloadCsv}>
            ⬇ Download Migration Report (CSV)
          </Button>
        )}

        {(isFinal || migrationJob?.error) && (
          <Button appearance="subtle" onClick={() => { setAiScreen('setup'); setMigrationJob(null); }}>
            ← Start New Migration
          </Button>
        )}
      </Stack>
    );
  }

  return null;
};

export default AIMigrationTab;
