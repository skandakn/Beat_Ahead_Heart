import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EmergencyAssistance } from '@/components/emergency/EmergencyAssistance';

export const metadata: Metadata = {
  title: 'RapidCare — BeatAhead',
  description:
    'Immediate nearby healthcare options, emergency services direct call (112), and location sharing. Research/wellness prototype.',
};

export default function EmergencyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10">
      <div className="max-w-4xl mx-auto px-4 mb-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-semibold text-navy-600 hover:text-navy-900 transition-colors bg-white px-3 py-2 rounded-xl border border-navy-200 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
      </div>

      <main className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-3xl border border-navy-100 shadow-xl overflow-hidden p-2 sm:p-6">
          <EmergencyAssistance />
        </div>
      </main>
    </div>
  );
}
