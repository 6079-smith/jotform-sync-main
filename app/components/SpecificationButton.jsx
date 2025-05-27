'use client';

import { useState } from 'react';

/**
 * Button component for generating specifications for individual submissions
 * Displays processing results or error feedback in a modal
 */
export default function SpecificationButton({ submissionId, onComplete }) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [result, setResult] = useState(null);
  
  const handleClick = async () => {
    try {
      setIsLoading(true);
      setMessage(null);
      setResult(null);
      
      const response = await fetch('/api/specifications/generate-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId })
      });
      
      const data = await response.json();
      setResult(data);
      
      if (response.ok && data.success) {
        // Show success message
        setMessage({ type: 'success', text: data.message });
        // Notify parent component to refresh the data
        if (onComplete && typeof onComplete === 'function') {
          onComplete(data);
        }
      } else {
        // Show error message in the modal
        setMessage({ type: 'error', text: data.message || 'Failed to generate specification' });
        setShowModal(true);
        console.error('Error generating specification:', data.message);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
      setResult({ success: false, errors: [{ message: error.message }] });
      setShowModal(true);
      console.error('Error generating specification:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
  };
  
  return (
    <>
      <div className="relative inline-block ml-2">
        <button
          onClick={handleClick}
          disabled={isLoading}
          className={`text-xs font-medium disabled:bg-gray-700 text-white px-2 py-1 rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700`}
          style={{ width: '24px', height: '24px' }}
          title="Generate Specification"
        >
          {isLoading ? '•••' : '📋'}
        </button>
        
        {message && (
          <div 
            className={`absolute top-0 right-0 w-2 h-2 rounded-full ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ transform: 'translate(50%, -50%)' }}
          />
        )}
      </div>

      {/* Modal for displaying errors */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-xl font-semibold text-gray-100">
                {result?.success ? 'Specification Generated' : 'Specification Generation Failed'}
              </h3>
            </div>
            
            <div className="p-4">
              {result?.success ? (
                <div className="text-green-400 mb-4">
                  <p>{result.message}</p>
                  {result.specificationId && (
                    <p className="mt-2">Specification ID: {result.specificationId}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="text-red-400 mb-4">
                    <p>{message?.text || 'An error occurred while generating the specification.'}</p>
                  </div>
                  
                  {result?.errors && result.errors.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-lg font-medium text-gray-200 mb-2">Error Details:</h4>
                      <ul className="space-y-3">
                        {result.errors.map((error, index) => (
                          <li key={index} className="bg-gray-700 p-3 rounded">
                            <div className="flex flex-col">
                              {error.field && (
                                <span className="text-gray-300">
                                  <span className="font-medium">Field:</span> {error.field}
                                </span>
                              )}
                              {error.value && (
                                <span className="text-gray-300">
                                  <span className="font-medium">Value:</span> {error.value}
                                </span>
                              )}
                              <span className="text-red-400 mt-1">{error.message}</span>
                              {error.suggestions && error.suggestions.length > 0 && (
                                <div className="mt-2">
                                  <span className="text-gray-300 font-medium">Suggestions:</span>
                                  <ul className="ml-4 mt-1 list-disc">
                                    {error.suggestions.map((suggestion, i) => (
                                      <li key={i} className="text-gray-300">{suggestion}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
