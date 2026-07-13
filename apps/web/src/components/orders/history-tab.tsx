import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { ORDER_STATUS_LABELS } from '@taller/shared';
import type { OrderStatusHistoryEntry } from '@/lib/types';

export function HistoryTab({ history }: { history: OrderStatusHistoryEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>De</TableHead>
          <TableHead>A</TableHead>
          <TableHead>Usuario</TableHead>
          <TableHead>Notas</TableHead>
          <TableHead>Fecha</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {history.map((h) => (
          <TableRow key={h.id}>
            <TableCell>{h.fromStatus ? ORDER_STATUS_LABELS[h.fromStatus] : '—'}</TableCell>
            <TableCell>
              <OrderStatusBadge status={h.toStatus} />
            </TableCell>
            <TableCell>{h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : '—'}</TableCell>
            <TableCell className="max-w-64 truncate">{h.notes ?? '—'}</TableCell>
            <TableCell>{new Date(h.createdAt).toLocaleString('es-CO')}</TableCell>
          </TableRow>
        ))}
        {history.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Sin historial
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
