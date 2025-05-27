'use client';

// Using Unicode symbols instead of Lucide React icons

/**
 * Status badge component
 * 
 * Displays a visual indicator of a submission's current status
 * with appropriate icons and colors
 */
export default function StatusBadge({ status }) {
  // Configuration for each status type
  const statusConfig = {
    fetched: {
      color: 'gray',
      icon: '',
      label: 'Fetched'
    },
    title_cleaned: {
      color: 'blue',
      icon: '',
      label: 'Cleaned'
    },
    shopify_mapped: {
      color: 'green',
      icon: '',
      label: 'Shopified'
    },
    specification_generated: {
      color: 'purple',
      icon: '',
      label: 'Generated'
    },
    error: {
      color: 'red',
      icon: '',
      label: 'Error'
    }
  };

  // Default to fetched if status is not recognized
  const config = statusConfig[status] || statusConfig.fetched;

  // Map color names to Tailwind classes with dark theme - aligned with button colors
  const colorClasses = {
    gray: 'bg-gray-600 bg-opacity-90 text-gray-100',
    blue: 'bg-blue-600 bg-opacity-90 text-blue-100',
    green: 'bg-green-600 bg-opacity-90 text-green-100',
    purple: 'bg-purple-600 bg-opacity-90 text-purple-100',
    red: 'bg-red-600 bg-opacity-90 text-red-100'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[config.color]}`}>
      {config.icon && <span className="mr-1">{config.icon}</span>}
      {config.label}
    </span>
  );
}
