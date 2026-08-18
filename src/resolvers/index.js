import Resolver from '@forge/resolver';
import { kvs as storage } from '@forge/kvs';

const resolver = new Resolver();

// ─── Credential Management ────────────────────────────────────────────────────

// Saves Jira + ADO credentials. Non-sensitive values go to storage, tokens to secret store.
resolver.define('saveCredentials', async ({ payload }) => {
  const { jiraUrl, jiraEmail, jiraToken, adoOrg, adoPat } = payload || {};

  if (!jiraUrl || !jiraEmail || !jiraToken || !adoOrg || !adoPat) {
    return { success: false, error: 'All fields are required' };
  }

  try {
    await Promise.all([
      storage.set('jira_url', jiraUrl.trim().replace(/\/$/, '')),
      storage.set('jira_email', jiraEmail.trim()),
      storage.setSecret('jira_token', jiraToken.trim()),
      storage.set('ado_org', adoOrg.trim()),
      storage.setSecret('ado_pat', adoPat.trim()),
    ]);
    return { success: true };
  } catch (err) {
    return { success: false, error: `Failed to save credentials: ${err.message}` };
  }
});

// Returns metadata only (no secrets) so the UI can show connected accounts.
resolver.define('loadCredentialsMeta', async () => {
  try {
    const [jiraUrl, jiraEmail, adoOrg] = await Promise.all([
      storage.get('jira_url'),
      storage.get('jira_email'),
      storage.get('ado_org'),
    ]);
    const hasJira = !!(jiraUrl && jiraEmail);
    const hasAdo = !!adoOrg;
    return { hasCredentials: hasJira && hasAdo, jiraUrl, jiraEmail, adoOrg };
  } catch {
    return { hasCredentials: false };
  }
});

// Deletes all stored credentials.
resolver.define('deleteCredentials', async () => {
  try {
    await Promise.all([
      storage.delete('jira_url'),
      storage.delete('jira_email'),
      storage.deleteSecret('jira_token'),
      storage.delete('ado_org'),
      storage.deleteSecret('ado_pat'),
    ]);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Tests Jira connectivity using provided credentials (or stored ones if not provided).
resolver.define('testJiraConnection', async ({ payload }) => {
  try {
    const url   = payload?.jiraUrl   || await storage.get('jira_url');
    const email = payload?.jiraEmail || await storage.get('jira_email');
    const token = payload?.jiraToken || await storage.getSecret('jira_token');

    if (!url || !email || !token) return { success: false, error: 'Credentials missing' };

    const creds = Buffer.from(`${email}:${token}`).toString('base64');
    const res = await fetch(`${url}/rest/api/3/myself`, {
      headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' },
    });

    if (!res.ok) return { success: false, error: `Jira returned HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, displayName: data.displayName, accountId: data.accountId };
  } catch (err) {
    return { success: false, error: `Could not reach Jira: ${err.message}` };
  }
});

// Tests ADO connectivity using provided credentials (or stored ones if not provided).
resolver.define('testAdoConnection', async ({ payload }) => {
  try {
    const org = payload?.adoOrg || await storage.get('ado_org');
    const pat = payload?.adoPat || await storage.getSecret('ado_pat');

    if (!org || !pat) return { success: false, error: 'Credentials missing' };

    const creds = Buffer.from(`:${pat}`).toString('base64');
    const res = await fetch(`https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?api-version=7.0`, {
      headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' },
    });

    if (!res.ok) return { success: false, error: `ADO returned HTTP ${res.status}` };
    const data = await res.json();
    return { success: true, projectCount: data.count };
  } catch (err) {
    return { success: false, error: `Could not reach Azure DevOps: ${err.message}` };
  }
});

// ─── Existing resolvers ───────────────────────────────────────────────────────


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

// Fetches boards for a specific ADO project using stored credentials (direct ADO API call).
resolver.define('getAdoBoards', async ({ payload }) => {
  const projectName = payload?.projectName || '';
  if (!projectName) return { boards: [], error: 'projectName is required' };

  try {
    const org = await storage.get('ado_org');
    const pat = await storage.getSecret('ado_pat');
    if (!org || !pat) return { boards: [], error: 'ADO credentials not configured — complete setup first' };

    const creds = Buffer.from(`:${pat}`).toString('base64');
    const res = await fetch(
      `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/_apis/work/boards?api-version=7.0`,
      { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) return { boards: [], error: `ADO returned HTTP ${res.status}` };
    const data = await res.json();
    return { boards: (data.value || []).map(b => ({ id: b.id, name: b.name })) };
  } catch (err) {
    return { boards: [], error: `Could not fetch ADO boards: ${err.message}` };
  }
});

// Fetches Jira projects using stored credentials (direct Jira API call, no Flask needed).
resolver.define('getJiraProjects', async () => {
  try {
    const [jiraUrl, jiraEmail, jiraToken] = await Promise.all([
      storage.get('jira_url'),
      storage.get('jira_email'),
      storage.getSecret('jira_token'),
    ]);
    if (!jiraUrl || !jiraEmail || !jiraToken)
      return { projects: [], error: 'Jira credentials not configured — complete setup first' };

    const creds = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const res = await fetch(
      `${jiraUrl.replace(/\/$/, '')}/rest/api/3/project/search?maxResults=100&orderBy=name`,
      { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) return { projects: [], error: `Jira returned HTTP ${res.status}` };
    const data = await res.json();
    return { projects: (data.values || []).map(p => ({ key: p.key, name: p.name })) };
  } catch (err) {
    return { projects: [], error: `Could not fetch Jira projects: ${err.message}` };
  }
});

// Returns the current user's saved Jira filters (used for scope = 'filter' in AI wizard).
resolver.define('getJiraFilters', async ({ payload }) => {
  try {
    const [jiraUrl, jiraEmail, jiraToken] = await Promise.all([
      storage.get('jira_url'),
      storage.get('jira_email'),
      storage.getSecret('jira_token'),
    ]);
    if (!jiraUrl || !jiraEmail || !jiraToken) return { filters: [] };

    const creds = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const res = await fetch(
      `${jiraUrl.replace(/\/$/, '')}/rest/api/3/filter/my?expand=jql&maxResults=50`,
      { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) return { filters: [] };
    const data = await res.json();
    return { filters: (data || []).map(f => ({ id: f.id, name: f.name, jql: f.jql })) };
  } catch (err) {
    return { filters: [], error: err.message };
  }
});

// Fetches Jira boards (Agile API) — each board has id, name, type, projectKey.
resolver.define('getJiraBoards', async () => {
  try {
    const [jiraUrl, jiraEmail, jiraToken] = await Promise.all([
      storage.get('jira_url'),
      storage.get('jira_email'),
      storage.getSecret('jira_token'),
    ]);
    if (!jiraUrl || !jiraEmail || !jiraToken)
      return { boards: [], error: 'Jira credentials not configured' };

    const creds = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const headers = { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' };
    const base = jiraUrl.replace(/\/$/, '');

    // Try agile boards API first (Scrum/Kanban boards)
    const res = await fetch(
      `${base}/rest/agile/1.0/board?maxResults=50&orderBy=name&expand=location`,
      { headers }
    );

    if (res.ok) {
      const data = await res.json();
      const boards = (data.values || []).map(b => ({
        id: b.id,
        name: b.name,
        type: b.type,
        projectKey: b.location?.projectKey || '',
        projectName: b.location?.projectName || b.name,
      })).filter(b => b.projectKey); // only include boards with a known project key

      if (boards.length > 0) return { boards };
    }

    // Fallback: use Jira projects as board equivalents
    const projRes = await fetch(
      `${base}/rest/api/3/project/search?maxResults=50&orderBy=name`,
      { headers }
    );
    if (!projRes.ok) return { boards: [], error: `Jira returned HTTP ${projRes.status}` };
    const projData = await projRes.json();
    const boards = (projData.values || []).map(p => ({
      id: p.id,
      name: p.name,
      type: 'project',
      projectKey: p.key,
      projectName: p.name,
    }));
    return { boards, _source: 'projects' };
  } catch (err) {
    return { boards: [], error: `Could not fetch boards: ${err.message}` };
  }
});

// Fetches all statuses used in a Jira project, deduplicated across issue types.
resolver.define('getJiraBoardStatuses', async ({ payload }) => {
  try {
    const [jiraUrl, jiraEmail, jiraToken] = await Promise.all([
      storage.get('jira_url'),
      storage.get('jira_email'),
      storage.getSecret('jira_token'),
    ]);
    const projectKey = payload?.projectKey;
    if (!jiraUrl || !jiraEmail || !jiraToken || !projectKey)
      return { statuses: [] };

    const creds = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const res = await fetch(
      `${jiraUrl.replace(/\/$/, '')}/rest/api/3/project/${projectKey}/statuses`,
      { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) return { statuses: [] };
    const data = await res.json();

    // Flatten + deduplicate statuses across all issue types
    const seen = new Set();
    const statuses = [];
    for (const issueType of (data || [])) {
      for (const s of (issueType.statuses || [])) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          statuses.push({ id: s.id, name: s.name, category: s.statusCategory?.name || '' });
        }
      }
    }
    return { statuses };
  } catch (err) {
    return { statuses: [] };
  }
});

// Fetches the list of ADO projects using stored credentials (direct ADO API call, no Flask needed).
resolver.define('getAdoProjects', async () => {
  try {
    const org = await storage.get('ado_org');
    const pat = await storage.getSecret('ado_pat');
    if (!org || !pat) return { projects: [], error: 'ADO credentials not configured — complete setup first' };

    const creds = Buffer.from(`:${pat}`).toString('base64');
    const res = await fetch(
      `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects?api-version=7.0&$top=100`,
      { headers: { 'Authorization': `Basic ${creds}`, 'Accept': 'application/json' } }
    );
    if (!res.ok) return { projects: [], error: `ADO returned HTTP ${res.status}` };
    const data = await res.json();
    return { projects: (data.value || []).map(p => ({ id: p.id, name: p.name })) };
  } catch (err) {
    return { projects: [], error: `Could not fetch ADO projects: ${err.message}` };
  }
});

// POSTs to /migrate with stored credentials forwarded to Flask for subprocess injection.
resolver.define('startMigration', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };

  // Read stored credentials — forwarded to Flask which injects them as env vars
  const [jiraUrl, jiraEmail, jiraToken, adoOrg, adoPat] = await Promise.all([
    storage.get('jira_url'),
    storage.get('jira_email'),
    storage.getSecret('jira_token'),
    storage.get('ado_org'),
    storage.getSecret('ado_pat'),
  ]);

  const body = {
    jira_url:         jiraUrl || '',
    jira_email:       jiraEmail || '',
    jira_token:       jiraToken || '',
    ado_org:          adoOrg || '',
    ado_pat:          adoPat || '',
    ado_project:      payload?.adoProject || '',
    jira_filter:      payload?.jiraFilterId || '',
    jira_keys:        payload?.jiraKeys || '',
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

resolver.define('runGapAnalysis', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };

  const body = {
    jira_instance: payload?.jiraInstance || 'pwnkmrshah',
    jira_filter: payload?.jiraFilterId || '',
    ado_project: payload?.adoProject || '',
    ado_board: payload?.adoBoard || '',
  };

  if (!body.jira_filter) return { error: 'Jira Filter ID is required' };
  if (!body.ado_board) return { error: 'ADO Board is required' };

  try {
    const res = await fetch(`${apiUrl}/gaps`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `Gap analysis API returned HTTP ${res.status}` };
    const data = await res.json();
    return { jobId: data.job_id, status: data.status };
  } catch (err) {
    return { error: `Could not start gap analysis: ${err.message}` };
  }
});

// POSTs to /verify and returns { jobId, status } immediately (job runs async on the server).
resolver.define('startVerification', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };

  const body = {
    jira_instance: payload?.jiraInstance || 'pwnkmrshah',
    ado_project: payload?.adoProject || '',
    project_key: payload?.projectKey || '',
    jira_keys: payload?.jiraKeys || '',
    jira_filter: payload?.jiraFilterId || '',
  };

  if (!body.project_key && !body.jira_keys && !body.jira_filter) {
    return { error: 'Provide a Project Key, specific Jira Keys, or a Filter ID' };
  }

  try {
    const res = await fetch(`${apiUrl}/verify`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: `Verify API returned HTTP ${res.status}` };
    const data = await res.json();
    return { jobId: data.job_id, status: data.status };
  } catch (err) {
    return { error: `Could not start verification: ${err.message}` };
  }
});

// Mock analysis data used as fallback when Flask /analyze isn't available yet
const MOCK_ANALYSIS = {
  total_issues: 253,
  by_type: [
    { name: 'Story', count: 120 },
    { name: 'Bug', count: 67 },
    { name: 'Task', count: 19 },
    { name: 'Technical Debt', count: 47 },
  ],
  by_status: [
    { name: 'In Progress', count: 89 },
    { name: 'Done', count: 121 },
    { name: 'To Do', count: 43 },
  ],
  ado_available_types: ['User Story', 'Task', 'Bug', 'Feature', 'Epic'],
  type_gaps: [{ jira_type: 'Technical Debt', has_ado_match: false }],
  user_gaps: [],
  attachment_count: 89,
  comment_count: 412,
  _mock: true,
};

// Calls OpenAI to generate type mappings + risk summary from the analysis result.
resolver.define('runAIPlan', async ({ payload }) => {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) return { error: 'OPENAI_API_KEY not configured — run: forge variables set --environment development OPENAI_API_KEY <key>' };

  const { byType = [], adoTypes = [], userGaps = [], adoProject = '' } = payload || {};

  const prompt = `You are a migration advisor helping move Jira issues to Azure DevOps.

Jira issue types in use (with counts):
${JSON.stringify(byType, null, 2)}

Azure DevOps project "${adoProject}" supports these work item types:
${JSON.stringify(adoTypes)}

${userGaps.length > 0 ? `Users not found in ADO (will be preserved in card description): ${userGaps.map(u => u.jira_user || u).join(', ')}` : ''}

Task: For each Jira type, recommend the best ADO work item type from the available list.

Return ONLY a valid JSON array with no extra text, markdown or explanation:
[{"jira":"Story","ado":"User Story","confidence":96,"reason":"Direct semantic equivalent — same concept in both systems"}]

Rules:
- confidence 90-100: exact or industry-standard match
- confidence 75-89: reasonable match with minor differences  
- confidence 60-74: closest available type, review recommended
- confidence below 60: no clear match, human decision required
- Only use types from the ADO available list above`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: `OpenAI returned HTTP ${res.status}: ${err?.error?.message || 'unknown error'}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '[]';

    // Strip markdown code fences if the model wraps in ```json
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const mappings = JSON.parse(cleaned);

    return { type_mappings: mappings };
  } catch (err) {
    return { error: `AI mapping failed: ${err.message}` };
  }
});

// Calls Flask /analyze with credentials; falls back to mock data for demo purposes.
resolver.define('runAnalysis', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  const [jiraUrl, jiraEmail, jiraToken, adoOrg, adoPat] = await Promise.all([
    storage.get('jira_url'),
    storage.get('jira_email'),
    storage.getSecret('jira_token'),
    storage.get('ado_org'),
    storage.getSecret('ado_pat'),
  ]);

  if (!apiUrl) return { ...MOCK_ANALYSIS, _note: 'MIGRATION_API_URL not set — showing mock data' };

  try {
    const res = await fetch(`${apiUrl}/analyze`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ado_project:       payload?.adoProject || '',
        jira_project_key:  payload?.jiraProjectKey || '',
        status_filter:     payload?.statusFilter || [],   // [] = all statuses
        field_filter:      payload?.fieldFilter || [],    // [] = all fields
        jira_url:          jiraUrl || '',
        jira_email:        jiraEmail || '',
        jira_token:        jiraToken || '',
        ado_org:           adoOrg || '',
        ado_pat:           adoPat || '',
      }),
    });

    if (!res.ok) {
      // Propagate real errors so the UI can display them clearly
      try {
        const errBody = await res.json();
        return { error: errBody.error || `Analysis failed (HTTP ${res.status})` };
      } catch {
        return { error: `Analysis failed (HTTP ${res.status})` };
      }
    }

    return await res.json();
  } catch (err) {
    return { error: `Could not reach the migration server. Is it running? (${err.message})` };
  }
});

// Receives the approved migration plan and triggers the existing /migrate endpoint.
resolver.define('approveMigrationPlan', async ({ payload }) => {
  const apiUrl = process.env.MIGRATION_API_URL;
  const apiKey = process.env.MIGRATION_API_KEY || '';

  if (!apiUrl) return { error: 'MIGRATION_API_URL not configured' };

  const [jiraUrl, jiraEmail, jiraToken, adoOrg, adoPat] = await Promise.all([
    storage.get('jira_url'),
    storage.get('jira_email'),
    storage.getSecret('jira_token'),
    storage.get('ado_org'),
    storage.getSecret('ado_pat'),
  ]);

  try {
    const res = await fetch(`${apiUrl}/migrate`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jira_url:   jiraUrl,
        jira_email: jiraEmail,
        jira_token: jiraToken,
        ado_org:    adoOrg,
        ado_pat:    adoPat,
        ado_project: payload?.adoProject || '',
        jql:         payload?.jql || '',
        field_filter: payload?.field_filter || [],
        skip_attachments: payload?.skipAttachments || false,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || `Migration API returned HTTP ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    return { error: `Could not start migration: ${err.message}` };
  }
});

export const handler = resolver.getDefinitions();
