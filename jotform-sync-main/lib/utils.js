import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines Tailwind CSS classes using clsx and tailwind-merge
 * This utility function is used in UI components
 * 
 * @param {...string} inputs - Tailwind CSS class names to be combined
 * @returns {string} - Combined class names with potential conflicts resolved
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
