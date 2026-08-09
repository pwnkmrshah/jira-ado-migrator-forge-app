import Resolver from '@forge/resolver';

const resolver = new Resolver();

// Called by the frontend via invoke('checkConnection') when user clicks Migrate to ADO.
// Hits the local Flask API bridge (api_server.py) via the ngrok tunnel.
resolver.define('checkConnection', async () => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) {
    return {
      connected: false,
      message:
        'MIGRATION_API_URL not configured. Run: forge variables set --environment development MIGRATION_API_URL https://your-ngrok-id.ngrok-free.app',
    };
  }

  try {
    const res = await fetch(`${apiUrl}/ping`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!res.ok) {
      return { connected: false, message: `Python engine returned HTTP ${res.status}` };
    }

    const data = await res.json();
    return { connected: true, message: data.message || 'Connected to Python engine' };
  } catch (err) {
    return { connected: false, message: `Could not reach Python engine: ${err.message}` };
  }
});

// Fetches boards for a specific ADO project (called when user changes project dropdown).
resolver.define('getAdoBoards', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';
  const projectName = payload?.projectName || '';

  if (!apiUrl) return { boards: [], error: 'MIGRATION_API_URL not configured' };
  if (!projectName) return { boards: [], error: 'projectName is required' };

  try {
    const res = await fetch(
      `${apiUrl}/ado-boards?project=${encodeURIComponent(projectName)}`,
      { headers: { 'X-API-Key': apiKey } }
    );
    if (!res.ok) return { boards: [], error: `ADO boards API returned HTTP ${res.status}` };
    const data = await res.json();
    return { boards: data.boards || [] };
  } catch (err) {
    return { boards: [], error: `Could not fetch ADO boards: ${err.message}` };
  }
});

// Fetches the list of ADO projects for the target organisation dropdown.
resolver.define('getAdoProjects', async () => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) {
    return { projects: [], error: 'MIGRATION_API_URL not configured' };
  }

  try {
    const res = await fetch(`${apiUrl}/ado-projects`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!res.ok) {
      return { projects: [], error: `ADO API returned HTTP ${res.status}` };
    }

    const data = await res.json();
    return { projects: data.projects || [] };
  } catch (err) {
    return { projects: [], error: `Could not fetch ADO projects: ${err.message}` };
  }
});

// POSTs to /migrate and returns { jobId, status } immediately (job runs async on the server).
resolver.define('startMigration', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };

  const body = {
    jira_instance: payload?.jiraInstance || 'healthfinch',
    ado_project: payload?.adoProject || '',
    jira_filter: payload?.jiraFilterId || '',
    jira_keys: payload?.jiraKeys || '',
    skip_attachments: payload?.skipAttachments || false,
  };

  if (!body.jira_filter && !body.jira_keys) {
    return { error: 'Provide either a Jira Filter ID or specific Jira Keys' };
  }

  try {
    const res = await fetch(`${apiUrl}/migrate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `Migration API returned HTTP ${res.status}` };
    const data = await res.json();
    return { jobId: data.job_id, status: data.status };
  } catch (err) {
    return { error: `Could not start migration: ${err.message}` };
  }
});

// GETs /status/<jobId> — called on a 5s interval by the frontend while the job runs.
resolver.define('pollJobStatus', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';
  const jobId = payload?.jobId;

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };
  if (!jobId) return { error: 'jobId is required' };

  try {
    const res = await fetch(`${apiUrl}/status/${encodeURIComponent(jobId)}`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (!res.ok) return { error: `Status API returned HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return { error: `Could not poll job status: ${err.message}` };
  }
});

export const handler = resolver.getDefinitions();
