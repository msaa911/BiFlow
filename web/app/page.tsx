
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-black text-white">
      <h1 className="text-5xl font-bold mb-8 text-emerald-500">BiFlow Finance</h1>
      <p className="text-xl mb-8 text-gray-400">Tu C.F.O. Algorítmico</p>
      <Link
        href="/login"
        className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold transition-colors"
      >
        Iniciar Sesión
      </Link>
    </div>
  );
}
