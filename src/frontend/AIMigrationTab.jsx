import {
  Box,
  Button,
  Inline,
  Label,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
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

const FIELD_OPTIONS = [
  { id: 'description', label: 'Descriptions' },
  { id: 'comments',    label: 'Comments' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'links',       label: 'Links' },
  { id: 'labels',      label: 'Labels' },
  { id: 'custom_fields', label: 'Custom Fields' },
];

const AIMigrationTab = ({ adoProjects, isLoadingProjects }) => {
  // aiScreen: 'setup' | 'analyzing' | 'results' | 'mapping' | 'plan'
  const [aiScreen, setAiScreen] = useState('setup');

  // Board / scope selection
  const [boards, setBoards] = useState([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(true);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [boardStatuses, setBoardStatuses] = useState([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState([]); // [] = all
  const [selectedFields, setSelectedFields] = useState(FIELD_OPTIONS.map(f => f.id));
  const [selectedAdoProject, setSelectedAdoProject] = useState(null);

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

  // Load statuses when board changes
  const handleBoardChange = (opt) => {
    setSelectedBoard(opt);
    setSelectedStatuses([]);
    setBoardStatuses([]);
    if (!opt?.value) return;
    setIsLoadingStatuses(true);
    invoke('getJiraBoardStatuses', { projectKey: opt.value }).then(res => {
      setBoardStatuses(res.statuses || []);
      setIsLoadingStatuses(false);
    });
  };

  const toggleStatus = (statusName) => {
    setSelectedStatuses(prev =>
      prev.includes(statusName) ? prev.filter(s => s !== statusName) : [...prev, statusName]
    );
  };

  const toggleField = (fieldId) => {
    setSelectedFields(prev =>
      prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]
    );
  };

  const handleAnalyze = async () => {
    if (!selectedBoard || !selectedAdoProject) return;
    setAiScreen('analyzing');
    setAnalyzeError('');

    try {
      const result = await invoke('runAnalysis', {
        adoProject: selectedAdoProject.label,
        jiraProjectKey: selectedBoard.value,
        statusFilter: selectedStatuses,   // [] means all statuses
        fieldFilter: selectedFields,
      });

      if (result.error) {
        setAnalyzeError(result.error);
        setAiScreen('setup');
        return;
      }

      setAnalysisResult(result);
      // Use mappings from the analysis engine; auto-accept high-confidence ones
      setTypeMappings(
        (result.type_mappings || []).map(m => ({ ...m, userApproved: m.confidence >= 90 }))
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
      selectedStatuses,
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

        {/* Board selector */}
        <Stack space="space.100">
          <Label labelFor="ai-board">📋 Source Jira Board *</Label>
          {isLoadingBoards ? <Spinner size="small" /> : (
            <Select
              inputId="ai-board"
              options={boards}
              onChange={handleBoardChange}
              placeholder="Select a Jira board..."
            />
          )}
        </Stack>

        {/* Status filter — appears after board is selected */}
        {selectedBoard && (
          <Stack space="space.100">
            <Label labelFor="ai-statuses">🔖 Which statuses to migrate?</Label>
            {isLoadingStatuses ? <Spinner size="small" /> : boardStatuses.length > 0 ? (
              <Stack space="space.050">
                <Text>Leave all unchecked to migrate everything.</Text>
                <Inline space="space.100" shouldWrap>
                  {boardStatuses.map(s => (
                    <Button
                      key={s.id}
                      appearance={selectedStatuses.includes(s.name) ? 'primary' : 'default'}
                      onClick={() => toggleStatus(s.name)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </Inline>
              </Stack>
            ) : (
              <Text>No statuses found for this board.</Text>
            )}
          </Stack>
        )}

        {/* Field selector */}
        <Stack space="space.100">
          <Label labelFor="ai-fields">📦 What to migrate?</Label>
          <Inline space="space.100" shouldWrap>
            {FIELD_OPTIONS.map(f => (
              <Button
                key={f.id}
                appearance={selectedFields.includes(f.id) ? 'primary' : 'default'}
                onClick={() => toggleField(f.id)}
              >
                {selectedFields.includes(f.id) ? '✓ ' : ''}{f.label}
              </Button>
            ))}
          </Inline>
        </Stack>

        {/* ADO target */}
        <Stack space="space.100">
          <Label labelFor="ai-ado-project">🎯 Target Azure DevOps Project *</Label>
          {isLoadingProjects ? <Spinner size="small" /> : (
            <Select
              inputId="ai-ado-project"
              options={adoProjects}
              onChange={setSelectedAdoProject}
              placeholder="Select ADO project..."
            />
          )}
        </Stack>

        {analyzeError && (
          <SectionMessage appearance="error"><Text>❌ {analyzeError}</Text></SectionMessage>
        )}

        <Inline>
          <Button
            appearance="primary"
            onClick={handleAnalyze}
            isDisabled={!selectedBoard || !selectedAdoProject || selectedFields.length === 0}
          >
            Analyze →
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
        <Text>Analyzing your Jira project and Azure DevOps target...</Text>
        <Text>Fetching issue types, checking ADO compatibility, identifying gaps.</Text>
      </Stack>
    );
  }

  // ── Screen 2: Analysis Results ──────────────────────────────────────────────
  if (aiScreen === 'results') {
    const r = analysisResult;
    return (
      <Stack space="space.400">
        <Text>📊 Migration Analysis — {selectedAdoProject?.label}</Text>

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
              <Text>Files</Text>
            </Stack>
          </Box>
        </Inline>

        {/* AI Findings */}
        <Stack space="space.200">
          <Text>AI Findings</Text>
          {typeMappings.filter(m => m.confidence >= 90).length > 0 && (
            <Text>✓ {typeMappings.filter(m => m.confidence >= 90).map(m => m.jira).join(', ')} map directly to ADO equivalents</Text>
          )}
          {needsReview.map(m => (
            <Text key={m.jira}>⚠ "{m.jira}" type needs a mapping decision ({m.confidence}% confidence)</Text>
          ))}
          {userGaps.map(u => (
            <Text key={u.jira_user}>ℹ {u.jira_user} not in ADO — name preserved in card description</Text>
          ))}
          {needsReview.length === 0 && userGaps.length === 0 && (
            <Text>✓ All types map cleanly — no issues found</Text>
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
              <Text>STATUSES</Text><Text>{selectedStatuses.length > 0 ? selectedStatuses.join(', ') : 'All statuses'}</Text>
            </Inline>
            <Inline space="space.300">
              <Text>SCOPE</Text><Text>{analysisResult?.total_issues} issues</Text>
            </Inline>
            <Inline space="space.300">
              <Text>CONTENT</Text><Text>{selectedFields.map(f => FIELD_OPTIONS.find(o => o.id === f)?.label).filter(Boolean).join('  ✓ ')}</Text>
            </Inline>
          </Stack>
        </SectionMessage>

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
    if (status === 'warning')   { appearance = 'warning'; title = `Migration finished with warnings — ${processedCount} card(s) processed`; }
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

              {/* Final human-readable summary — no raw log lines */}
              {isFinal && migrationJob?.summary && (
                <Text>{migrationJob.summary}</Text>
              )}
              {isFinal && status === 'warning' && (
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
