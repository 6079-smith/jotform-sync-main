# Jotform Sync Admin

A Next.js application to view, manage, and process Jotform submissions with status tracking and data transformation capabilities.

## Features

- View Jotform submissions in a sortable table with status indicators
- Synchronize with Jotform API to fetch new submissions
- Process submission data with status tracking (unprocessed, processed, etc.)
- Generate normalized specifications from form submissions
- Clean and standardize product titles with customizable rules
- Shopify integration for e-commerce workflows
- Database storage for submission data and processing history
- Responsive design that works on all devices
- Server-side actions for data fetching and processing

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the root directory with your API credentials:
   ```
   JOTFORM_API_KEY=your_api_key_here
   JOTFORM_API_URL=https://api.jotform.com
   JOTFORM_FORM_ID=your_form_id_here
   # Database credentials
   DATABASE_URL=your_database_connection_string
   # Shopify credentials (if using Shopify integration)
   SHOPIFY_API_KEY=your_shopify_api_key
   SHOPIFY_API_SECRET=your_shopify_api_secret
   SHOPIFY_STORE_URL=your_shopify_store_url
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

- `JOTFORM_API_KEY` - Your Jotform API key
- `JOTFORM_API_URL` - Jotform API URL (default: https://api.jotform.com)
- `JOTFORM_FORM_ID` - The ID of the form you want to fetch submissions from
- `DATABASE_URL` - Connection string for your PostgreSQL database
- `SHOPIFY_API_KEY` - Your Shopify API key (if using Shopify integration)
- `SHOPIFY_API_SECRET` - Your Shopify API secret (if using Shopify integration)
- `SHOPIFY_STORE_URL` - Your Shopify store URL (if using Shopify integration)

## Project Structure

- `/app` - Next.js app directory
  - `/api` - API routes for sync operations and data processing
  - `/components` - UI components for submission display and controls
- `/lib` - Utility functions and API clients
  - `jotform-submissions.js` - Functions for working with Jotform API
  - `specification-generator.js` - Logic for transforming form data
  - `shopify.js` - Shopify integration utilities
  - `submission-status.js` - Status tracking for submissions
  - `db.js` - Database connection and queries
- `/scripts` - Utility scripts for database schema and testing

## Key Scripts

- `npm run dev` - Run development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run schema` - Generate database schema documentation
- `npm run cleanup` - Fix linting issues automatically

## Built With

- [Next.js](https://nextjs.org/) - The React Framework
- [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
- [date-fns](https://date-fns.org/) - Modern JavaScript date utility library
- [PostgreSQL](https://www.postgresql.org/) - Database for submission storage
- [@neondatabase/serverless](https://neon.tech) - Serverless Postgres client

## License

This project is licensed under the MIT License.
