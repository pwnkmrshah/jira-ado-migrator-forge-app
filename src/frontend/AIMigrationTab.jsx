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
  TextArea,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import React, { useState } from 'react';

// Dot rating for confidence: ●●●○ 74%
const ConfidenceDots = ({ score }) => {
  const filled = score >= 90 ? 4 : score >= 75 ? 3 : score >= 60 ? 2 : 1;
  const dots = Array.from({ length: 4 }, (_, i) => (i < filled ? '●' : '○')).join('');
  const color = score >= 90 ? '✅' : score >= 75 ? '⚠️' : '🔴';
  return <Text>{color} {dots} {score}%</Text>;
};

// Deterministic type mapping until LLM is wired up in Phase 2
function buildMappings(byType, adoAvailableTypes) {
  const KNOWN = {
    'story':         { ado: 'User Story', confidence: 96, reason: 'Industry-standard direct equivalent' },
    'userstory':     { ado: 'User Story', confidence: 96, reason: 'Direct match' },
    'bug':           { ado: 'Bug',        confidence: 99, reason: 'Exact name match' },
    'task':          { ado: 'Task',       confidence: 94, reason: 'Exact name match' },
    'subtask':       { ado: 'Task',       confidence: 88, reason: 'Subtasks map to Tasks in ADO' },
    'epic':          { ado: 'Epic',       confidence: 92, reason: 'Direct equivalent' },
    'feature':       { ado: 'Feature',    confidence: 91, reason: 'Direct equivalent' },
    'improvement':   { ado: 'User Story', confidence: 78, reason: 'Improvements are user-facing enhancements' },
    'newfeature':    { ado: 'Feature',    confidence: 85, reason: 'Feature request maps to Feature type' },
    'technicaldebt': { ado: 'Task',       confidence: 72, reason: 'No direct ADO equivalent. Code quality items map closest to Task.' },
  };

  return (byType || []).map(({ name, count }) => {
    const key = name.toLowerCase().replace(/[\s-]/g, '');
    const known = KNOWN[key];

    // Try known mapping first, then check if it exists in this ADO project
    if (known && adoAvailableTypes.includes(known.ado)) {
      return { jira: name, count, ado: known.ado, confidence: known.confidence, reason: known.reason, userApproved: known.confidence >= 90 };
    }

    // Fuzzy: find ADO type whose name overlaps
    const fuzzy = adoAvailableTypes.find(t =>
      t.toLowerCase().includes(key) || key.includes(t.toLowerCase().replace(/\s/g, ''))
    );
    if (fuzzy) {
      return { jira: name, count, ado: fuzzy, confidence: 82, reason: `Name overlap with ADO type "${fuzzy}"`, userApproved: false };
    }

    // Fallback to Task (most generic)
    const fallback = adoAvailableTypes.includes('Task') ? 'Task' : adoAvailableTypes[0] || 'Task';
    return {
      jira: name, count,
      ado: fallback,
      confidence: 58,
      reason: `No direct ADO equivalent. "${fallback}" is the closest available type — review recommended.`,
      userApproved: false,
    };
  });
}

const tileStyle = xcss({ padding: 'space.200', textAlign: 'center' });

const AIMigrationTab = ({ adoProjects, isLoadingProjects }) => {
  // aiScreen: 'intent' | 'analyzing' | 'results' | 'mapping' | 'plan'
  const [aiScreen, setAiScreen] = useState('intent');
  const [intent, setIntent] = useState('');
  const [selectedAdoProject, setSelectedAdoProject] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [typeMappings, setTypeMappings] = useState([]);
  const [analyzeError, setAnalyzeError] = useState('');
  const [approving, setApproving] = useState(false);

  const handleAnalyze = async () => {
    if (!intent.trim() || !selectedAdoProject) return;
    setAiScreen('analyzing');
    setAnalyzeError('');

    try {
      const result = await invoke('runAnalysis', {
        intent: intent.trim(),
        adoProject: selectedAdoProject.label,
      });

      if (result.error) {
        setAnalyzeError(result.error);
        setAiScreen('intent');
        return;
      }

      setAnalysisResult(result);
      setTypeMappings(buildMappings(result.by_type, result.ado_available_types || []));
      setAiScreen('results');
    } catch (err) {
      setAnalyzeError(`Analysis failed: ${err.message}`);
      setAiScreen('intent');
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
      intent,
      adoProject: selectedAdoProject?.label,
      scope: analysisResult?.total_issues,
      type_mappings: Object.fromEntries(typeMappings.map(m => [m.jira, m.ado])),
      warnings: [
        ...(analysisResult?.user_gaps || []).map(u => `${u.jira_user} has no ADO account — will be preserved in card description`),
        ...typeMappings.filter(m => m.confidence < 80).map(m => `"${m.jira}" mapped to "${m.ado}" (${m.confidence}% confidence — review recommended)`),
      ],
    };
    await invoke('approveMigrationPlan', approvedPlan);
    setApproving(false);
  };

  const allMappingsApproved = typeMappings.length > 0 && typeMappings.every(m => m.userApproved);
  const adoTypeOptions = (analysisResult?.ado_available_types || []).map(t => ({ label: t, value: t }));
  const needsReview = typeMappings.filter(m => !m.userApproved);
  const userGaps = analysisResult?.user_gaps || [];

  // ── Screen 1: Intent ────────────────────────────────────────────────────────
  if (aiScreen === 'intent') {
    return (
      <Stack space="space.300">
        <SectionMessage appearance="information">
          <Text>Describe what you want to migrate in plain English. The AI will analyze your Jira project and propose a migration plan.</Text>
        </SectionMessage>

        <Stack space="space.100">
          <Label labelFor="ai-intent">🤖 What do you want to migrate?</Label>
          <TextArea
            id="ai-intent"
            value={intent}
            onChange={e => setIntent(e.target.value)}
            placeholder="e.g. Migrate our active sprint from SUST project to Embedded Refills ADO. Keep comments and attachments. Skip anything marked Won't Do."
          />
        </Stack>

        <Stack space="space.100">
          <Label labelFor="ai-ado-project">Target Azure DevOps Project *</Label>
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
            isDisabled={!intent.trim() || !selectedAdoProject}
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
          <Button appearance="subtle" onClick={() => setAiScreen('intent')}>← Back</Button>
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

  return (
    <Stack space="space.400">
      <Text>📋 Migration Plan</Text>

      <Stack space="space.200">
        <SectionMessage appearance="information">
          <Stack space="space.100">
            <Inline space="space.300">
              <Text>SOURCE</Text><Text>{credMeta?.jiraUrl || 'Jira'}</Text>
            </Inline>
            <Inline space="space.300">
              <Text>TARGET</Text><Text>{selectedAdoProject?.label} (ADO)</Text>
            </Inline>
            <Inline space="space.300">
              <Text>SCOPE</Text><Text>{analysisResult?.total_issues} issues</Text>
            </Inline>
            <Inline space="space.300">
              <Text>CONTENT</Text><Text>✓ Descriptions  ✓ Comments  ✓ Attachments  ✓ Links  ✓ Labels</Text>
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
};

export default AIMigrationTab;
