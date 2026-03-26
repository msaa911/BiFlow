import { createClient } from '../../../../lib/supabase/server';
import { AlertCircle, ShieldCheck, Activity, Users } from 'lucide-react';

export async function MonitorStats() {
  const supabase = await createClient();

  // 1. Fetch metrics
  const { count: errorCount } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('level', 'error')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: activeImpersonations } = await supabase
    .from('audit_logs')
    .select('*', { count: 'exact', head: true })
    .eq('level', 'info')
    .eq('category', 'admin')
    .filter('metadata->>action', 'eq', 'start_impersonation')
    .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()); // Last 2 hours

  const { count: totalOrgs } = await supabase
    .from('organizations')
    .select('*', { count: 'exact', head: true });

  const stats = [
    {
      title: 'Errores (24h)',
      value: errorCount || 0,
      icon: AlertCircle,
      color: (errorCount || 0) > 0 ? 'text-rose-500' : 'text-gray-400',
      bg: (errorCount || 0) > 0 ? 'bg-rose-500/10' : 'bg-white/5',
      border: (errorCount || 0) > 0 ? 'border-rose-500/20' : 'border-white/5'
    },
    {
      title: 'Auditorías Activas',
      value: activeImpersonations || 0,
      icon: ShieldCheck,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20'
    },
    {
      title: 'Salud del Sistema',
      value: '99.9%',
      icon: Activity,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20'
    },
    {
      title: 'Total Organizaciones',
      value: totalOrgs || 0,
      icon: Users,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, i) => (
        <div 
          key={i}
          className={`relative overflow-hidden group p-5 rounded-2xl border ${stat.border} ${stat.bg} backdrop-blur-md transition-all hover:scale-[1.02] hover:shadow-xl hover:shadow-black/20`}
        >
          {/* Decorative background light */}
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-24 h-24 rounded-full blur-3xl opacity-20 bg-current transition-opacity group-hover:opacity-40" />
          
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/50 mb-1">{stat.title}</p>
              <p className={`text-2xl font-black tracking-tight ${stat.color}`}>{stat.value}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color} border border-white/5`}>
              <stat.icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
