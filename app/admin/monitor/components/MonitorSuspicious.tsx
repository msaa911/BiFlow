import { createClient } from '../../../../lib/supabase/server';
import { AlertTriangle, Clock, MapPin, Fingerprint, ExternalLink, ShieldCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export async function MonitorSuspicious() {
  const supabase = await createClient();

  // Fetch suspicious logs (category: auth, level: warn/error)
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .or('category.eq.auth,category.eq.admin')
    .in('level', ['warn', 'error'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-8 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-1">Entorno Seguro</h3>
        <p className="text-xs text-emerald-500/60 font-medium">No se han detectado anomalías en la última hora.</p>
      </div>
    );
  }

  return (
    <div className="bg-rose-500/5 backdrop-blur-3xl rounded-3xl border border-rose-500/20 overflow-hidden shadow-2xl shadow-rose-950/20">
      <div className="p-6 border-b border-rose-500/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-rose-500/20 rounded-2xl flex items-center justify-center border border-rose-500/30 animate-pulse">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Actividad Roja</h2>
            <p className="text-[10px] text-rose-500/60 font-black uppercase tracking-tighter">Patrones Inusuales Detectados</p>
          </div>
        </div>
        <button className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-1 group">
          Ver Todo <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </button>
      </div>

      <div className="divide-y divide-rose-500/10 max-h-[400px] overflow-y-auto">
        {logs.map((log) => (
          <div key={log.id} className="p-5 flex gap-4 group hover:bg-rose-500/5 transition-all">
            <div className="mt-1 flex flex-col items-center gap-1 opacity-40">
              <Fingerprint className="h-4 w-4 text-rose-500" />
              <div className="w-0.5 h-full bg-rose-500/20 min-h-[40px]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-tighter">{log.message}</p>
                <div className="flex items-center gap-2 text-[9px] font-black uppercase text-white/30 tracking-widest">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mt-3">
                <div className="p-2 bg-black/40 rounded-xl border border-white/5 flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-400 truncate tracking-tight uppercase">IP: {log.metadata?.ip || 'Desconocida'}</span>
                </div>
                <div className="p-2 bg-black/40 rounded-xl border border-white/5 flex items-center gap-2">
                  <ShieldCheck className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-400 truncate tracking-tight uppercase">User ID: {log.admin_id?.slice(0, 8) || 'N/A'}</span>
                </div>
              </div>
              
              <div className="mt-3 py-2 bg-rose-500/10 rounded-xl border border-rose-500/10 px-3 overflow-hidden">
                <p className="text-[10px] text-rose-500 italic font-mono truncate">{JSON.stringify(log.metadata)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-4 bg-rose-500/10 text-center animate-pulse">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-rose-500">MÁXIMA PRIORIDAD REQUERIDA</p>
      </div>
    </div>
  );
}
