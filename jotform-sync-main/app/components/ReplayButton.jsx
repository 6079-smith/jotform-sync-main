'use client';

import { useState } from 'react';

/**
 * Button component for replaying a specific processing step for a submission
 */
export default function ReplayButton({ submissionId, step, label, onReplay }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  
  // All buttons now use red color
  const getButtonColor = () => {
    return 'bg-red-600 hover:bg-red-700';
  };
  
  const handleClick = async () => {
    try {
      setIsLoading(true);
      setMessage(null);
      
      const response = await fetch('/api/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, step })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Show success message
        setMessage({ type: 'success', text: data.message });
        // Notify parent component to refresh the data
        if (onReplay && typeof onReplay === 'function') {
          onReplay(data);
        }
      } else {
        // Show error message
        setMessage({ type: 'error', text: data.message });
        console.error('Error reprocessing:', data.message);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      console.error('Error reprocessing:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Simplified button design
  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`text-xs font-medium disabled:bg-gray-700 text-white px-2 py-1 rounded-full flex items-center justify-center ${isLoading ? 'opacity-70' : getButtonColor()}`}
        style={{ width: '24px', height: '24px' }}
        title={`Reprocess ${label}`}
      >
        {isLoading ? '•••' : '↻'}
      </button>
      
      {message && (
        <div 
          className={`absolute top-0 right-0 w-2 h-2 rounded-full ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ transform: 'translate(50%, -50%)' }}
        />
      )}
    </div>
  );
}
