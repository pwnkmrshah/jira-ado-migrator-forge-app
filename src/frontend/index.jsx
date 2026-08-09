import ForgeReconciler, {
  Button,
  Heading,
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
  Textfield,
  useProductContext,
} from '@forge/react';
import { invoke, requestJira } from '@forge/bridge';
import React, { useEffect, useState } from 'react';

const App = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [boardName, setBoardName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [adoProjects, setAdoProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [adoBoards, setAdoBoards] = useState([]);
  const [selectedBoard, setSelectedBoard] = useState(null);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [jiraFilterId, setJiraFilterId] = useState('');
  const [migrationStatus, setMigrationStatus] = useState('idle'); // 'idle' | 'starting' | 'queued' | 'running' | 'completed' | 'failed'
  const [jobId, setJobId] = useState(null);
  const [jobOutput, setJobOutput] = useState('');
  const [jobError, setJobError] = useState('');
  const context = useProductContext();

  const handleProjectChange = async (option) => {
    setSelectedProject(option);
    setSelectedBoard(null);
    setAdoBoards([]);
    if (!option) return;
    setIsLoadingBoards(true);
    try {
      const result = await invoke('getAdoBoards', { projectName: option.label });
      if (result.boards?.length) {
        setAdoBoards(result.boards.map(b => ({ label: b.name, value: b.id })));
      }
    } catch {
      // boards dropdown stays empty
    } finally {
      setIsLoadingBoards(false);
    }
  };

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
        jiraInstance: 'pwnkmrshah',
        jiraFilterId: jiraFilterId.trim(),
        adoProject: selectedProject?.label,
      });
      if (result.error) {
        setMigrationStatus('failed');
        setJobError(result.error);
      } else {
        setJobId(result.jobId);
        setMigrationStatus(result.status || 'queued');
      }
    } catch (err) {
      setMigrationStatus('failed');
      setJobError('Failed to start migration');
    }
  };

  // Poll job status every 5 seconds while migration is in-flight
  useEffect(() => {
    const terminalStates = ['completed', 'warning', 'failed'];
    if (!jobId || terminalStates.includes(migrationStatus)) return;
    const interval = setInterval(async () => {
      try {
        const result = await invoke('pollJobStatus', { jobId });
        if (result.status) setMigrationStatus(result.status);
        if (result.output) setJobOutput(result.output);
        if (result.error_summary && ['failed', 'warning'].includes(result.status)) setJobError(result.error_summary);
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [jobId, migrationStatus]);

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
          This will migrate all cards, attachments, and metadata from this
          Jira board to Azure DevOps.
        </Text>
      </SectionMessage>
      <Button appearance="primary" onClick={() => setIsOpen(true)}>
        Migrate to ADO
      </Button>

      <ModalTransition>
        {isOpen && (
          <Modal onClose={() => setIsOpen(false)}>
            <ModalHeader>
              <ModalTitle>🚀 Migrate Board to Azure DevOps</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.300">
                <SectionMessage appearance="information">
                  <Text>
                    This will migrate all cards, attachments, and metadata from
                    this Jira board to Azure DevOps.
                  </Text>
                </SectionMessage>

                <Stack space="space.100">
                  <Label labelFor="source-board">Source Board</Label>
                  {isLoading ? (
                    <Spinner size="small" />
                  ) : (
                    <Textfield
                      id="source-board"
                      value={boardName}
                      isReadOnly
                    />
                  )}
                </Stack>

                <Stack space="space.100">
                  <Label labelFor="jira-instance">Jira Instance</Label>
                  <Textfield
                    id="jira-instance"
                    value="pwnkmrshah"
                    isReadOnly
                  />
                </Stack>

                <Stack space="space.100">
                  <Label labelFor="jira-filter-id">Jira Filter ID *</Label>
                  <Textfield
                    id="jira-filter-id"
                    value={jiraFilterId}
                    onChange={(e) => setJiraFilterId(e.target.value)}
                    placeholder="e.g. 11657"
                  />
                </Stack>

                <Stack space="space.100">
                  <Label labelFor="target-project">Target Azure DevOps Project *</Label>
                  {isLoadingProjects ? (
                    <Spinner size="small" />
                  ) : (
                    <Select
                      inputId="target-project"
                      options={adoProjects}
                      onChange={handleProjectChange}
                      placeholder="Select ADO project..."
                    />
                  )}
                </Stack>

                <Stack space="space.100">
                  <Label labelFor="target-board">Target ADO Board</Label>
                  {isLoadingBoards ? (
                    <Spinner size="small" />
                  ) : (
                    <Select
                      inputId="target-board"
                      options={adoBoards}
                      onChange={setSelectedBoard}
                      placeholder={selectedProject ? 'Select ADO board...' : 'Select a project first'}
                      isDisabled={!selectedProject || isLoadingBoards}
                    />
                  )}
                </Stack>

                {(migrationStatus === 'starting' || migrationStatus === 'queued' || migrationStatus === 'running') && (
                  <Stack space="space.100">
                    <Spinner size="small" />
                    <Text>
                      {migrationStatus === 'starting'
                        ? 'Starting migration...'
                        : migrationStatus === 'queued'
                        ? 'Migration queued, waiting to start...'
                        : 'Migration in progress...'}
                    </Text>
                    {jobOutput ? (
                      <Text>{jobOutput.trim().split('\n').slice(-3).join(' | ')}</Text>
                    ) : null}
                  </Stack>
                )}
                {migrationStatus === 'completed' && (
                  jobOutput && jobOutput.includes('Found 0 issues') ? (
                    <SectionMessage appearance="warning">
                      <Text>⚠️ Filter returned 0 issues — nothing was migrated. Check that your filter has work items and is shared with this account.</Text>
                    </SectionMessage>
                  ) : (
                    <SectionMessage appearance="success">
                      <Text>✅ Migration completed successfully!</Text>
                      {jobOutput ? (
                        <Text>{jobOutput.trim().split('\n').slice(-3).join(' | ')}</Text>
                      ) : null}
                    </SectionMessage>
                  )
                )}
                {migrationStatus === 'warning' && (
                  <SectionMessage appearance="warning">
                    <Text>⚠️ Migrated with some issues — item was created/updated in ADO, but certain fields (e.g. Assigned To) could not be set because the Jira user is not a member of the ADO organisation. This is expected for test accounts and will not affect real migrations.</Text>
                  </SectionMessage>
                )}
                {migrationStatus === 'failed' && (
                  <SectionMessage appearance="error">
                    <Text>❌ {jobError || 'Migration failed. Check the filter ID and try again.'}</Text>
                  </SectionMessage>
                )}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleMigrate}
                isDisabled={['starting', 'queued', 'running'].includes(migrationStatus) || !selectedProject || !selectedBoard || !jiraFilterId.trim()}
              >
                {['starting', 'queued', 'running'].includes(migrationStatus) ? 'Migrating...' : 'Migrate to ADO'}
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(<App />);
