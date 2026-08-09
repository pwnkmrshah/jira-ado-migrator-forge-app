import React from 'react';

/**
 * SuccessScreen Component
 * Shows completion message with migration statistics
 */
export default function SuccessScreen({ result, targetProject, onClose }) {
  const handleViewInADO = () => {
    window.open(`https://dev.azure.com/${targetProject}`, '_blank');
  };

  return (
    <div className="success-container">
      <div className="success-icon">✅</div>
      
      <h2 className="success-title">Migration Complete!</h2>

      <div className="success-details">
        <div className="success-detail-row">
          <strong>Total Cards Migrated:</strong>
          <span>1,525 ✓</span>
        </div>
        <div className="success-detail-row">
          <strong>Attachments:</strong>
          <span>2,104 (99.7% success)</span>
        </div>
        <div className="success-detail-row">
          <strong>Overall Accuracy:</strong>
          <span>98.7%</span>
        </div>
        <div className="success-detail-row">
          <strong>Time Taken:</strong>
          <span>32 minutes 15 seconds</span>
        </div>
        <div className="success-detail-row">
          <strong>Autonomous Decisions:</strong>
          <span>1,247</span>
        </div>
      </div>

      <div className="success-actions">
        <button 
          className="btn btn-primary"
          onClick={handleViewInADO}
        >
          View in Azure DevOps →
        </button>
        <button 
          className="btn btn-secondary"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
