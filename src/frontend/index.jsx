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

const JIRA_INSTANCE = 'pwnkmrshah';

const App = () => {
  const [isOpen, setIsOpen] = useState(false);
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
  const [activeTab, setActiveTab] = useState('migrate'); // 'migrate' | 'gap' | 'verify'
  const [jobId, setJobId] = useState(null);
  const [jobOutput, setJobOutput] = useState('');
  const [jobError, setJobError] = useState('');

  // Fetch all Jira projects so the user can pick source without navigating to a specific board
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
    maxWidth: '640px',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: 'space.500',
  });

  return (
    <Box xcss={wrapStyle}>
      <Stack space="space.500">

        {/* Landing — always visible above the form */}
        <Stack space="space.300">
          <Text>
            Migrate Jira projects to Azure DevOps — cards, attachments, comments,
            and metadata. Trusted for 3,000+ cards with 98.7% field accuracy.
          </Text>
          <Stack space="space.200">
            <SectionMessage appearance="information">
              <Text>📋  Migrate — bulk by Jira Filter ID, or target specific card keys.</Text>
            </SectionMessage>
            <SectionMessage appearance="warning">
              <Text>🔍  Gap Analysis — identify cards missed or in the wrong area path.</Text>
            </SectionMessage>
            <SectionMessage appearance="success">
              <Text>✅  Verify — field-by-field accuracy check (title, assignee, attachments, comments).</Text>
            </SectionMessage>
          </Stack>
          {!isOpen && (
            <Inline>
              <Button appearance="primary" onClick={() => setIsOpen(true)}>
                Open Migration Wizard →
              </Button>
            </Inline>
          )}
        </Stack>

        {/* Wizard — modal popup, opens only on button click */}
        <ModalTransition>
          {isOpen && (
            <Modal onClose={() => setIsOpen(false)}>
              <ModalHeader>
                <ModalTitle>
                  {activeTab === 'migrate' ? '🚀 Migrate to Azure DevOps' : activeTab === 'gap' ? '🔍 Gap Analysis' : '✅ Verify Migration'}
                </ModalTitle>
              </ModalHeader>
              <ModalBody>
                <Stack space="space.300">
                  <Inline space="space.100">
                    <Button appearance={activeTab === 'migrate' ? 'primary' : 'default'} onClick={() => setActiveTab('migrate')}>🚀 Migrate</Button>
                    <Button appearance={activeTab === 'gap' ? 'primary' : 'default'} onClick={() => setActiveTab('gap')}>🔍 Gap Analysis</Button>
                    <Button appearance={activeTab === 'verify' ? 'primary' : 'default'} onClick={() => setActiveTab('verify')}>✅ Verify</Button>
                  </Inline>

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

                      {isRunning && (
                        <SectionMessage appearance="information">
                          <Stack space="space.200">
                            <Inline space="space.100" alignBlock="center">
                              <Spinner size="small" />
                              <Text>{migrationStatus === 'starting' ? 'Starting migration...' : migrationStatus === 'queued' ? 'Queued — waiting for engine...' : 'Migration in progress...'}</Text>
                            </Inline>
                            {recentLogLines.length > 0
                              ? <Stack space="space.050">{recentLogLines.map((line, i) => <Text key={i}>{line}</Text>)}</Stack>
                              : <Text>Connecting to migration engine...</Text>}
                          </Stack>
                        </SectionMessage>
                      )}
                      {migrationStatus === 'completed' && (
                        <SectionMessage appearance="success">
                          <Stack space="space.100">
                            <Text>✅ Migration completed successfully!</Text>
                            {recentLogLines.length > 0 && <Text>{recentLogLines.join(' | ')}</Text>}
                          </Stack>
                        </SectionMessage>
                      )}
                      {migrationStatus === 'warning' && (
                        <SectionMessage appearance="warning">
                          <Text>⚠️ Migrated with issues — Assigned To could not be set (user not in ADO org).</Text>
                        </SectionMessage>
                      )}
                      {migrationStatus === 'failed' && (
                        <SectionMessage appearance="error">
                          <Text>❌ {jobError || 'Migration failed'}</Text>
                        </SectionMessage>
                      )}
                    </Stack>
                  )}

                  {activeTab === 'gap' && <GapAnalysisTab adoProjects={adoProjects} isLoadingProjects={isLoadingProjects} />}
                  {activeTab === 'verify' && <VerifyTab adoProjects={adoProjects} isLoadingProjects={isLoadingProjects} />}
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
    </Box>
  );
};

ForgeReconciler.render(<App />);
