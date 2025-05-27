'use client';

import { useState } from 'react';
import FailedSubmissionsModal from './FailedSubmissionsModal';

export default function SyncControls({ onSyncComplete, statusCounts }) {
  const [failedSubmissions, setFailedSubmissions] = useState([]);
  const [isFailureModalOpen, setIsFailureModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState({
    fetch: false,
    'fetch-shopify-data': false,
    'clean-titles': false,
    'generate-specifications': false
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleSyncAction = async (action) => {
    // Reset error and status
    setError('');
    setStatus('');
    
    // Set loading state
    setIsLoading(prev => ({ ...prev, [action]: true }));
    
    try {
      setStatus(removeIcons(`Processing ${getActionLabel(action)}...`));
      
      // Determine the correct API endpoint based on the action
      const endpoint = action === 'generate-specifications' 
        ? '/api/generate-specifications'
        : '/api/sync';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: action === 'generate-specifications' ? '{}' : JSON.stringify({ action }),
      });
      
      let data;
      const contentType = response.headers.get('content-type');
      
      try {
        // Only try to parse as JSON if the content-type is application/json
        data = contentType?.includes('application/json') 
          ? await response.json() 
          : { message: await response.text() };
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Invalid response from server');
      }
      
      if (!response.ok) {
        throw new Error(
          data.message || 
          data.error || 
          `Request failed with status ${response.status}`
        );
      }
      
      // Show success message without icons but with remaining counts
      let successMessage;
      const processedCount = data.processed || data.saved || 0;
      
      // Check for failed submissions
      if (data.failedSubmissions && data.failedSubmissions.length > 0) {
        setFailedSubmissions(data.failedSubmissions);
        setIsFailureModalOpen(true);
      }
      
      // Use custom message if provided, otherwise create one based on counts
      if (data.message) {
        successMessage = data.message;
      } else if (processedCount === 0) {
        successMessage = `No ${getActionLabel(action, false).toLowerCase()} were processed.`;
      } else {
        successMessage = `${getActionLabel(action, true)} ${processedCount} submission${processedCount !== 1 ? 's' : ''} successfully!`;
      }
      
      // Enhance the message with counts of remaining submissions if data is available
      if (data.success && statusCounts) {
        // Determine source and target statuses for this action
        const statusMapping = {
          'fetch': { source: null, target: 'fetched' },
          'clean-titles': { source: 'fetched', target: 'title_cleaned' },
          'fetch-shopify-data': { source: 'title_cleaned', target: 'shopify_mapped' },
          'generate-specifications': { source: 'shopify_mapped', target: 'specification_generated' }
        };
        
        const { source, target } = statusMapping[action] || {};
        
        // If we have a source status and there are submissions remaining in that status
        if (source && statusCounts[source] > 0) {
          successMessage = removeIcons(successMessage);
          if (processedCount > 0) {
            // Some submissions were processed
            successMessage = `Processed ${processedCount} submission${processedCount !== 1 ? 's' : ''}. ${statusCounts[source]} submission${statusCounts[source] !== 1 ? 's' : ''} still remain${statusCounts[source] === 1 ? 's' : ''} in ${getStatusLabel(source)} status.`;
          } else {
            // No submissions were processed
            successMessage = `No submissions were processed. ${statusCounts[source]} submission${statusCounts[source] !== 1 ? 's' : ''} remain${statusCounts[source] === 1 ? 's' : ''} in ${getStatusLabel(source)} status.`;
          }
        }
      }
      
      setStatus(removeIcons(successMessage));
      
      // If we have a callback, call it with the action and result
      if (onSyncComplete) {
        onSyncComplete(action, data);
      }
      
    } catch (err) {
      console.error(`Error during ${action}:`, err);
      setError(removeIcons(err.message) || 'An error occurred while processing your request');
    } finally {
      // Reset loading state
      setIsLoading(prev => ({ ...prev, [action]: false }));
    }
  };
  
  const getActionLabel = (action, pastTense = false) => {
    const labels = {
      fetch: pastTense ? 'Fetched new submissions' : 'Fetch Submissions',
      'fetch-shopify-data': pastTense ? 'Fetched Shopify data' : 'Fetch Shopify Data',
      'clean-titles': pastTense ? 'Cleaned product titles' : 'Clean Product Titles',
      'generate-specifications': pastTense ? 'Generated specifications' : 'Generate Specifications'
    };
    return labels[action] || action;
  };

  // Function to remove emoji icons from status messages
  const removeIcons = (message) => {
    if (!message) return message;
    // Remove common emoji icons used in status messages
    return message
      .replace(/[\u2705\u2714\u2611\u2713]/g, '') // Remove checkmark emojis
      .replace(/[\u26A0\u26A0\uFE0F\u26D4\u274C]/g, '') // Remove warning/error emojis
      .replace(/[\uD83D\uDCE5]/g, '') // Remove inbox emoji
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim(); // Trim extra spaces
  };

  // Get a human-readable label for a status
  const getStatusLabel = (status) => {
    const statusLabels = {
      'fetched': 'Fetched',
      'title_cleaned': 'Title Cleaned',
      'shopify_mapped': 'Shopify Mapped',
      'specification_generated': 'Specification Generated'
    };
    return statusLabels[status] || status;
  };
  
  const getButtonColor = (action) => {
    switch (action) {
      case 'fetch':
        return 'bg-gray-600 hover:bg-gray-700';
      case 'clean-titles':
        return 'bg-blue-600 hover:bg-blue-700';
      case 'fetch-shopify-data':
        return 'bg-green-600 hover:bg-green-700';
      case 'generate-specifications':
        return 'bg-purple-600 hover:bg-purple-700';
      default:
        return 'bg-gray-600 hover:bg-gray-700';
    }
  };

  const syncActions = [
    { action: 'fetch', label: 'Fetch Submissions' },
    { action: 'clean-titles', label: 'Clean Product Titles' },
    { action: 'fetch-shopify-data', label: 'Fetch Shopify Data' },
    { action: 'generate-specifications', label: 'Generate Specifications' },
  ];

  return (
    <div className="mb-6">
      <div className="flex flex-col space-y-2 md:flex-row md:space-y-0 md:space-x-2 mb-4">
        {syncActions.map(({ action, label }) => (
          <button
            key={action}
            className={`px-4 py-2 rounded text-white ${getButtonColor(action)} ${isLoading[action] ? 'opacity-70 cursor-not-allowed' : ''}`}
            onClick={() => handleSyncAction(action)}
            disabled={isLoading[action]}
          >
            {isLoading[action] ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              label
            )}
          </button>
        ))}
      </div>
      {status && <div className="text-sm text-gray-600">{status}</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      
      {/* Failed Submissions Modal */}
      <FailedSubmissionsModal 
        isOpen={isFailureModalOpen}
        onClose={() => setIsFailureModalOpen(false)}
        failedSubmissions={failedSubmissions}
      />
    </div>
  );
}