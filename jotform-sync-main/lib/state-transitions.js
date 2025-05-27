/**
 * State transition rules for the submission workflow
 * Defines valid transitions between states and the required preconditions
 */

import { STATUS } from './submission-status';

/**
 * State transition configuration
 * Maps each action to its required state, next state, and error message
 */
export const STATE_TRANSITIONS = {
  'fetch': {
    // Fetching from JotForm doesn't have a required previous state
    nextState: STATUS.FETCHED,
    errorMessage: 'Error fetching submissions from JotForm'
  },
  'clean-titles': {
    requiredState: STATUS.FETCHED,
    nextState: STATUS.TITLE_CLEANED,
    errorMessage: 'Can only clean titles for submissions in "fetched" state'
  },
  'fetch-shopify-data': {
    requiredState: STATUS.TITLE_CLEANED,
    nextState: STATUS.SHOPIFY_MAPPED,
    errorMessage: 'Can only fetch Shopify data for submissions with cleaned titles'
  },
  'generate-specifications': {
    requiredState: STATUS.SHOPIFY_MAPPED,
    nextState: STATUS.SPECIFICATION_GENERATED,
    errorMessage: 'Can only generate specifications for submissions with Shopify data'
  }
};

/**
 * Validates if a state transition is allowed
 * @param {string} currentState - Current state of the submission
 * @param {string} action - Action to perform
 * @returns {Object} - { valid: boolean, errorMessage: string|null }
 */
export function validateStateTransition(currentState, action) {
  // If there's no transition rule for this action, allow it
  if (!STATE_TRANSITIONS[action]) {
    return { valid: true, errorMessage: null };
  }

  const { requiredState, errorMessage } = STATE_TRANSITIONS[action];
  
  // If no required state is specified, transition is valid
  if (!requiredState) {
    return { valid: true, errorMessage: null };
  }
  
  // Check if current state matches required state
  const isValid = currentState === requiredState;
  
  return {
    valid: isValid,
    errorMessage: isValid ? null : errorMessage
  };
}

/**
 * Gets the next state for an action
 * @param {string} action - Action to perform
 * @returns {string|null} - Next state or null if action not found
 */
export function getNextState(action) {
  return STATE_TRANSITIONS[action]?.nextState || null;
}

/**
 * Gets the list of submission IDs eligible for an action
 * @param {Object} client - Database client
 * @param {string} action - Action to check eligibility for
 * @returns {Promise<Array<string>>} - Array of eligible submission IDs
 */
export async function getEligibleSubmissionIds(client, action) {
  const { requiredState } = STATE_TRANSITIONS[action] || {};
  
  // If no required state, all submissions are eligible
  if (!requiredState) {
    return [];
  }
  
  try {
    const result = await client.query(
      'SELECT submission_id FROM jotform WHERE status = $1',
      [requiredState]
    );
    
    return result.rows.map(row => row.submission_id);
  } catch (error) {
    console.error(`Error getting eligible submission IDs for ${action}:`, error);
    return [];
  }
}
