import { NextResponse } from 'next/server';
import { generateSpecifications } from '@/lib/specification-generator';

export async function POST(request) {
  try {
    // Call the core generator function with options
    const result = await generateSpecifications({
      // Use default batch size
      // No progress callback for API route
      logLevel: 1 // Only show WARN and ERROR logs in server environment
    });
    
    // Prepare the response with detailed information
    const response = {
      success: true,
      processed: result.processed,
      success: result.success,
      duration: result.duration,
      message: `Processed ${result.processed} submissions, ${result.success} succeeded, ${result.failedSubmissions.length} failed.`
    };
    
    // Only include failed submissions if there are any
    if (result.failedSubmissions && result.failedSubmissions.length > 0) {
      response.failedSubmissions = result.failedSubmissions;
    }
    
    // Return successful response
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error generating specifications:', error);
    
    // Return error response
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
