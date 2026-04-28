import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getSeverityColor = (severity: string, background = false) => {
  switch (severity) {
    case 'Critical':
      return background ? 'bg-red-600 text-white' : 'text-red-600';
    case 'High':
      return background ? 'bg-orange-500 text-white' : 'text-orange-500';
    case 'Medium':
      return background ? 'bg-yellow-500 text-black' : 'text-yellow-500';
    case 'Low':
      return background ? 'bg-blue-500 text-white' : 'text-blue-500';
    default:
      return background ? 'bg-gray-500 text-white' : 'text-gray-500';
  }
};