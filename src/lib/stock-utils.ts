export function getStockStatusBadge(alertLevel: string, totalStock: number): {
  label: string;
  color: 'red' | 'amber' | 'blue' | 'green' | 'grey';
  tooltip?: string;
} {
  if (totalStock === 0) return { label: 'No Stock', color: 'grey' };
  switch (alertLevel) {
    case 'critical': return { label: 'Reorder Now', color: 'red' };
    case 'warning':
    case 'watch':   return { label: 'Running Low', color: 'amber' };
    case 'locked':  return {
      label: 'Engaged',
      color: 'blue',
      tooltip: 'Stock exists but none is currently free — all quantity is at vendors or in active production',
    };
    case 'healthy':
    default:        return { label: 'In Stock', color: 'green' };
  }
}
