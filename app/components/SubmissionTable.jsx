'use client';

import { STATUS } from '@/lib/submission-status';
import { useEffect, useMemo, useState } from 'react';
import ReplayButton from '@/app/components/ReplayButton';
import StatusBadge from '@/app/components/StatusBadge';
import SpecificationButton from '@/app/components/SpecificationButton';

/**
 * Table component to display submissions
 */

export default function SubmissionTable({ submissions, statusCounts, timestamp, lastFetchedTimestamp, error, activeStatus, onStatusChange, onRefresh }) {
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  // Use activeStatus from props if provided, otherwise default to 'all'
  const [statusFilter, setStatusFilterInternal] = useState(activeStatus || 'all');

  // Wrapper function for status filter changes
  const setStatusFilter = (newStatus) => {
    setStatusFilterInternal(newStatus);
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  };

  // Update internal state when activeStatus prop changes
  useEffect(() => {
    if (activeStatus && activeStatus !== statusFilter) {
      setStatusFilterInternal(activeStatus);
    }
  }, [activeStatus, statusFilter]);

  const handleSort = (field) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };



  // Filter and match search query
  const filteredSubmissions = useMemo(() => {
    if (!submissions) return [];

    // Create a fresh copy of the submissions array
    let filtered = [...submissions];

    // Apply status filter
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter(submission => {
        // Handle null/undefined status values by treating them as 'fetched'
        const status = submission.status || STATUS.FETCHED;
        return status === statusFilter;
      });
    }
    // Apply search filter if there's a query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(submission => {
        // Search in multiple fields
        return (
          String(submission.submission_id).toLowerCase().includes(query) ||
          (submission.reviewer || '').toLowerCase().includes(query) ||
          (submission.select_product || '').toLowerCase().includes(query) ||
          (submission.star_rating ? String(submission.star_rating) : '').includes(query) ||
          (submission.review || '').toLowerCase().includes(query)
        );
      });
    }
    return filtered;
  }, [submissions, searchQuery, statusFilter]);



  // Sort the submissions
  const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];

    // Handle null values for sorting
    if (aValue === null && bValue === null) return 0;
    if (aValue === null) return sortDirection === 'asc' ? -1 : 1;
    if (bValue === null) return sortDirection === 'asc' ? 1 : -1;

    if (sortField === 'created_at') {
      const aDate = new Date(aValue);
      const bDate = new Date(bValue);
      return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
    }

    if (typeof aValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  });

  // Format date for display with explicit formatting options for consistent server/client rendering
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    // Use explicit formatting options to avoid hydration mismatch with DD/MM/YY format and 24-hour time
    const options = {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    // Using en-GB locale for DD/MM/YY format
    return date.toLocaleString('en-GB', options);
  };

  if (error) {
    return (
      <div className="w-full p-4 bg-red-900 bg-opacity-30 text-red-200 rounded-md border border-red-800">
        <h3 className="font-bold">Error loading submissions</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  // Clear search

  return (
    <div className="w-full">
      {/* Table content */}
      <div className="mb-4">

        {/* Status counts with last fetched message */}
        <div className="flex flex-wrap items-center justify-between mb-4">
          <div className="flex gap-4 text-xs text-gray-300">
            <div className="font-semibold">Total: {statusCounts?.total || 0}</div>
            <div>Fetched: {statusCounts?.fetched || 0}</div>
            <div>Title Cleaned: {statusCounts?.title_cleaned || 0}</div>
            <div>Shopify Mapped: {statusCounts?.shopify_mapped || 0}</div>
            <div>Spec Generated: {statusCounts?.specification_generated || 0}</div>
            <div>Error: {statusCounts?.error || 0}</div>
            <div className="ml-4 italic">Last fetched from Jotform: {formatDate(lastFetchedTimestamp)}</div>
          </div>
        </div>

        {/* Controls - Search and Filter */}
        <div className="flex gap-3 mb-4 items-center">
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              className="block w-full h-8 py-1 px-3 text-sm text-gray-100 border border-gray-700 rounded bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search submissions..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          {/* Status Filter Dropdown */}
          <div className="relative w-[180px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full h-8 py-1 px-3 pr-8 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundImage: 'none'
              }}
            >
              <option value="all">All Submissions</option>
              <option value={STATUS.FETCHED}>Fetched</option>
              <option value={STATUS.TITLE_CLEANED}>Title Cleaned</option>
              <option value={STATUS.SHOPIFY_MAPPED}>Shopify Mapped</option>
              <option value={STATUS.SPECIFICATION_GENERATED}>Spec Generated</option>
              <option value={STATUS.ERROR}>Error</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-300">
              <svg className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M7 10l5 5 5-5H7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className="shadow-md rounded-lg border border-gray-800 overflow-auto" style={{ maxWidth: '100%' }}>
        <table className="w-full divide-y divide-gray-800" style={{ minWidth: '1000px' }}>
          <thead className="bg-gray-800">
            <tr>
              <th
                onClick={() => handleSort('submission_id')}
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                style={{ width: '140px' }}
              >
                Jotform ID {sortField === 'submission_id' && <SortIcon direction={sortDirection} />}
              </th>
              <th
                onClick={() => handleSort('reviewer')}
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                style={{ width: '120px' }}
              >
                Reviewer {sortField === 'reviewer' && <SortIcon direction={sortDirection} />}
              </th>
              {statusFilter === 'shopify_mapped' || statusFilter === 'specification_generated' ? (
                <th
                  onClick={() => handleSort('shopify_handle')}
                  className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  style={{ width: 'calc(25% - 100px)' }}
                >
                  Shopify Handle {sortField === 'shopify_handle' && <SortIcon direction={sortDirection} />}
                </th>
              ) : (
                <th
                  onClick={() => handleSort('select_product')}
                  className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  style={{ width: 'calc(25% - 100px)' }}
                >
                  Jotform Title {sortField === 'select_product' && <SortIcon direction={sortDirection} />}
                </th>
              )}
              {statusFilter === 'fetched' ? (
                <th
                  onClick={() => handleSort('created_at')}
                  className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  style={{ width: 'calc(25% - 100px)' }}
                >
                  Submitted {sortField === 'created_at' && <SortIcon direction={sortDirection} />}
                </th>
              ) : (
                <th
                  onClick={() => handleSort(statusFilter === 'shopify_mapped' || statusFilter === 'specification_generated' ? 'shopify_title' : 'cleaned_product_title')}
                  className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  style={{ width: 'calc(25% - 100px)' }}
                >
                  {(statusFilter === 'title_cleaned') ? 'Cleaned Title' : 'Shopify Title'} 
                  {sortField === (statusFilter === 'shopify_mapped' || statusFilter === 'specification_generated' ? 'shopify_title' : 'cleaned_product_title') && 
                    <SortIcon direction={sortDirection} />}
                </th>
              )}

              <th
                onClick={() => handleSort('status')}
                className="cursor-pointer px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                style={{ width: '100px' }}
              >
                Status {sortField === 'status' && <SortIcon direction={sortDirection} />}
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                style={{ width: '120px' }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {sortedSubmissions.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-400">
                  No submissions found
                </td>
              </tr>
            ) : (
              sortedSubmissions.map((submission) => (
                <tr key={submission.submission_id} className="hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                    {submission.submission_id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {submission.reviewer || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {(submission.status === 'shopify_mapped' || submission.status === 'specification_generated')
                      ? (submission.shopify_handle || 'No handle')
                      : (submission.select_product || 'Unknown')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {submission.status === 'fetched'
                      ? formatDate(submission.created_at)
                      : (submission.status === 'shopify_mapped' || submission.status === 'specification_generated')
                        ? (submission.shopify_title || 'No Shopify title')
                        : (submission.cleaned_product_title || 'Not cleaned yet')}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    <StatusBadge status={submission.status || 'fetched'} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {/* Select appropriate action button based on submission status */}
                    {submission.status === STATUS.TITLE_CLEANED && (
                      <ReplayButton
                        submissionId={submission.submission_id}
                        step="clean-titles"
                        label="Clean Title"
                        onReplay={onRefresh}
                      />
                    )}

                    {submission.status === STATUS.SHOPIFY_MAPPED && (
                      <div className="flex items-center">
                        <ReplayButton
                          submissionId={submission.submission_id}
                          step="fetch-shopify-data"
                          label="Map to Shopify"
                          onReplay={onRefresh}
                        />
                        <SpecificationButton
                          submissionId={submission.submission_id}
                          onComplete={onRefresh}
                        />
                      </div>
                    )}

                    {submission.status === STATUS.SPECIFICATION_GENERATED && (
                      <ReplayButton
                        submissionId={submission.submission_id}
                        step="generate-specifications"
                        label="Generate"
                        onReplay={onRefresh}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Helper component for sort icons
function SortIcon({ direction }) {
  return (
    <span className="ml-1 inline-block">
      {direction === 'asc' ? '↑' : '↓'}
    </span>
  );
}
