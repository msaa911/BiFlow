import { Suspense } from 'react';
import { MonitorStats } from './components/MonitorStats';
import { LogViewer } from './components/LogViewer';
import { MonitorSuspicious } from './components/MonitorSuspicious';
import { LayoutGrid, AlertCircle, Loader2 } from 'lucide-react';

export default function MonitorPage() {
  return (
    <div className="space-y-10 pb-20 max-w-[1400px] mx-auto">
      {/* Page Title Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 mb-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="text-[10px] uppercase font-black tracking-[0.3em]">Centro de Operaciones</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter">
            Monitorización <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-emerald-400">Global</span>
          </h1>
          <p className="mt-4 text-gray-400 max-w-xl font-medium leading-relaxed">
            Supervisión técnica de la plataforma en tiempo real. Auditoría de eventos, errores críticos y patrones de tráfico inusuales.
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-xl">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <p className="text-xs uppercase font-black tracking-widest text-emerald-500">Sistema Activo y Saludable</p>
        </div>
      </div>

      <hr className="border-white/5" />

      {/* Primary Stats Grid */}
      <Suspense fallback={<div className="h-40 bg-white/5 animate-pulse rounded-2xl" />}>
        <MonitorStats />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Log Stream (Left & Center) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 text-gray-500 animate-spin-slow" />
            <span className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500">Live Stream</span>
          </div>
          <Suspense fallback={<div className="h-[600px] bg-white/5 animate-pulse rounded-3xl" />}>
            <LogViewer />
          </Suspense>
        </div>

        {/* Right Sidebar (Threat Analysis / Alerts) */}
        <div className="space-y-8">
           <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-rose-500" />
            <span className="text-[10px] uppercase font-black tracking-[0.3em] text-rose-500">Análisis de Amenazas</span>
          </div>
          <Suspense fallback={<div className="h-[400px] bg-white/5 animate-pulse rounded-3xl" />}>
            <MonitorSuspicious />
          </Suspense>
          
          <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 transition-all hover:bg-indigo-500/10">
            <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">Auditoría de IA</h3>
            <p className="text-xs text-gray-500 mb-4 font-medium leading-loose">
              El motor de conciliación y el asesor de caja están operando dentro de los rangos de latencia esperados. 
              No se requieren acciones de optimización de BD.
            </p>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 w-[85%]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
