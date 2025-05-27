/**
 * API Route for individual specification generation
 * 
 * This endpoint allows generating a specification for a single submission,
 * providing detailed error feedback when generation fails.
 */

import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { generateSpecification, _internal } from '@/lib/specification-generator';

// Destructure internal methods for validation
const { validateSubmission } = _internal;

/**
 * Generate a specification for a single submission with detailed error handling
 */
export async function POST(request) {
  try {
    const { submissionId } = await request.json();

    if (!submissionId) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Missing required parameter: submissionId',
          errors: [{ message: 'Submission ID is required' }]
        }, 
        { status: 400 }
      );
    }

    // Start transaction
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // First validate the submission to provide detailed feedback
      const submissionQuery = `
        SELECT j.*, js.*
        FROM jotform j
        LEFT JOIN jotform_shopify js ON j.submission_id = js.submission_id
        WHERE j.submission_id = $1
      `;
      
      const result = await client.query(submissionQuery, [submissionId]);
      
      if (result.rows.length === 0) {
        return NextResponse.json(
          { 
            success: false, 
            message: `Submission not found: ${submissionId}`,
            errors: [{ message: 'The specified submission ID does not exist' }] 
          }, 
          { status: 404 }
        );
      }

      const submission = result.rows[0];

      // Check if submission is in correct state
      if (submission.status !== 'shopify_mapped') {
        return NextResponse.json(
          { 
            success: false, 
            message: `Submission is in incorrect state: ${submission.status}`,
            errors: [{ 
              message: 'Specifications can only be generated for submissions in shopify_mapped state',
              field: 'status',
              value: submission.status
            }] 
          }, 
          { status: 400 }
        );
      }
      
      // Validate the submission first to provide more detailed errors
      const validationResult = await validateSubmission(client, submission);
      
      if (!validationResult.valid) {
        // Parse the validation error to provide more structured feedback
        const errorInfo = parseValidationError(validationResult.reason);
        
        // Get suggestions for enum values if appropriate
        if (errorInfo.enumTable) {
          errorInfo.suggestions = await getEnumSuggestions(client, errorInfo.enumTable, errorInfo.value);
        }
        
        await client.query('ROLLBACK');
        return NextResponse.json(
          { 
            success: false, 
            message: `Validation failed: ${validationResult.reason}`,
            errors: [errorInfo] 
          }, 
          { status: 400 }
        );
      }

      // Generate the specification
      try {
        const specification = await generateSpecification({
          submissionId,
          client,
          options: {
            skipStatusUpdate: false
          }
        });

        await client.query('COMMIT');
        
        return NextResponse.json({
          success: true,
          message: 'Specification successfully generated',
          specificationId: specification.id,
          specification
        });
      } catch (error) {
        await client.query('ROLLBACK');
        
        // Parse the error to provide structured feedback
        const errorInfo = parseGenerationError(error.message);
        
        return NextResponse.json(
          { 
            success: false, 
            message: `Error generating specification: ${error.message}`,
            errors: [errorInfo] 
          }, 
          { status: 500 }
        );
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in specification generation:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: `Server error: ${error.message}`,
        errors: [{ message: error.message }] 
      }, 
      { status: 500 }
    );
  }
}

/**
 * Parse validation error messages into structured form
 */
function parseValidationError(errorMessage) {
  // Default error structure
  const errorInfo = {
    message: errorMessage,
    field: null,
    value: null,
    enumTable: null
  };

  // Check for missing reviewer
  if (errorMessage.includes('Missing reviewer')) {
    errorInfo.field = 'reviewer';
    return errorInfo;
  }

  // Check for user not found
  if (errorMessage.includes('No user found with jotform_name matching reviewer')) {
    errorInfo.field = 'reviewer';
    const match = errorMessage.match(/reviewer: (.+)$/);
    if (match) {
      errorInfo.value = match[1];
    }
    return errorInfo;
  }

  // Check for enum value not found
  const enumMatch = errorMessage.match(/Value "([^"]+)" not found in (\w+)/);
  if (enumMatch) {
    errorInfo.value = enumMatch[1];
    errorInfo.enumTable = enumMatch[2];
    
    // Map enum table to field name
    if (enumMatch[2] === 'enum_tobacco_types') {
      errorInfo.field = 'tobacco';
    } else if (enumMatch[2] === 'enum_cures') {
      errorInfo.field = 'cure';
    } else if (enumMatch[2] === 'enum_tasting_notes') {
      errorInfo.field = 'tasting_notes';
    }
    
    errorInfo.message = `"${errorInfo.value}" is not a recognized value for ${errorInfo.field}`;
  }

  // Check for malformed fields
  const malformedMatch = errorMessage.match(/Field (\w+) contains consecutive/);
  if (malformedMatch) {
    errorInfo.field = malformedMatch[1];
    errorInfo.message = `The ${errorInfo.field} field contains formatting errors`;
  }

  return errorInfo;
}

/**
 * Parse generation errors into structured form
 */
function parseGenerationError(errorMessage) {
  // Default error structure
  const errorInfo = {
    message: errorMessage
  };

  // Check for no Shopify data
  if (errorMessage.includes('no associated Shopify data')) {
    errorInfo.field = 'shopify_handle';
    errorInfo.message = 'This submission has no associated Shopify data';
  }

  return errorInfo;
}

/**
 * Get suggestions for enum values
 */
async function getEnumSuggestions(client, enumTable, invalidValue) {
  try {
    // Get similar values to suggest
    const query = `
      SELECT name 
      FROM ${enumTable} 
      ORDER BY name ASC
      LIMIT 5
    `;
    
    const result = await client.query(query);
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error(`Error getting suggestions for ${enumTable}:`, error);
    return [];
  }
}
