import { supabaseAdmin } from '@/lib/supabase'

export const revalidate = 30

type UserRef = { phone_number: string }

type Transaction = {
  id: string
  amount: number
  vendor: string | null
  category: string
  transaction_date: string
  source_type: string
  confidence_score: number | null
  confirmed: boolean
  users: UserRef | UserRef[] | null
}

type MonthlySummary = {
  year: number
  month: number
  total_expenses: number
  transaction_count: number
  users: UserRef | UserRef[] | null
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const SOURCE_ICONS: Record<string, string> = {
  photo: '📷',
  voice: '🎤',
  text: '💬',
}

export default async function DashboardPage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const [{ data: transactions }, { data: summaries }] = await Promise.all([
    supabaseAdmin
      .from('transactions')
      .select('id, amount, vendor, category, transaction_date, source_type, confidence_score, confirmed, users(phone_number)')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('monthly_summaries')
      .select('year, month, total_expenses, transaction_count, users(phone_number)')
      .eq('year', currentYear)
      .eq('month', currentMonth),
  ])

  const thisMonthTotal = summaries?.reduce((sum, s) => sum + (s.total_expenses ?? 0), 0) ?? 0
  const thisMonthCount = summaries?.reduce((sum, s) => sum + (s.transaction_count ?? 0), 0) ?? 0

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Tradebook Dashboard</h1>
        <p className="text-gray-400 text-sm mb-6">Internal — Phase 0</p>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">
              {MONTH_NAMES[currentMonth]} {currentYear} expenses
            </p>
            <p className="text-3xl font-bold text-white">£{thisMonthTotal.toFixed(2)}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Transactions this month</p>
            <p className="text-3xl font-bold text-white">{thisMonthCount}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Total transactions</p>
            <p className="text-3xl font-bold text-white">{transactions?.length ?? 0}</p>
          </div>
        </div>

        {/* Transactions table */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Transactions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Source</th>
                  <th className="text-left px-4 py-3">Confidence</th>
                  <th className="text-left px-4 py-3">Phone</th>
                </tr>
              </thead>
              <tbody>
                {!transactions || transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No transactions yet. Send a receipt to the WhatsApp number to get started.
                    </td>
                  </tr>
                ) : (
                  (transactions as Transaction[]).map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                        {new Date(tx.transaction_date).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3 text-white font-medium">
                        {tx.vendor ?? <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300 capitalize">
                          {tx.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white font-semibold">
                        £{Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {SOURCE_ICONS[tx.source_type] ?? tx.source_type}
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBadge score={tx.confidence_score} />
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {getUserPhone(tx.users)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-gray-600 text-xs mt-4 text-center">
          Auto-refreshes every 30 seconds
        </p>
      </div>
    </main>
  )
}

function getUserPhone(users: UserRef | UserRef[] | null): string {
  if (!users) return '—'
  if (Array.isArray(users)) return users[0]?.phone_number ?? '—'
  return users.phone_number
}

function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-500">—</span>

  const pct = Math.round(score * 100)
  const colour = score >= 0.8 ? 'text-green-400' : score >= 0.6 ? 'text-yellow-400' : 'text-red-400'

  return <span className={`font-mono text-xs ${colour}`}>{pct}%</span>
}
