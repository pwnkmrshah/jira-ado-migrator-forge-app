import ForgeReconciler, {
  Button,
  Checkbox,
  Heading,
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
  useProductContext,
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';
import React, { useEffect, useState } from 'react';
import GapAnalysisTab from './GapAnalysisTab';
import VerifyTab from './VerifyTab';

const JIRA_INSTANCE = 'pwnkmrshah';

const App = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [boardName, setBoardName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
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
  const context = useProductContext();

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

  useEffect(() => {
    if (!context) return;

    const fetchBoardName = async () => {
      try {
        const boardId = context.extension?.board?.id;
        const projectKey = context.extension?.project?.key;

        if (boardId) {
          const res = await requestJira(`/rest/agile/1.0/board/${boardId}`, {
            headers: { Accept: 'application/json' },
          });
          const data = await res.json();
          setBoardName(data.name || projectKey || 'Unknown Board');
        } else if (projectKey) {
          // Fallback when board.id is not in context (non-Software projects)
          const res = await requestJira(
            `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=1`,
            { headers: { Accept: 'application/json' } }
          );
          const data = await res.json();
          setBoardName(data.values?.[0]?.name || projectKey);
        }
      } catch {
        setBoardName('Unable to load board');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBoardName();
  }, [context]);

  return (
    <Stack space="space.300">
      <Heading size="xlarge">Migrate Board to Azure DevOps</Heading>
      <SectionMessage appearance="information">
        <Text>
          Migrate Jira cards — attachments, comments, and metadata — to Azure DevOps.
        </Text>
      </SectionMessage>
      <Button appearance="primary" onClick={() => setIsOpen(true)}>
        Open Migration Wizard
      </Button>

      <ModalTransition>
        {isOpen && (
          <Modal onClose={() => setIsOpen(false)}>
            <ModalHeader>
              <ModalTitle>
                {activeTab === 'migrate' ? '🚀 Migrate Board to Azure DevOps' : activeTab === 'gap' ? '🔍 Gap Analysis' : '✅ Verify Migration'}
              </ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.300">
                {/* Tab bar */}
                <Inline space="space.100">
                  <Button
                    appearance={activeTab === 'migrate' ? 'primary' : 'default'}
                    onClick={() => setActiveTab('migrate')}
                  >
                    🚀 Migrate
                  </Button>
                  <Button
                    appearance={activeTab === 'gap' ? 'primary' : 'default'}
                    onClick={() => setActiveTab('gap')}
                  >
                    🔍 Gap Analysis
                  </Button>
                  <Button
                    appearance={activeTab === 'verify' ? 'primary' : 'default'}
                    onClick={() => setActiveTab('verify')}
                  >
                    ✅ Verify
                  </Button>
                </Inline>

                {/* ── Migrate tab content ── */}
                {activeTab === 'migrate' && (
                <Stack space="space.300">
                <SectionMessage appearance="information">
                  <Text>
                    This will migrate all cards, attachments, and metadata from
                    this Jira board to Azure DevOps.
                  </Text>
                </SectionMessage>

                {/* Source Board — read-only, loaded from Jira Agile API */}
                <Stack space="space.100">
                  <Label labelFor="source-board">Source Board</Label>
                  {isLoading ? (
                    <Spinner size="small" />
                  ) : (
                    <Textfield id="source-board" value={boardName} isReadOnly />
                  )}
                </Stack>

                {/* Mode toggle: filter ID vs specific keys */}
                <Stack space="space.100">
                  <Label>Migration Mode</Label>
                  <Inline space="space.100">
                    <Button
                      appearance={migrationMode === 'filter' ? 'primary' : 'default'}
                      onClick={() => setMigrationMode('filter')}
                      isDisabled={isRunning}
                    >
                      By Filter ID
                    </Button>
                    <Button
                      appearance={migrationMode === 'keys' ? 'primary' : 'default'}
                      onClick={() => setMigrationMode('keys')}
                      isDisabled={isRunning}
                    >
                      By Jira Keys
                    </Button>
                  </Inline>
                </Stack>

                {migrationMode === 'filter' ? (
                  <Stack space="space.100">
                    <Label labelFor="jira-filter-id">Jira Filter ID *</Label>
                    <Textfield
                      id="jira-filter-id"
                      value={jiraFilterId}
                      onChange={(e) => setJiraFilterId(e.target.value)}
                      placeholder="e.g. 11657"
                      isDisabled={isRunning}
                    />
                  </Stack>
                ) : (
                  <Stack space="space.100">
                    <Label labelFor="jira-keys">Jira Keys * (comma-separated)</Label>
                    <TextArea
                      id="jira-keys"
                      value={jiraKeys}
                      onChange={(e) => setJiraKeys(e.target.value)}
                      placeholder="e.g. OP-1480, OP-824, OP-1200"
                      isDisabled={isRunning}
                    />
                  </Stack>
                )}

                {/* Target ADO Project — no board needed for migration */}
                <Stack space="space.100">
                  <Label labelFor="target-project">Target Azure DevOps Project *</Label>
                  {isLoadingProjects ? (
                    <Spinner size="small" />
                  ) : (
                    <Select
                      inputId="target-project"
                      options={adoProjects}
                      onChange={setSelectedProject}
                      placeholder="Select ADO project..."
                      isDisabled={isRunning}
                    />
                  )}
                </Stack>

                {/* Skip attachments — speeds up migration, useful for debugging */}
                <Checkbox
                  label="Skip attachments (faster — useful for debugging large-file issues)"
                  isChecked={skipAttachments}
                  onChange={() => setSkipAttachments(prev => !prev)}
                  isDisabled={isRunning}
                />

                {/* In-progress: spinner + live log tail from polling */}
                {isRunning && (
                  <SectionMessage appearance="information">
                    <Stack space="space.200">
                      <Inline space="space.100" alignBlock="center">
                        <Spinner size="small" />
                        <Text>
                          {migrationStatus === 'starting'
                            ? 'Starting migration...'
                            : migrationStatus === 'queued'
                            ? 'Queued — waiting for engine to pick up the job...'
                            : 'Migration in progress...'}
                        </Text>
                      </Inline>
                      {recentLogLines.length > 0 ? (
                        <Stack space="space.050">
                          {recentLogLines.map((line, i) => (
                            <Text key={i}>{line}</Text>
                          ))}
                        </Stack>
                      ) : (
                        <Text>Connecting to migration engine...</Text>
                      )}
                    </Stack>
                  </SectionMessage>
                )}

                {migrationStatus === 'completed' && (
                  <SectionMessage appearance="success">
                    <Stack space="space.100">
                      <Text>✅ Migration completed successfully!</Text>
                      {recentLogLines.length > 0 && (
                        <Text>{recentLogLines.join(' | ')}</Text>
                      )}
                    </Stack>
                  </SectionMessage>
                )}

                {migrationStatus === 'warning' && (
                  <SectionMessage appearance="warning">
                    <Text>
                      ⚠️ Migrated with some issues — item created in ADO, but certain fields
                      (e.g. Assigned To) could not be set because the Jira user is not a
                      member of the ADO organisation. This is expected for test accounts.
                    </Text>
                  </SectionMessage>
                )}

                {migrationStatus === 'failed' && (
                  <SectionMessage appearance="error">
                    <Text>❌ {jobError || 'Migration failed'}</Text>
                  </SectionMessage>
                )}
                </Stack>
                )}

                {/* ── Gap Analysis tab content (partial) ── */}
                {activeTab === 'gap' && (
                  <GapAnalysisTab
                    adoProjects={adoProjects}
                    isLoadingProjects={isLoadingProjects}
                  />
                )}

                {/* ── Verify Migration tab content (partial) ── */}
                {activeTab === 'verify' && (
                  <VerifyTab
                    adoProjects={adoProjects}
                    isLoadingProjects={isLoadingProjects}
                  />
                )}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              {activeTab === 'migrate' && (
                <Button
                  appearance="primary"
                  onClick={handleMigrate}
                  isDisabled={!canMigrate}
                >
                  {isRunning ? 'Migrating...' : 'Migrate to ADO'}
                </Button>
              )}
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
