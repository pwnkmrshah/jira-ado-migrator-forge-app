/**
 * GapAnalysisTab — "Rails partial" for the Gap Analysis section.
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

/**
 * Parse the human-readable stdout from migration_gap_analysis.py into counts.
 * The script prints lines like:
 *   ✅  Correctly migrated:                     130  (85%)
 *   ❌  Not found anywhere in ADO:               12  (8%)
 *   ⚠   Wrong area path:                          3  (2%)
 */
function parseGapCounts(output) {
  if (!output) return null;
  const grab = (substring) => {
    const line = output.split('\n').find((l) => l.includes(substring));
    if (!line) return null;
    const m = line.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  };
  return {
    correct: grab('Correctly migrated'),
    missed: grab('Not found anywhere'),
    wrongArea: grab('Wrong area'),
    noArea: grab('no area'),
  };
}

const GapAnalysisTab = ({ adoProjects, isLoadingProjects }) => {
  const [gapFilterId, setGapFilterId] = useState('');
  const [gapProject, setGapProject] = useState(null);
  const [gapBoards, setGapBoards] = useState([]);
  const [gapBoard, setGapBoard] = useState(null);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);

  const [gapStatus, setGapStatus] = useState('idle');   // idle | starting | queued | running | completed | warning | failed
  const [gapJobId, setGapJobId] = useState(null);
  const [gapOutput, setGapOutput] = useState('');
  const [gapError, setGapError] = useState('');

  // ── Cascade: load boards when project changes ─────────────────────────────
  const handleProjectChange = async (option) => {
    setGapProject(option);
    setGapBoard(null);
    setGapBoards([]);
    if (!option) return;

    setIsLoadingBoards(true);
    try {
      const result = await invoke('getAdoBoards', { projectName: option.label });
      if (result.boards?.length) {
        setGapBoards(result.boards.map((b) => ({ label: b.name, value: b.id })));
      }
    } catch (_) {
      // silently ignore — user can retry by re-selecting project
    } finally {
      setIsLoadingBoards(false);
    }
  };

  // ── Poll while job is running ─────────────────────────────────────────────
  useEffect(() => {
    if (!gapJobId || TERMINAL.has(gapStatus)) return;

    const interval = setInterval(async () => {
      try {
        const result = await invoke('pollJobStatus', { jobId: gapJobId });
        if (result.status) setGapStatus(result.status);
        if (result.output) setGapOutput(result.output);
        if (result.error_summary && TERMINAL.has(result.status)) {
          setGapError(result.error_summary);
        }
      } catch (_) {
        // ignore transient errors; keep polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [gapJobId, gapStatus]);

  // ── Start the gap analysis job ────────────────────────────────────────────
  const handleRun = async () => {
    setGapStatus('starting');
    setGapJobId(null);
    setGapOutput('');
    setGapError('');

    try {
      const result = await invoke('runGapAnalysis', {
        jiraInstance: 'pwnkmrshah',
        jiraFilterId: gapFilterId.trim(),
        adoProject: gapProject?.label,
        adoBoard: gapBoard?.label,
      });

      if (result.error) {
        setGapStatus('failed');
        setGapError(result.error);
        return;
      }

      setGapJobId(result.jobId);
      setGapStatus(result.status || 'queued');
    } catch (err) {
      setGapStatus('failed');
      setGapError('Unexpected error starting gap analysis');
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const isRunning = ['starting', 'queued', 'running'].includes(gapStatus);
  const isDone = gapStatus === 'completed' || gapStatus === 'warning';
  const counts = isDone ? parseGapCounts(gapOutput) : null;
  const hasProblems = counts && (counts.missed > 0 || counts.wrongArea > 0);

  const statusLabel = {
    starting: 'Starting gap analysis…',
    queued: 'Queued — waiting for worker…',
    running: 'Comparing Jira filter vs ADO board…',
  }[gapStatus] || '';

  // Last 4 output lines for live log
  const recentOutput = gapOutput
    ? gapOutput.split('\n').filter(Boolean).slice(-4).join('\n')
    : '';

  return (
    <Stack space="space.300">
      {/* ── Form fields ── */}
      <Stack space="space.100">
        <Label labelFor="gap-filter-id">Jira Filter ID *</Label>
        <Textfield
          id="gap-filter-id"
          value={gapFilterId}
          onChange={(e) => setGapFilterId(e.target.value)}
          placeholder="e.g. 11657"
        />
      </Stack>

      <Stack space="space.100">
        <Label labelFor="gap-ado-project">ADO Project *</Label>
        {isLoadingProjects ? (
          <Spinner size="small" />
        ) : (
          <Select
            inputId="gap-ado-project"
            options={adoProjects}
            onChange={handleProjectChange}
            placeholder="Select ADO project…"
          />
        )}
      </Stack>

      <Stack space="space.100">
        <Label labelFor="gap-ado-board">ADO Board to check *</Label>
        {isLoadingBoards ? (
          <Spinner size="small" />
        ) : (
          <Select
            inputId="gap-ado-board"
            options={gapBoards}
            onChange={(opt) => setGapBoard(opt)}
            placeholder={gapProject ? 'Select ADO board…' : 'Select a project first'}
            isDisabled={!gapProject || isLoadingBoards}
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
          {recentOutput ? (
            <Text>{recentOutput}</Text>
          ) : null}
        </Stack>
      )}

      {/* ── Results summary ── */}
      {isDone && counts && (
        <SectionMessage appearance={hasProblems ? 'warning' : 'success'}>
          <Text>Gap Analysis Complete</Text>
          {counts.correct !== null && <Text>Correctly migrated: {counts.correct}</Text>}
          {counts.missed !== null && <Text>Not yet in ADO (missed): {counts.missed}</Text>}
          {counts.wrongArea !== null && <Text>Wrong area path: {counts.wrongArea}</Text>}
          {counts.noArea !== null && <Text>No area path set: {counts.noArea}</Text>}
        </SectionMessage>
      )}

      {/* ── Completed but no counts parsed (show raw tail) ── */}
      {isDone && !counts && recentOutput && (
        <SectionMessage appearance="success">
          <Text>Analysis complete</Text>
          <Text>{recentOutput}</Text>
        </SectionMessage>
      )}

      {/* ── Error ── */}
      {gapStatus === 'failed' && (
        <SectionMessage appearance="error">
          <Text>{gapError || 'Gap analysis failed. Check Flask logs for details.'}</Text>
        </SectionMessage>
      )}

      {/* ── Run button ── */}
      <Button
        appearance="primary"
        onClick={handleRun}
        isDisabled={isRunning || !gapProject || !gapBoard || !gapFilterId.trim()}
      >
        {isRunning ? 'Analysing…' : 'Run Gap Analysis'}
      </Button>
    </Stack>
  );
};

export default GapAnalysisTab;
