'use client';

import { Fragment, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Modal component to display failed submissions with detailed error information
 */
export default function FailedSubmissionsModal({ isOpen, onClose, failedSubmissions = [] }) {
  // If no failures, don't render anything
  if (!failedSubmissions || failedSubmissions.length === 0) {
    return null;
  }

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div className="absolute right-0 top-0 pr-4 pt-4">
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={onClose}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                    <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900">
                      Failed Submissions ({failedSubmissions.length})
                    </Dialog.Title>
                    <div className="mt-4 max-h-96 overflow-y-auto">
                      <div className="mb-4 text-sm text-gray-500">
                        The following submissions could not be processed. Please resolve the issues and try again.
                      </div>
                      
                      <div className="space-y-4">
                        {failedSubmissions.map((submission) => (
                          <div key={submission.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <h4 className="font-medium text-gray-900">{submission.title || submission.id}</h4>
                            <p className="text-red-600 mt-1">{submission.error}</p>
                            
                            {submission.errorInfo && (
                              <div className="mt-2">
                                {submission.errorInfo.field && (
                                  <p className="text-sm text-gray-600">
                                    <span className="font-medium">Field:</span> {submission.errorInfo.field}
                                  </p>
                                )}
                                
                                {submission.errorInfo.value && (
                                  <p className="text-sm text-gray-600">
                                    <span className="font-medium">Invalid value:</span> {submission.errorInfo.value}
                                  </p>
                                )}
                                
                                {submission.errorInfo.suggestions && submission.errorInfo.suggestions.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-sm font-medium text-gray-600">Suggestions:</p>
                                    <ul className="mt-1 text-sm text-gray-600 list-disc ml-5">
                                      {submission.errorInfo.suggestions.map((suggestion, index) => (
                                        <li key={index}>{suggestion}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto"
                    onClick={onClose}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
