
import Link from "next/link";
import { ArrowRight, Shield, Activity, TrendingUp, BarChart3, Eye, Lock } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-950 text-white">
      {/* Navbar */}
      <nav className="fixed w-full z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-blue-500 flex items-center justify-center text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="font-bold text-xl tracking-tight text-white">BiFlow Finance</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
                Ingresar
              </Link>
              <Link
                href="/login?signup=true"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition-colors"
              >
                Comenzar Auditaría Gratis
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[20%] w-[30%] h-[30%] bg-emerald-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[10%] w-[20%] h-[20%] bg-blue-500/10 rounded-full blur-[100px]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-blue-500">
              Tu C.F.O. Algorítmico
            </span>
            <br />
            <span className="text-white">para PyMEs</span>
          </h1>
          <p className="mt-6 text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            BiFlow transforma tus archivos bancarios en decisiones inteligentes.
            Audita tu caja 24/7, detecta fugas de capital y recupera dinero perdido sin integraciones complejas.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-lg font-semibold flex items-center justify-center gap-2 transition-all hover:scale-105"
            >
              Probar Auditoría Gratis <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Detección inmediata de pagos duplicados y créditos fiscales recuperables.
          </p>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-24 bg-gray-900/50 border-y border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">Inteligencia Financiera Activa</h2>
            <p className="text-gray-400">5 servicios clave que reemplazan el trabajo manual por precisión algorítmica.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {services.map((service, idx) => (
              <div key={idx} className="p-8 rounded-2xl bg-gray-950 border border-gray-800 hover:border-emerald-500/50 transition-colors group">
                <div className="h-12 w-12 rounded-lg bg-gray-900 flex items-center justify-center mb-6 group-hover:bg-emerald-900/20 transition-colors">
                  <service.icon className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value Proposition Table */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">Para Dueños y Gerentes</h2>
              <p className="text-gray-400 mb-8 text-lg">
                Resolvemos el dolor de la ceguera operativa. BiFlow entrega visibilidad total al dueño y precisión quirúrgica al CFO.
              </p>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Eye className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Visibilidad Unificada</h4>
                    <p className="text-sm text-gray-400">"Sé exactamente qué pasa con mi dinero, cada día, en 1 minuto."</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Lock className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">Control Total</h4>
                    <p className="text-sm text-gray-400">"Tu copiloto financiero audita la caja 24/7 mientras te enfocas en la estrategia."</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-2xl p-2 border border-gray-800">
              <div className="bg-gray-950 rounded-xl overflow-hidden border border-gray-800">
                <div className="grid grid-cols-3 bg-gray-900 p-4 font-medium text-sm border-b border-gray-800">
                  <div>Problema</div>
                  <div className="col-span-2">Solución BiFlow</div>
                </div>
                <div className="divide-y divide-gray-800 text-sm">
                  <div className="grid grid-cols-3 p-4">
                    <div className="text-gray-400">Fugas de Capital</div>
                    <div className="col-span-2 text-white">Auditoría 24/7 de duplicados y comisiones</div>
                  </div>
                  <div className="grid grid-cols-3 p-4">
                    <div className="text-gray-400">Dinero Ocioso</div>
                    <div className="col-span-2 text-white">Alertas de liquidez e inversión automática</div>
                  </div>
                  <div className="grid grid-cols-3 p-4">
                    <div className="text-gray-400">Riesgo de Cobro</div>
                    <div className="col-span-2 text-white">Monitoreo de CUITs en BCRA</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-gray-900/30 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Precios Transparentes</h2>
          <p className="text-gray-400 mb-12">Empieza con nuestro Plan Starter y escala según tus necesidades.</p>

          <div className="max-w-md mx-auto bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 rounded-3xl p-8 relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-blue-500" />

            <h3 className="text-xl font-semibold text-white">Plan Starter</h3>
            <div className="mt-4 flex items-baseline justify-center gap-1">
              <span className="text-4xl font-bold text-white">USD 50</span>
              <span className="text-gray-500">/mes</span>
            </div>

            <p className="mt-4 text-sm text-gray-400">Ideal para PyMEs que buscan control total sin complejidad.</p>

            <ul className="mt-8 space-y-4 text-left text-sm text-gray-300">
              <li className="flex gap-3">
                <Shield className="h-5 w-5 text-emerald-500 shrink-0" /> Auditoría Forense 24/7
              </li>
              <li className="flex gap-3">
                <TrendingUp className="h-5 w-5 text-emerald-500 shrink-0" /> Detección de Fugas Fiscales
              </li>
              <li className="flex gap-3">
                <Activity className="h-5 w-5 text-emerald-500 shrink-0" /> Reporte de Salud Financiera
              </li>
              <li className="flex gap-3">
                <BarChart3 className="h-5 w-5 text-emerald-500 shrink-0" /> Simulador de Cash Flow
              </li>
            </ul>

            <Link
              href="/login?plan=starter"
              className="mt-8 block w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
            >
              Comenzar Ahora
            </Link>
            <p className="mt-4 text-xs text-gray-500">Recupero de inversión inmediato si detectamos 1 sola fuga.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-800 text-center">
        <p className="text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} BiFlow Finance. Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}

const services = [
  {
    title: "Auditoría de Fugas",
    description: "Detector incansable de anomalías. Identifica pagos duplicados, comisiones indebidas y retenciones recuperables (SIRCREB/IIBB).",
    icon: Shield
  },
  {
    title: "Optimización de Liquidez",
    description: "Evita que tu dinero duerma. Identifica saldos ociosos y sugiere colocaciones inmediatas para combatir la inflación.",
    icon: TrendingUp
  },
  {
    title: "Simulador de Cash Flow",
    description: "Predice el futuro. Simula el impacto de tus pagos antes de ejecutarlos y evita descubiertos bancarios.",
    icon: Activity
  },
  {
    title: "Visibilidad Unificada",
    description: "Tus 5 bancos en una sola pantalla. Consolida posiciones y elimina la necesidad de entrar a cada Home Banking.",
    icon: Eye
  },
  {
    title: "Riesgo de Contraparte",
    description: "Radar de vigilancia. Monitorea el estado en BCRA de tus clientes y proveedores para prevenir incobrables.",
    icon: Lock
  }
]
