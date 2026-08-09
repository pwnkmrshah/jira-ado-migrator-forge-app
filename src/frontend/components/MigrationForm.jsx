import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';

/**
 * MigrationForm Component
 * Shows form to select ADO project and displays AI-suggested field mappings
 */
export default function MigrationForm({ onSubmit }) {
  const [adoProject, setAdoProject] = useState('');
  const [fieldMappings, setFieldMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load suggested field mappings on mount
  useEffect(() => {
    const loadMappings = async () => {
      try {
        const mappings = await invoke('getMappings');
        setFieldMappings(mappings);
      } catch (err) {
        setError('Failed to load field mappings: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    loadMappings();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!adoProject) {
      alert('Please select a target ADO project');
      return;
    }

    onSubmit({
      adoProject,
      fieldMappings
    });
  };

  const handleMappingChange = (jiraField, newAdoField) => {
    setFieldMappings({
      ...fieldMappings,
      [jiraField]: newAdoField
    });
  };

  if (loading) {
    return (
      <div className="form-container">
        <div className="loading">
          <span className="spinner"></span>
          Loading field mappings...
        </div>
      </div>
    );
  }

  return (
    <form className="form-container" onSubmit={handleSubmit}>
      <h2 className="form-title">🚀 Migrate Board to Azure DevOps</h2>

      {error && (
        <div className="info-box error">
          ⚠️ {error}
        </div>
      )}

      <div className="info-box">
        ℹ️ This will migrate all cards, attachments, and metadata from this Jira board to Azure DevOps
      </div>

      <div className="form-group">
        <label htmlFor="adoProject">Target Azure DevOps Project *</label>
        <select
          id="adoProject"
          value={adoProject}
          onChange={(e) => setAdoProject(e.target.value)}
          required
        >
          <option value="">-- Select ADO Project --</option>
          <option value="DEV">Development Team (DEV)</option>
          <option value="MKT">Marketing Team (MKT)</option>
          <option value="OPS">Operations Team (OPS)</option>
        </select>
      </div>

      {Object.keys(fieldMappings).length > 0 && (
        <div className="mappings-section">
          <h3 className="mappings-title">🤖 AI-Suggested Field Mappings</h3>
          <div className="mappings-container">
            {Object.entries(fieldMappings).map(([jiraField, adoField]) => (
              <div key={jiraField} className="mapping-item">
                <div className="mapping-content">
                  <div className="mapping-from">{jiraField}</div>
                  <div className="mapping-arrow">→</div>
                  <div className="mapping-to">{adoField}</div>
                </div>
                <div className="mapping-confidence">✓ 99%</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-footer">
        <button type="reset" className="btn btn-secondary">
          Reset
        </button>
        <button type="submit" className="btn btn-primary" disabled={!adoProject}>
          Start Migration
        </button>
      </div>
    </form>
  );
}
