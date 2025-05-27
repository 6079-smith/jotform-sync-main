import { NextResponse } from 'next/server';
import { searchProductsByTitle } from '@/lib/shopify';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  
  if (!query) {
    return NextResponse.json(
      { success: false, error: 'Query parameter is required' },
      { status: 400 }
    );
  }
  
  try {
    const products = await searchProductsByTitle(query);
    
    // Format the products for the UI
    const formattedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      image: product.images?.[0]?.src || null,
      variants: (product.variants || []).map(variant => ({
        id: variant.id,
        title: variant.title,
        price: variant.price,
        sku: variant.sku
      }))
    }));
    
    return NextResponse.json({
      success: true,
      products: formattedProducts
    });
    
  } catch (error) {
    console.error('Error searching Shopify products:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to search products',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
