'use client';

import { useState } from 'react';
import { loadAllSubmissions } from '@/app/actions';
import SubmissionTable from './SubmissionTable';
import SyncControls from './SyncControls';

export default function SubmissionsContainer({ initialSubmissions, initialTimestamp, initialLastFetchedTimestamp, initialError, initialStatusCounts }) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [timestamp, setTimestamp] = useState(initialTimestamp);
  const [lastFetchedTimestamp, setLastFetchedTimestamp] = useState(initialLastFetchedTimestamp);
  const [error, setError] = useState(initialError);
  const [statusCounts, setStatusCounts] = useState(initialStatusCounts || { total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [activeStatus, setActiveStatus] = useState('all'); // Track active status filter

  // Load submission data with optional loading state
  const loadData = async () => {
    try {
      setIsLoading(true);
      const newData = await loadAllSubmissions();
      setSubmissions(newData.submissions);
      setTimestamp(newData.timestamp);
      
      // Always update the lastFetchedTimestamp from the database
      // This will automatically reflect the latest jotform record creation time
      setLastFetchedTimestamp(newData.lastFetchedTimestamp);
      
      setStatusCounts(newData.statusCounts || { total: 0 });
      setError(newData.error);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  // Handle sync completion
  const handleSyncComplete = async (action, result) => {
    // Refresh the data after specific sync operations
    if (['fetch', 'fetch-shopify-data', 'clean-titles', 'generate-specifications'].includes(action)) {
      await loadData();
      
      // Only update the status filter if all submissions in the previous state were processed
      // Check if there are still submissions in the current filter state
      const currentFilterStatus = activeStatus !== 'all' ? activeStatus : null;
      
      // Determine the source status for this action
      let sourceStatus = null;
      let targetStatus = null;
      
      switch (action) {
        case 'fetch':
          // No source status for fetch (new submissions)
          targetStatus = 'fetched';
          break;
        case 'clean-titles':
          sourceStatus = 'fetched';
          targetStatus = 'title_cleaned';
          break;
        case 'fetch-shopify-data':
          sourceStatus = 'title_cleaned';
          targetStatus = 'shopify_mapped';
          break;
        case 'generate-specifications':
          sourceStatus = 'shopify_mapped';
          targetStatus = 'specification_generated';
          break;
      }
      
      // Only change the filter status if:
      // 1. We're viewing the source status of the action that was just completed
      // 2. There are no more submissions in that status (they were all processed)
      // 3. Or if we're viewing 'all' submissions
      if (
        (currentFilterStatus === sourceStatus && statusCounts[sourceStatus] === 0) ||
        (currentFilterStatus === 'all') ||
        (currentFilterStatus === null && action === 'fetch')
      ) {
        setActiveStatus(targetStatus);
      }
    }
  };
  
  // Handle status filter changes from the table component
  const handleStatusChange = (newStatus) => {
    setActiveStatus(newStatus);
  };

  return (
    <div className="w-full space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2 text-gray-100">Jotform to Spec Builder Sync</h1>
        <p className="text-gray-400 mb-4">Convert Jotform submissions to Spec Builder specifications</p>
        
        {/* Sync Controls */}
        <SyncControls 
          onSyncComplete={handleSyncComplete} 
          statusCounts={statusCounts} 
        />
        
        {/* Submissions Table */}
        <SubmissionTable 
          submissions={submissions} 
          statusCounts={statusCounts}
          timestamp={timestamp}
          lastFetchedTimestamp={lastFetchedTimestamp} 
          error={error}
          activeStatus={activeStatus}
          onStatusChange={handleStatusChange}
          onRefresh={loadData}
        />
      </div>
      

    </div>
  );
}
