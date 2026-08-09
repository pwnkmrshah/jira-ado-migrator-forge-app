import React, { useState } from 'react';
import './App.css';
import MigrationForm from './components/MigrationForm';
import ProgressIndicator from './components/ProgressIndicator';
import SuccessScreen from './components/SuccessScreen';

/**
 * Main App component for Jira Forge
 * Manages the migration flow: Form -> Progress -> Success
 */
export default function App() {
  const [currentStep, setCurrentStep] = useState('form'); // 'form' | 'progress' | 'success'
  const [migrationData, setMigrationData] = useState(null);
  const [error, setError] = useState(null);

  const handleFormSubmit = async (formData) => {
    try {
      setMigrationData(formData);
      setCurrentStep('progress');
      setError(null);
      // Progress will be handled by ProgressIndicator component
    } catch (err) {
      setError(err.message);
      setCurrentStep('form');
    }
  };

  const handleMigrationComplete = (result) => {
    setMigrationData({
      ...migrationData,
      result
    });
    setCurrentStep('success');
  };

  const handleMigrationError = (err) => {
    setError(err.message);
    setCurrentStep('form');
  };

  const handleReset = () => {
    setCurrentStep('form');
    setMigrationData(null);
    setError(null);
  };

  return (
    <div className="migration-app">
      <div className="migration-container">
        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            {error}
            <button 
              className="error-close"
              onClick={() => setError(null)}
            >
              ✕
            </button>
          </div>
        )}

        {currentStep === 'form' && (
          <MigrationForm onSubmit={handleFormSubmit} />
        )}

        {currentStep === 'progress' && (
          <ProgressIndicator
            migrationData={migrationData}
            onComplete={handleMigrationComplete}
            onError={handleMigrationError}
          />
        )}

        {currentStep === 'success' && (
          <SuccessScreen
            result={migrationData.result}
            targetProject={migrationData.targetProject}
            onClose={handleReset}
          />
        )}
      </div>
    </div>
  );
}
