import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { STATUS } from '@/lib/submission-status';
import { cleanProductName } from '@/lib/product-title-cleaner';
import { findMatchingShopifyProduct, saveShopifyProductData } from '@/lib/shopify';
import { generateSpecification } from '@/lib/specification-generator';

export async function POST(request) {
  const { submissionId, step } = await request.json();
  
  if (!submissionId || !step) {
    return NextResponse.json({ 
      success: false, 
      message: 'Missing required parameters' 
    }, { status: 400 });
  }
  
  const client = await db.getClient();
  
  try {
    await client.query('BEGIN');
    
    // Get the current submission
    const result = await client.query(
      'SELECT * FROM jotform WHERE submission_id = $1 AND status != $2',
      [submissionId, 'ignore']
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ 
        success: false, 
        message: 'Submission not found' 
      }, { status: 404 });
    }
    
    const submission = result.rows[0];
    
    // Process based on the requested step
    let response = {};
    
    switch(step) {
      case 'clean-titles':
        // Only allow reprocessing if submission is already in TITLE_CLEANED state
        if (submission.status !== STATUS.TITLE_CLEANED) {
          await client.query('ROLLBACK');
          return NextResponse.json({ 
            success: false, 
            message: `Cannot reprocess title cleaning for submission in ${submission.status} state` 
          }, { status: 400 });
        }
        
        // Re-clean the title without changing the state
        const cleanedTitle = cleanProductName(submission.select_product);
        
        // Update the submission with the cleaned title
        await client.query(
          'UPDATE jotform SET cleaned_product_title = $1 WHERE submission_id = $2',
          [cleanedTitle, submissionId]
        );
        
        response = { 
          success: true, 
          message: `Title cleaned: "${submission.select_product}" → "${cleanedTitle}"`,
          originalTitle: submission.select_product,
          cleanedTitle
        };
        break;
        
      case 'fetch-shopify-data':
        // Only allow reprocessing if submission is already in SHOPIFY_MAPPED state
        if (submission.status !== STATUS.SHOPIFY_MAPPED) {
          await client.query('ROLLBACK');
          return NextResponse.json({ 
            success: false, 
            message: `Cannot reprocess Shopify mapping for submission in ${submission.status} state` 
          }, { status: 400 });
        }
        
        // Use cleaned title if available, otherwise use original product title
        const titleToUse = submission.cleaned_product_title || submission.select_product;
        
        // Find matching Shopify product
        const productData = await findMatchingShopifyProduct(titleToUse);
        
        if (!productData) {
          await client.query('ROLLBACK');
          return NextResponse.json({ 
            success: false, 
            message: `Could not find matching Shopify product for "${titleToUse}"` 
          }, { status: 404 });
        }
        
        // Save to database
        await saveShopifyProductData(submissionId, productData, client);
        
        response = { 
          success: true, 
          message: `Mapped to Shopify product: "${productData.title}"`,
          shopifyProduct: productData
        };
        break;
        
      case 'generate-specifications':
        // For specification generation, we need to check if it's at least in SHOPIFY_MAPPED state
        // We allow both SHOPIFY_MAPPED and SPECIFICATION_GENERATED states to be reprocessed
        if (![STATUS.SHOPIFY_MAPPED, STATUS.SPECIFICATION_GENERATED].includes(submission.status)) {
          await client.query('ROLLBACK');
          return NextResponse.json({ 
            success: false, 
            message: `Cannot generate specifications for submission in ${submission.status} state. Must be in either SHOPIFY_MAPPED or SPECIFICATION_GENERATED state.` 
          }, { status: 400 });
        }
        
        // Get the associated Shopify data
        const shopifyResult = await client.query(
          'SELECT * FROM jotform_shopify WHERE submission_id = $1',
          [submissionId]
        );
        
        if (shopifyResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return NextResponse.json({ 
            success: false, 
            message: 'No Shopify data found for this submission' 
          }, { status: 404 });
        }
        
        // Generate or update specification using upsert logic
        // This will create a new specification or update an existing one based on submission_id
        const specResult = await generateSpecification({
          submissionId,
          client,
          options: {
            logLevel: 3 // More detailed logging for troubleshooting
          }
        });
        
        response = { 
          success: true, 
          message: `Regenerated specification for "${submission.select_product}"`,
          specification: specResult
        };
        break;
        
      default:
        await client.query('ROLLBACK');
        return NextResponse.json({ 
          success: false, 
          message: `Unknown step: ${step}` 
        }, { status: 400 });
    }
    
    await client.query('COMMIT');
    return NextResponse.json(response);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error reprocessing submission ${submissionId}:`, error);
    return NextResponse.json({ 
      success: false, 
      message: `Error: ${error.message}` 
    }, { status: 500 });
  } finally {
    client.release();
  }
}
