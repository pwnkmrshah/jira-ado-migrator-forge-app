/**
 * VerifyTab — "Rails partial" for the Verify Migration section.
 *
 * Props
 *   adoProjects        {Array}   Already-fetched projects [{label, value}] from parent.
 *   isLoadingProjects  {Boolean} True while the parent is still fetching ADO projects.
 */
import React, { useState, useEffect } from 'react';
import {
  Button,
  Label,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Text,
  Textfield,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const TERMINAL = new Set(['completed', 'warning', 'failed']);

const VERIFY_MODES = [
  { label: 'By Project Key (e.g. OP, SUST)', value: 'project' },
  { label: 'By Specific Jira Keys (comma-separated)', value: 'keys' },
  { label: 'By Jira Filter ID', value: 'filter' },
];

/**
 * Parse verify_migration.py stdout for the VERIFICATION SUMMARY block.
 * Expected lines:
 *   Total tickets : 50
 *   Found in ADO  : 48
 *   Has failures  : 5
 *   Pass rate     : 90%
 */
function parseSummary(output) {
  if (!output) return null;
  const grab = (substring) => {
    const line = output.split('\n').find((l) => l.includes(substring));
    if (!line) return null;
    const m = line.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };
  const total = grab('Total tickets');
  const found = grab('Found in ADO');
  const failures = grab('Has failures');
  const passRateMatch = output.match(/Pass rate\s*:\s*(\d+)%/);
  const passRate = passRateMatch ? parseInt(passRateMatch[1], 10) : null;

  if (total === null && found === null) return null;
  return { total, found, failures, passRate };
}

const VerifyTab = ({ adoProjects, isLoadingProjects }) => {
  const [verifyMode, setVerifyMode] = useState(VERIFY_MODES[0]);
  const [projectKey, setProjectKey] = useState('');
  const [jiraKeys, setJiraKeys] = useState('');
  const [jiraFilterId, setJiraFilterId] = useState('');
  const [verifyProject, setVerifyProject] = useState(null);

  const [verifyStatus, setVerifyStatus] = useState('idle'); // idle | starting | queued | running | completed | warning | failed
  const [verifyJobId, setVerifyJobId] = useState(null);
  const [verifyOutput, setVerifyOutput] = useState('');
  const [verifyError, setVerifyError] = useState('');

  // ── Poll while job is running ─────────────────────────────────────────────
  useEffect(() => {
    if (!verifyJobId || TERMINAL.has(verifyStatus)) return;

    const interval = setInterval(async () => {
      try {
        const result = await invoke('pollJobStatus', { jobId: verifyJobId });
        if (result.status) setVerifyStatus(result.status);
        if (result.output) setVerifyOutput(result.output);
        if (result.error_summary && TERMINAL.has(result.status)) {
          setVerifyError(result.error_summary);
        }
      } catch (_) {
        // ignore transient errors; keep polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [verifyJobId, verifyStatus]);

  // ── Start the verification job ────────────────────────────────────────────
  const handleRun = async () => {
    setVerifyStatus('starting');
    setVerifyJobId(null);
    setVerifyOutput('');
    setVerifyError('');

    const payload = {
      jiraInstance: 'pwnkmrshah',
      adoProject: verifyProject?.label,
    };

    if (verifyMode.value === 'project') payload.projectKey = projectKey.trim();
    if (verifyMode.value === 'keys') payload.jiraKeys = jiraKeys.trim();
    if (verifyMode.value === 'filter') payload.jiraFilterId = jiraFilterId.trim();

    try {
      const result = await invoke('startVerification', payload);

      if (result.error) {
        setVerifyStatus('failed');
        setVerifyError(result.error);
        return;
      }

      setVerifyJobId(result.jobId);
      setVerifyStatus(result.status || 'queued');
    } catch (err) {
      setVerifyStatus('failed');
      setVerifyError('Unexpected error starting verification');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isRunning = ['starting', 'queued', 'running'].includes(verifyStatus);
  const isDone = verifyStatus === 'completed' || verifyStatus === 'warning';
  const summary = isDone ? parseSummary(verifyOutput) : null;
  const hasIssues = summary && (summary.failures > 0 || (summary.found !== null && summary.total !== null && summary.found < summary.total));

  const statusLabel = {
    starting: 'Starting verification…',
    queued: 'Queued — waiting for worker…',
    running: 'Verifying migrated cards field-by-field…',
  }[verifyStatus] || '';

  // Last 4 output lines for live log
  const recentOutput = verifyOutput
    ? verifyOutput.split('\n').filter(Boolean).slice(-4).join('\n')
    : '';

  // ── Is the Run button disabled? ───────────────────────────────────────────
  const sourceValue =
    verifyMode.value === 'project' ? projectKey :
    verifyMode.value === 'keys' ? jiraKeys :
    jiraFilterId;
  const isDisabled = isRunning || !verifyProject || !sourceValue.trim();

  return (
    <Stack space="space.300">
      {/* ── Source mode selector ── */}
      <Stack space="space.100">
        <Label labelFor="verify-mode">Verify cards from *</Label>
        <Select
          inputId="verify-mode"
          options={VERIFY_MODES}
          value={verifyMode}
          onChange={(opt) => setVerifyMode(opt)}
        />
      </Stack>

      {/* ── Conditional source field ── */}
      {verifyMode.value === 'project' && (
        <Stack space="space.100">
          <Label labelFor="verify-project-key">Jira Project Key *</Label>
          <Textfield
            id="verify-project-key"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            placeholder="e.g. OP, SUST, INDT"
          />
        </Stack>
      )}

      {verifyMode.value === 'keys' && (
        <Stack space="space.100">
          <Label labelFor="verify-jira-keys">Jira Keys (comma-separated) *</Label>
          <Textfield
            id="verify-jira-keys"
            value={jiraKeys}
            onChange={(e) => setJiraKeys(e.target.value)}
            placeholder="e.g. OP-1, OP-2, OP-3"
          />
        </Stack>
      )}

      {verifyMode.value === 'filter' && (
        <Stack space="space.100">
          <Label labelFor="verify-filter-id">Jira Filter ID *</Label>
          <Textfield
            id="verify-filter-id"
            value={jiraFilterId}
            onChange={(e) => setJiraFilterId(e.target.value)}
            placeholder="e.g. 11657"
          />
        </Stack>
      )}

      {/* ── ADO Project ── */}
      <Stack space="space.100">
        <Label labelFor="verify-ado-project">ADO Project *</Label>
        {isLoadingProjects ? (
          <Spinner size="small" />
        ) : (
          <Select
            inputId="verify-ado-project"
            options={adoProjects}
            onChange={(opt) => setVerifyProject(opt)}
            placeholder="Select ADO project…"
          />
        )}
      </Stack>

      {/* ── Running spinner + live log ── */}
      {isRunning && (
        <Stack space="space.100">
          <Stack space="space.050">
            <Spinner size="small" />
            <Text>{statusLabel}</Text>
          </Stack>
          {recentOutput ? <Text>{recentOutput}</Text> : null}
        </Stack>
      )}

      {/* ── Results summary ── */}
      {isDone && summary && (
        <SectionMessage appearance={hasIssues ? 'warning' : 'success'}>
          <Text>Verification Complete</Text>
          {summary.total !== null && <Text>Total tickets checked: {summary.total}</Text>}
          {summary.found !== null && <Text>Found in ADO: {summary.found}</Text>}
          {summary.failures !== null && <Text>Field failures: {summary.failures}</Text>}
          {summary.passRate !== null && <Text>Pass rate: {summary.passRate}%</Text>}
        </SectionMessage>
      )}

      {/* ── Completed but summary not parsed (show raw tail) ── */}
      {isDone && !summary && recentOutput && (
        <SectionMessage appearance="success">
          <Text>Verification complete</Text>
          <Text>{recentOutput}</Text>
        </SectionMessage>
      )}

      {/* ── Error ── */}
      {verifyStatus === 'failed' && (
        <SectionMessage appearance="error">
          <Text>{verifyError || 'Verification failed. Check Flask logs for details.'}</Text>
        </SectionMessage>
      )}

      {/* ── Run button ── */}
      <Button
        appearance="primary"
        onClick={handleRun}
        isDisabled={isDisabled}
      >
        {isRunning ? 'Verifying…' : 'Run Verification'}
      </Button>
    </Stack>
  );
};

export default VerifyTab;
