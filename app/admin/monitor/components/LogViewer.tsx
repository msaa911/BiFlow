'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../../../lib/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Terminal, 
  Search, 
  Filter, 
  AlertTriangle, 
  CheckCircle2, 
  Bug, 
  Database, 
  ShieldCheck, 
  RefreshCcw,
  Clock,
  ExternalLink
} from 'lucide-react';

interface AuditLog {
  id: string;
  created_at: string;
  level: 'info' | 'warn' | 'error';
  category: 'auth' | 'payments' | 'system' | 'admin';
  message: string;
  metadata: any;
  admin_id: string;
}

export function LogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const supabase = createClient();

  const fetchLogs = async () => {
    setIsLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter !== 'all') {
      query = query.eq('level', filter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLogs(data as AuditLog[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    
    // Real-time subscription
    const channel = supabase
      .channel('audit_logs_realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, (payload) => {
        setLogs(current => [payload.new as AuditLog, ...current].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter]);

  const filteredLogs = logs.filter(log => 
    log.message.toLowerCase().includes(search.toLowerCase()) ||
    log.category.toLowerCase().includes(search.toLowerCase())
  );

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      case 'warn': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default: return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auth': return <ShieldCheck className="h-3 w-3" />;
      case 'payments': return <Database className="h-3 w-3" />;
      case 'admin': return <Terminal className="h-3 w-3" />;
      default: return <Bug className="h-3 w-3" />;
    }
  };

  return (
    <div className="bg-[#0a0a0f]/80 backdrop-blur-2xl rounded-3xl border border-white/5 overflow-hidden shadow-2xl flex flex-col h-[600px]">
      {/* Header Panel */}
      <div className="p-6 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
            <Terminal className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest">Logs Globales</h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Eventos del sistema en tiempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text"
              placeholder="Buscar evento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl h-9 pl-9 pr-4 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-indigo-500/50 transition-all w-[240px]"
            />
          </div>
          
          <select 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl h-9 px-3 text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all"
          >
            <option value="all">TODOS</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>

          <button 
            onClick={fetchLogs}
            disabled={isLoading}
            className="h-9 w-9 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 opacity-30">
            <RefreshCcw className="h-8 w-8 animate-spin" />
            <p className="text-xs uppercase tracking-widest font-bold">Cargando Logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 italic text-gray-600">
            <LogOut className="h-8 w-8 mb-2" />
            <p className="text-xs uppercase tracking-widest font-bold">No se encontraron eventos</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#0a0a0f] z-10">
              <tr className="border-b border-white/5">
                <th className="py-4 px-6 text-[10px] font-black uppercase text-gray-500 tracking-widest">Severidad</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase text-gray-500 tracking-widest">Evento</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase text-gray-500 tracking-widest w-[180px]">Hora</th>
                <th className="py-4 px-6 text-[10px] font-black uppercase text-gray-500 tracking-widest w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id} className="group hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black border tracking-tighter ${getLevelColor(log.level)}`}>
                      {log.level === 'error' ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded bg-white/5 text-gray-400 capitalize flex items-center gap-1 text-[9px]">
                          {getCategoryIcon(log.category)}
                          {log.category}
                        </span>
                        <p className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">{log.message}</p>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <code className="text-[10px] text-gray-600 font-mono mt-1 block">
                          {JSON.stringify(log.metadata)}
                        </code>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-2 text-gray-500 group-hover:text-gray-400">
                      <Clock className="h-3 w-3" />
                      <span className="text-[10px] font-bold uppercase truncate">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <button className="h-7 w-7 bg-white/5 hover:bg-white/10 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                      <ExternalLink className="h-3 w-3 text-indigo-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Footer info */}
      <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5 flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em] text-gray-500">
        <span>Mostrando últimos 50 eventos</span>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Stream en vivo conectado</span>
        </div>
      </div>
    </div>
  );
}
