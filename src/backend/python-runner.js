/**
 * Python CLI Runner
 * Executes the Python migration script and handles responses
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run Python migration script
 * @param {Object} params - Migration parameters
 * @param {string} params.jiraBoard - Jira board ID
 * @param {string} params.adoProject - ADO project name
 * @param {Object} params.fieldMappings - Field mappings
 */
export function runPythonMigration(params) {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = process.env.PYTHON_CLI_PATH || 
      path.join(__dirname, '../../../../repos/jira-to-ado/scripts/worker_jira_to_ado_copy.py');
    
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3';
    
    console.log('📍 Python script path:', pythonScriptPath);
    console.log('🐍 Python executable:', pythonExecutable);
    
    const args = [
      pythonScriptPath,
      '--jira-board', params.jiraBoard,
      '--ado-project', params.adoProject,
      '--mappings', JSON.stringify(params.fieldMappings)
    ];
    
    console.log('▶️  Running command:', pythonExecutable, args.join(' '));
    
    const python = spawn(pythonExecutable, args);
    
    let stdout = '';
    let stderr = '';
    
    // Capture stdout
    python.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      console.log('✓ [STDOUT]:', output.trim());
      
      // Parse progress updates if any
      if (output.includes('PROGRESS')) {
        const progressMatch = output.match(/PROGRESS:(\d+)/);
        if (progressMatch) {
          console.log('📊 Progress:', progressMatch[1] + '%');
        }
      }
    });
    
    // Capture stderr
    python.stderr.on('data', (data) => {
      const error = data.toString();
      stderr += error;
      console.warn('⚠️  [STDERR]:', error.trim());
    });
    
    // Handle process completion
    python.on('close', (code) => {
      console.log('🏁 Process exit code:', code);
      
      if (code === 0) {
        // Success
        resolve({
          status: 'success',
          stdout,
          stderr,
          exitCode: code,
          message: 'Python script executed successfully'
        });
      } else {
        // Error
        reject(new Error(
          `Python script failed with exit code ${code}.\n` +
          `STDOUT: ${stdout}\n` +
          `STDERR: ${stderr}`
        ));
      }
    });
    
    // Handle spawn errors
    python.on('error', (err) => {
      console.error('❌ Failed to start Python process:', err);
      reject(new Error(`Failed to execute Python script: ${err.message}`));
    });
  });
}

/**
 * Parse migration results from Python output
 */
export function parseMigrationResults(output) {
  const results = {
    cardsProcessed: 0,
    attachmentsProcessed: 0,
    decisions: 0,
    errors: 0,
    accuracy: 0
  };
  
  // Parse specific metrics from output
  const cardsMatch = output.match(/Cards processed: (\d+)/);
  if (cardsMatch) results.cardsProcessed = parseInt(cardsMatch[1]);
  
  const attachmentsMatch = output.match(/Attachments processed: (\d+)/);
  if (attachmentsMatch) results.attachmentsProcessed = parseInt(attachmentsMatch[1]);
  
  const decisionsMatch = output.match(/Decisions made: (\d+)/);
  if (decisionsMatch) results.decisions = parseInt(decisionsMatch[1]);
  
  const accuracyMatch = output.match(/Accuracy: ([\d.]+)%/);
  if (accuracyMatch) results.accuracy = parseFloat(accuracyMatch[1]);
  
  return results;
}
