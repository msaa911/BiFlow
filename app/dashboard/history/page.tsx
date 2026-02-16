
import { ImportHistory } from '@/components/dashboard/import-history'

export default function HistoryPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">Historial de Operaciones</h1>
            <ImportHistory />
        </div>
    )
}
