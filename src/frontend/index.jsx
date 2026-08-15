import ForgeReconciler, {
  Box,
  Button,
  Checkbox,
  Inline,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
  xcss,
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';
import React, { useEffect, useState } from 'react';
import GapAnalysisTab from './GapAnalysisTab';
import VerifyTab from './VerifyTab';
import AIMigrationTab from './AIMigrationTab';

const JIRA_INSTANCE = 'pwnkmrshah';

const App = () => {
  const [isOpen, setIsOpen] = useState(false);

  // credScreen: 'checking' | 'setup' | 'connected'
  const [credScreen, setCredScreen] = useState('checking');
  const [credMeta, setCredMeta] = useState(null); // {jiraUrl, jiraEmail, adoOrg}

  // Setup form fields
  const [jiraUrl, setJiraUrl] = useState('');
  const [jiraEmail, setJiraEmail] = useState('');
  const [jiraToken, setJiraToken] = useState('');
  const [adoOrg, setAdoOrg] = useState('');
  const [adoPat, setAdoPat] = useState('');
  const [jiraTestStatus, setJiraTestStatus] = useState('idle'); // 'idle'|'testing'|'ok'|'fail'
  const [adoTestStatus, setAdoTestStatus] = useState('idle');
  const [jiraTestMsg, setJiraTestMsg] = useState('');
  const [adoTestMsg, setAdoTestMsg] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [jiraProjects, setJiraProjects] = useState([]);
  const [selectedJiraProject, setSelectedJiraProject] = useState(null);
  const [isLoadingJiraProjects, setIsLoadingJiraProjects] = useState(true);
  const [adoProjects, setAdoProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);

  // 'filter' = migrate by Jira filter ID, 'keys' = migrate specific comma-separated keys
  const [migrationMode, setMigrationMode] = useState('filter');
  const [jiraFilterId, setJiraFilterId] = useState('');
  const [jiraKeys, setJiraKeys] = useState('');
  const [skipAttachments, setSkipAttachments] = useState(false);

  const [migrationStatus, setMigrationStatus] = useState('idle');
  const [aiIsMigrating, setAiIsMigrating] = useState(false);
  const [aiCurrentScreen, setAiCurrentScreen] = useState('setup');
  const [showManualLockMsg, setShowManualLockMsg] = useState(false);
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'migrate' | 'gap' | 'verify'
  const [jobId, setJobId] = useState(null);
  const [jobOutput, setJobOutput] = useState('');
  const [jobError, setJobError] = useState('');
  const [jobProgress, setJobProgress] = useState(null);
  const [jobSummary, setJobSummary] = useState('');
  const [jobCardCsv, setJobCardCsv] = useState(null);

  // Fetch all Jira projects so the user can pick source without navigating to a specific board
  useEffect(() => {
    // Check stored credentials on mount
    invoke('loadCredentialsMeta').then(result => {
      if (result.hasCredentials) {
        setCredMeta(result);
        setCredScreen('connected');
      } else {
        setCredScreen('setup');
      }
    }).catch(() => setCredScreen('setup'));
  }, []);

  const handleTestJira = async () => {
    setJiraTestStatus('testing');
    const result = await invoke('testJiraConnection', { jiraUrl, jiraEmail, jiraToken });
    setJiraTestStatus(result.success ? 'ok' : 'fail');
    setJiraTestMsg(result.success ? `Connected as ${result.displayName}` : result.error);
  };

  const handleTestAdo = async () => {
    setAdoTestStatus('testing');
    const result = await invoke('testAdoConnection', { adoOrg, adoPat });
    setAdoTestStatus(result.success ? 'ok' : 'fail');
    setAdoTestMsg(result.success ? `Connected — ${result.projectCount} project(s) found` : result.error);
  };

  const handleSaveCredentials = async () => {
    setSavingCreds(true);
    setSaveError('');
    const result = await invoke('saveCredentials', { jiraUrl, jiraEmail, jiraToken, adoOrg, adoPat });
    setSavingCreds(false);
    if (result.success) {
      setCredMeta({ jiraUrl, jiraEmail, adoOrg });
      setCredScreen('connected');
    } else {
      setSaveError(result.error || 'Failed to save credentials');
    }
  };

  const handleDisconnect = async () => {
    await invoke('deleteCredentials');
    setCredMeta(null);
    setJiraUrl(''); setJiraEmail(''); setJiraToken('');
    setAdoOrg(''); setAdoPat('');
    setJiraTestStatus('idle'); setAdoTestStatus('idle');
    setCredScreen('setup');
  };

  const canSave = jiraUrl && jiraEmail && jiraToken && adoOrg && adoPat && !savingCreds;

  // Jira project list for source picker (loaded after credentials are confirmed)
  useEffect(() => {
    const fetchJiraProjects = async () => {
      try {
        const res = await requestJira('/rest/api/3/project/search?maxResults=50&orderBy=name', {
          headers: { Accept: 'application/json' },
        });
        const data = await res.json();
        if (data.values?.length) {
          setJiraProjects(data.values.map(p => ({ label: `${p.name} (${p.key})`, value: p.key })));
        }
      } catch {
        // dropdown stays empty
      } finally {
        setIsLoadingJiraProjects(false);
      }
    };
    fetchJiraProjects();
  }, []);

  useEffect(() => {
    const fetchAdoProjects = async () => {
      try {
        const result = await invoke('getAdoProjects', {});
        if (result.projects?.length) {
          setAdoProjects(result.projects.map(p => ({ label: p.name, value: p.id })));
        }
      } catch {
        // dropdown stays empty
      } finally {
        setIsLoadingProjects(false);
      }
    };
    fetchAdoProjects();
  }, []);

  const handleMigrate = async () => {
    setMigrationStatus('starting');
    setJobId(null);
    setJobOutput('');
    setJobError('');
    setJobProgress(null);
    setJobSummary('');
    setJobCardCsv(null);
    try {
      const result = await invoke('startMigration', {
        jiraInstance: JIRA_INSTANCE,
        jiraFilterId: migrationMode === 'filter' ? jiraFilterId.trim() : '',
        jiraKeys: migrationMode === 'keys' ? jiraKeys.trim() : '',
        adoProject: selectedProject?.label,
        skipAttachments,
      });
      if (result.error) {
        setMigrationStatus('failed');
        setJobError(result.error);
      } else {
        setJobId(result.jobId);
        setMigrationStatus(result.status || 'queued');
      }
    } catch {
      setMigrationStatus('failed');
      setJobError('Failed to start migration');
    }
  };

  // Poll every 2s while migration is in-flight
  useEffect(() => {
    const terminalStates = ['completed', 'warning', 'failed'];
    if (!jobId || terminalStates.includes(migrationStatus)) return;
    const interval = setInterval(async () => {
      try {
        const result = await invoke('pollJobStatus', { jobId });
        if (result.status) setMigrationStatus(result.status);
        if (result.output) setJobOutput(result.output);
        if (result.progress) setJobProgress(result.progress);
        if (result.error_summary) setJobSummary(result.error_summary);
        if (result.card_csv) setJobCardCsv(result.card_csv);
        if (result.error && ['failed', 'warning'].includes(result.status)) setJobError(result.error);
      } catch {
        // keep polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [jobId, migrationStatus]);

  const isRunning = ['starting', 'queued', 'running'].includes(migrationStatus);

  const hasInput = migrationMode === 'filter'
    ? jiraFilterId.trim().length > 0
    : jiraKeys.trim().length > 0;

  const canMigrate = !isRunning && !!selectedProject && hasInput;

  // Last 4 non-empty log lines shown during in-progress state
  const recentLogLines = jobOutput
    ? jobOutput.trim().split('\n').filter(l => l.trim()).slice(-4)
    : [];

  const wrapStyle = xcss({
    maxWidth: '900px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: 'space.500',
  });

  return (
    <Box xcss={wrapStyle}>

      {/* ── Checking credentials ─────────────────────────────── */}
      {credScreen === 'checking' && (
        <Inline alignBlock="center" space="space.100">
          <Spinner size="small" />
          <Text>Loading...</Text>
        </Inline>
      )}

      {/* ── Credential setup ─────────────────────────────────── */}
      {credScreen === 'setup' && (
        <Stack space="space.500">

          {/* Header */}
          <Stack space="space.150">
            <Text>✨ Set up ADO Migration</Text>
            <Text>Connect Jira and Azure DevOps once — credentials are encrypted and never written to disk.</Text>
          </Stack>

          {/* Two-column cards */}
          <Inline space="space.300" alignBlock="start">

            {/* Jira card */}
            <Box xcss={xcss({ borderWidth: 'border.width', borderStyle: 'solid', borderColor: 'color.border', borderRadius: 'border.radius', padding: 'space.300' })}>
              <Stack space="space.250">
                <Inline spread="space-between" alignBlock="center">
                  <Text>🔵 Jira</Text>
                  {jiraTestStatus === 'ok' && <Text>✅ Connected</Text>}
                  {jiraTestStatus === 'fail' && <Text>❌ Failed</Text>}
                  {jiraTestStatus === 'testing' && <Spinner size="small" />}
                </Inline>
                <Stack space="space.100">
                  <Label labelFor="jira-url">Jira URL</Label>
                  <Textfield id="jira-url" value={jiraUrl} onChange={e => setJiraUrl(e.target.value)} placeholder="https://yourcompany.atlassian.net" />
                </Stack>
                <Stack space="space.100">
                  <Label labelFor="jira-email">Email</Label>
                  <Textfield id="jira-email" value={jiraEmail} onChange={e => setJiraEmail(e.target.value)} placeholder="you@company.com" />
                </Stack>
                <Stack space="space.100">
                  <Label labelFor="jira-token">API Token</Label>
                  <Textfield id="jira-token" type="password" value={jiraToken} onChange={e => setJiraToken(e.target.value)} placeholder="ATATT3x..." />
                </Stack>
                <Button
                  appearance={jiraTestStatus === 'ok' ? 'default' : 'primary'}
                  onClick={handleTestJira}
                  isDisabled={!jiraUrl || !jiraEmail || !jiraToken || jiraTestStatus === 'testing'}
                >
                  {jiraTestStatus === 'testing' ? 'Testing…' : jiraTestStatus === 'ok' ? 'Re-test' : 'Test Connection'}
                </Button>
                {jiraTestStatus === 'fail' && <Text>{jiraTestMsg}</Text>}
              </Stack>
            </Box>

            {/* ADO card */}
            <Box xcss={xcss({ borderWidth: 'border.width', borderStyle: 'solid', borderColor: 'color.border', borderRadius: 'border.radius', padding: 'space.300' })}>
              <Stack space="space.250">
                <Inline spread="space-between" alignBlock="center">
                  <Text>🔷 Azure DevOps</Text>
                  {adoTestStatus === 'ok' && <Text>✅ Connected</Text>}
                  {adoTestStatus === 'fail' && <Text>❌ Failed</Text>}
                  {adoTestStatus === 'testing' && <Spinner size="small" />}
                </Inline>
                <Stack space="space.100">
                  <Label labelFor="ado-org">Organization</Label>
                  <Textfield id="ado-org" value={adoOrg} onChange={e => setAdoOrg(e.target.value)} placeholder="yourorg" />
                </Stack>
                <Stack space="space.100">
                  <Label labelFor="ado-pat">Personal Access Token</Label>
                  <Textfield id="ado-pat" type="password" value={adoPat} onChange={e => setAdoPat(e.target.value)} placeholder="7IXQJTQ9o4..." />
                </Stack>
                <Button
                  appearance={adoTestStatus === 'ok' ? 'default' : 'primary'}
                  onClick={handleTestAdo}
                  isDisabled={!adoOrg || !adoPat || adoTestStatus === 'testing'}
                >
                  {adoTestStatus === 'testing' ? 'Testing…' : adoTestStatus === 'ok' ? 'Re-test' : 'Test Connection'}
                </Button>
                {adoTestStatus === 'fail' && <Text>{adoTestMsg}</Text>}
              </Stack>
            </Box>
          </Inline>

          {saveError && <SectionMessage appearance="error"><Text>{saveError}</Text></SectionMessage>}

          <Inline alignBlock="center" space="space.200">
            <Button appearance="primary" onClick={handleSaveCredentials} isDisabled={!canSave}>
              {savingCreds ? 'Saving…' : 'Continue to Migration →'}
            </Button>
            {canSave && <Text>Both connections verified ✓</Text>}
          </Inline>
        </Stack>
      )}

      {/* ── Main migration wizard (shown after credentials are set) ── */}
      {credScreen === 'connected' && (
      <Stack space="space.400">

        {/* Connection status bar */}
        <SectionMessage appearance="success">
          <Inline spread="space-between" alignBlock="center">
            <Stack space="space.050">
              <Text>🔵 Jira: {credMeta?.jiraUrl} ({credMeta?.jiraEmail})</Text>
              <Text>🔷 ADO: dev.azure.com/{credMeta?.adoOrg}</Text>
            </Stack>
            <Button appearance="subtle" onClick={handleDisconnect}>Manage connections</Button>
          </Inline>
        </SectionMessage>

        {/* Hero */}
        <Stack space="space.100">
          <Text>✨ ADO Migration Assistant</Text>
          <Text>Move your Jira work to Azure DevOps — AI-guided analysis, human review, then migrate.</Text>
        </Stack>

        {/* CTA cards */}
        {!isOpen && (
          <Stack space="space.200">
            <SectionMessage appearance="information">
              <Stack space="space.200">
                <Text>✨ AI-assisted Migration</Text>
                <Text>Analyze your board, get AI-recommended type mappings, review the full plan, then migrate — no surprises.</Text>
                <Inline>
                  <Button appearance="primary" onClick={() => { setIsOpen(true); setActiveTab('ai'); }}>
                    Start AI Migration →
                  </Button>
                </Inline>
              </Stack>
            </SectionMessage>
            <SectionMessage appearance="information">
              <Stack space="space.200">
                <Text>⚙️ Manual Migration</Text>
                <Text>Migrate by Jira Filter ID or specific issue keys.</Text>
                <Inline>
                  <Button appearance="default" onClick={() => { setIsOpen(true); setActiveTab('migrate'); }}>
                    Manual Migration
                  </Button>
                </Inline>
              </Stack>
            </SectionMessage>
          </Stack>
        )}

        {/* Wizard — modal popup, opens only on button click */}
        <ModalTransition>
          {isOpen && (
            <Modal onClose={() => {}}>
              <ModalHeader>
                <ModalTitle>
                  {activeTab === 'ai'
                    ? (aiCurrentScreen === 'results'   ? '📊 Migration Analysis'
                      : aiCurrentScreen === 'mapping'  ? '🗺️ Type Mappings'
                      : aiCurrentScreen === 'plan'     ? '📋 Migration Plan'
                      : aiCurrentScreen === 'migrating'? '⚡ Migrating…'
                      : '✨ Start AI Migration')
                    : '⚙️ Manual Migration'}
                </ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.300">
                  {/* No tab switcher — user chose AI or Manual from the landing page */}

                  {activeTab === 'ai' && (
                    <AIMigrationTab
                      adoProjects={adoProjects}
                      isLoadingProjects={isLoadingProjects}
                      onMigrationStateChange={setAiIsMigrating}
                      onScreenChange={setAiCurrentScreen}
                    />
                  )}

                  {activeTab === 'migrate' && (
                    <Stack space="space.300">
                      <Stack space="space.100">
                        <Label labelFor="source-project">Source Jira Project</Label>
                        {isLoadingJiraProjects ? <Spinner size="small" /> : (
                          <Select inputId="source-project" options={jiraProjects} onChange={setSelectedJiraProject} placeholder="Select Jira project..." isDisabled={isRunning} />
                        )}
                      </Stack>

                      <Stack space="space.100">
                        <Label>Migration Mode</Label>
                        <Inline space="space.100">
                          <Button appearance={migrationMode === 'filter' ? 'primary' : 'default'} onClick={() => setMigrationMode('filter')} isDisabled={isRunning}>By Filter ID</Button>
                          <Button appearance={migrationMode === 'keys' ? 'primary' : 'default'} onClick={() => setMigrationMode('keys')} isDisabled={isRunning}>By Jira Keys</Button>
                        </Inline>
                      </Stack>

                      {migrationMode === 'filter' ? (
                        <Stack space="space.100">
                          <Label labelFor="jira-filter-id">Jira Filter ID *</Label>
                          <Textfield id="jira-filter-id" value={jiraFilterId} onChange={(e) => setJiraFilterId(e.target.value)} placeholder="e.g. 11657" isDisabled={isRunning} />
                        </Stack>
                      ) : (
                        <Stack space="space.100">
                          <Label labelFor="jira-keys">Jira Keys * (comma-separated)</Label>
                          <TextArea id="jira-keys" value={jiraKeys} onChange={(e) => setJiraKeys(e.target.value)} placeholder="e.g. OP-1480, OP-824, OP-1200" isDisabled={isRunning} />
                        </Stack>
                      )}

                      <Stack space="space.100">
                        <Label labelFor="target-project">Target Azure DevOps Project *</Label>
                        {isLoadingProjects ? <Spinner size="small" /> : (
                          <Select inputId="target-project" options={adoProjects} onChange={setSelectedProject} placeholder="Select ADO project..." isDisabled={isRunning} />
                        )}
                      </Stack>

                      <Checkbox
                        label="Skip attachments (faster — useful for debugging large-file issues)"
                        isChecked={skipAttachments}
                        onChange={() => setSkipAttachments(prev => !prev)}
                        isDisabled={isRunning}
                      />

                      {(() => {
                        const isFinal = ['completed', 'warning', 'failed'].includes(migrationStatus);
                        if (!isRunning && !isFinal) return null;

                        const prog = jobProgress;
                        const total = prog?.total ?? 0;
                        const done  = prog?.done  ?? 0;
                        const pct   = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                        const bars  = Math.round(pct / 10);
                        const summaryMatch = (jobSummary || '').match(/(\d+) processed/);
                        const processedCount = summaryMatch ? summaryMatch[1] : (done || '?');
                        const failedMatch = (jobSummary || '').match(/(\d+) failed/);
                        const failedCount = failedMatch ? parseInt(failedMatch[1], 10) : 0;

                        let appearance = 'information';
                        let title = migrationStatus === 'starting' ? 'Starting migration…' : 'Migration queued — waiting for engine…';
                        if (isRunning && prog?.current_card && total === 0) title = 'Migration started — counting issues…';
                        if (isRunning && total > 0) title = `Migrating… ${done} of ${total} done · ${total - done} remaining`;
                        if (migrationStatus === 'completed') { appearance = 'success'; title = `Migration complete — ${processedCount} card(s) migrated ✓`; }
                        if (migrationStatus === 'warning' && failedCount === 0) { appearance = 'success'; title = `Migration complete — ${processedCount} card(s) migrated ✓`; }
                        if (migrationStatus === 'warning' && failedCount > 0)   { appearance = 'warning'; title = `Migration finished with warnings — ${processedCount} card(s) processed`; }
                        if (migrationStatus === 'failed') { appearance = 'error'; title = 'Migration failed'; }

                        return (
                          <SectionMessage appearance={appearance}>
                            <Stack space="space.200">
                              <Text>{title}</Text>

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

                              {isFinal && jobSummary && !(migrationStatus === 'warning' && failedCount === 0) && (
                                <Text>{jobSummary}</Text>
                              )}
                              {isFinal && migrationStatus === 'warning' && failedCount > 0 && (
                                <Text>Some field values (e.g. Assigned To) could not be set because the user is not in ADO. The name was preserved in the card description.</Text>
                              )}
                              {isFinal && migrationStatus === 'failed' && (
                                <Text>{jobError || 'Migration failed — check resolver logs for details.'}</Text>
                              )}
                            </Stack>
                          </SectionMessage>
                        );
                      })()}

                      {jobCardCsv && ['completed', 'warning', 'failed'].includes(migrationStatus) && (
                        <Button appearance="default" onClick={() => {
                          const a = document.createElement('a');
                          a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(jobCardCsv);
                          a.download = `migration-report-${jobId?.slice(0, 8)}.csv`;
                          a.click();
                        }}>
                          ⬇ Download Migration Report (CSV)
                        </Button>
                      )}
                    </Stack>
                  )}

                  {activeTab === 'gap' && <GapAnalysisTab adoProjects={adoProjects} isLoadingProjects={isLoadingProjects} />}
                  {activeTab === 'verify' && <VerifyTab adoProjects={adoProjects} isLoadingProjects={isLoadingProjects} />}
                  {/* Hidden tab content — kept for when tabs are re-enabled above */}
                </Stack>
              </ModalBody>
              <ModalFooter>
                <Button appearance="subtle" onClick={() => setIsOpen(false)}>Cancel</Button>
                {activeTab === 'migrate' && (
                  <Button appearance="primary" onClick={handleMigrate} isDisabled={!canMigrate}>
                    {isRunning ? 'Migrating...' : 'Migrate to ADO'}
                  </Button>
                )}
              </ModalFooter>
            </Modal>
          )}
        </ModalTransition>

      </Stack>
      )} {/* end credScreen === 'connected' */}

    </Box>
  );
};

ForgeReconciler.render(<App />);
