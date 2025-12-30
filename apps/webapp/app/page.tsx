import Link from 'next/link';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-primary-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="absolute top-4 right-4 z-10">
        <ThemeSwitcher />
      </div>

      <div className="container mx-auto px-4 py-16 md:py-24">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-100 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800">
            <span className="text-primary-600 dark:text-primary-400">✦</span>
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">Privacy-First</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
            Your personal assistant that
            <span className="bg-gradient-to-r from-primary-600 to-secondary-600 dark:from-primary-400 dark:to-secondary-400 bg-clip-text text-transparent"> never stores your data</span>
          </h1>
          
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Search across your emails, calendar, LinkedIn, and WhatsApp messages.
            All processing happens in real-time. Nothing is stored.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link 
              href="/login" 
              className="px-8 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors shadow-lg shadow-primary-500/20 dark:shadow-primary-500/10"
            >
              Get Started
            </Link>
            <Link 
              href="#features" 
              className="px-8 py-3 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium transition-colors border border-gray-200 dark:border-gray-700"
            >
              Learn More
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
            <div className="text-4xl mb-4">🔒</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Zero Storage</h3>
            <p className="text-gray-600 dark:text-gray-400">Your queries and data are processed in-memory only. Nothing is saved to any database.</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
            <div className="text-4xl mb-4">📧</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Gmail & Calendar</h3>
            <p className="text-gray-600 dark:text-gray-400">Search your emails and schedule with natural language questions.</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
            <div className="text-4xl mb-4">💬</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Messages</h3>
            <p className="text-gray-600 dark:text-gray-400">Search LinkedIn and WhatsApp messages through our browser extension.</p>
          </div>
          
          <div className="p-6 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-gray-100">AI-Powered</h3>
            <p className="text-gray-600 dark:text-gray-400">Get synthesized answers with cited sources, not just search results.</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-24 text-center">
          <p className="text-gray-600 dark:text-gray-400">Built with privacy in mind. Your data stays yours.</p>
        </footer>
      </div>
    </main>
  );
}
