import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOrderNumber(prefix: string, orderNumber: number): string {
  return `${prefix}-${String(orderNumber).padStart(6, '0')}`;
}
