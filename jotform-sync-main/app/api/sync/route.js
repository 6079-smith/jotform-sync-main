import { NextResponse } from 'next/server';
import { fetchNewSubmissions } from '@/app/api/sync/fetch-jotform';
import { fetchShopifyData } from '@/app/api/sync/fetch-shopify';
import { cleanProductTitles } from '@/app/api/sync/clean-titles';

export async function POST(request) {
  try {
    const { action } = await request.json();


    if (action === 'fetch') {
      const result = await fetchNewSubmissions();
      return NextResponse.json(result);
    }
    if (action === 'fetch-shopify-data') {
      const result = await fetchShopifyData();
      return NextResponse.json(result);
    }
    
    if (action === 'clean-titles') {
      const result = await cleanProductTitles();
      return NextResponse.json(result);
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action',
      validActions: ['fetch', 'fetch-shopify-data', 'clean-titles']
    }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
