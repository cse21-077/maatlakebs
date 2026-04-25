import React, { useState } from 'react';
import { ChevronLeft, Eye, FileText } from 'lucide-react';

type LegalView = 'privacy' | 'terms';

interface LegalPageProps {
    onBack?: () => void;
}

export const LegalPage = ({ onBack }: LegalPageProps) => {
    const [view, setView] = useState<LegalView>('privacy');

    return (
        <div className="min-h-screen bg-[#0d0f14] flex flex-col pt-12 pb-safe animate-fade-in">
            {/* Header */}
            <header className="px-8 pt-6 pb-8 flex items-center gap-4 shrink-0 border-b border-white/5">
                {onBack && (
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-white/5 rounded-xl transition-all active:scale-95"
                    >
                        <ChevronLeft size={24} className="text-white/60" />
                    </button>
                )}
                <div className="flex-1">
                    <h1 className="text-3xl font-black text-white tracking-tighter">Legal</h1>
                    <p className="text-xs text-white/30 font-bold uppercase tracking-widest mt-0.5">Terms & Privacy</p>
                </div>
            </header>

            {/* Tab Controller */}
            <div className="px-8 pt-8 pb-6">
                <div className="flex bg-[#1a1c22] p-1.5 rounded-2xl border border-white/5 w-full">
                    <button
                        onClick={() => setView('privacy')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                            view === 'privacy'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        <Eye size={14} />
                        Privacy Policy
                    </button>
                    <button
                        onClick={() => setView('terms')}
                        className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${
                            view === 'terms'
                                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        <FileText size={14} />
                        Terms & Conditions
                    </button>
                </div>
            </div>

            {/* Content */}
            <main className="flex-1 px-8 space-y-8 overflow-y-auto pb-10">
                {view === 'privacy' && <PrivacyContent />}
                {view === 'terms' && <TermsContent />}
            </main>
        </div>
    );
};

// ── Privacy Policy Content ────────────────────────────────────────────────────

const PrivacyContent = () => {
    return (
        <div className="space-y-12 max-w-4xl">
            {/* Header */}
            <div className="space-y-4">
                <div className="inline-block">
                    <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Last Updated</span>
                    <p className="text-white/40 text-sm mt-1">April 2026</p>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">Privacy Policy</h2>
                <p className="text-white/50 font-medium">How we collect, use, and protect your personal data</p>
            </div>

            {/* Section 1 */}
            <LegalSection title="1. Information We Collect">
                <SubSection title="1.1 Account Information">
                    <p>When you register, we collect:</p>
                    <ul className="list-disc list-inside space-y-2 ml-2">
                        <li>Full name</li>
                        <li>Email address</li>
                        <li>MetaTrader 5 login credentials (encrypted at rest)</li>
                    </ul>
                </SubSection>

                <SubSection title="1.2 Trading Data">
                    <ul className="list-disc list-inside space-y-2 ml-2">
                        <li>Trade history (symbols, volumes, entry/exit prices, timestamps)</li>
                        <li>Account balance snapshots</li>
                        <li>Connection status logs</li>
                    </ul>
                </SubSection>

                <SubSection title="1.3 Payment Information">
                    <ul className="list-disc list-inside space-y-2 ml-2">
                        <li>Binance Pay transaction IDs</li>
                        <li>Subscription status</li>
                        <li>Payment amounts and dates</li>
                    </ul>
                </SubSection>

                <SubSection title="1.4 Technical Data">
                    <ul className="list-disc list-inside space-y-2 ml-2">
                        <li>IP address</li>
                        <li>Browser type and version</li>
                        <li>Device information</li>
                        <li>Session timestamps</li>
                    </ul>
                </SubSection>
            </LegalSection>

            {/* Section 2 */}
            <LegalSection title="2. How We Use Your Information">
                <div className="bg-[#1a1c22] border border-white/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-6 py-4 text-left text-white/60 font-bold uppercase text-[10px] tracking-widest">Purpose</th>
                                <th className="px-6 py-4 text-left text-white/60 font-bold uppercase text-[10px] tracking-widest">Data Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { purpose: 'Execute copy trades on your behalf', data: 'MT5 credentials, trade signals' },
                                { purpose: 'Process subscription payments', data: 'Payment information' },
                                { purpose: 'Display trade history', data: 'Trading data' },
                                { purpose: 'Improve platform stability', data: 'Technical data' },
                                { purpose: 'Send service notifications', data: 'Email address' },
                            ].map((row, i) => (
                                <tr key={i} className={i !== 4 ? 'border-b border-white/5' : ''}>
                                    <td className="px-6 py-4 text-white/80">{row.purpose}</td>
                                    <td className="px-6 py-4 text-white/60">{row.data}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </LegalSection>

            {/* Section 3 */}
            <LegalSection title="3. Data Storage & Security">
                <ul className="space-y-3 text-white/70">
                    <li>• <strong className="text-white">MT5 passwords</strong> are encrypted using AES-256 before storage</li>
                    <li>• <strong className="text-white">All data</strong> resides on Supabase (EU West region) with encryption at rest</li>
                    <li>• <strong className="text-white">MT5 credentials</strong> are decrypted only on our secured VPS infrastructure</li>
                    <li>• <strong className="text-white">Plain-text passwords</strong> are never stored</li>
                </ul>
            </LegalSection>

            {/* Section 4 */}
            <LegalSection title="4. Data Sharing">
                <p className="text-white/70 mb-4">We <strong className="text-white">do not</strong> sell, rent, or share your personal data with third parties except:</p>
                <ul className="space-y-2 text-white/70">
                    <li>• <strong className="text-white">Weltrade</strong> (your broker) — trade execution only</li>
                    <li>• <strong className="text-white">Supabase</strong> — database hosting (EU-based, GDPR compliant)</li>
                    <li>• <strong className="text-white">Binance</strong> — payment processing only</li>
                    <li>• <strong className="text-white">Law enforcement</strong> — if required by valid legal process</li>
                </ul>
            </LegalSection>

            {/* Section 5 */}
            <LegalSection title="5. Data Retention">
                <div className="bg-[#1a1c22] border border-white/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                <th className="px-6 py-4 text-left text-white/60 font-bold uppercase text-[10px] tracking-widest">Data Type</th>
                                <th className="px-6 py-4 text-left text-white/60 font-bold uppercase text-[10px] tracking-widest">Retention Period</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { type: 'Account information', period: 'Duration of account + 90 days' },
                                { type: 'Trade history', period: 'Duration of account + 3 years' },
                                { type: 'Payment records', period: '7 years (tax compliance)' },
                                { type: 'Technical logs', period: '90 days' },
                            ].map((row, i) => (
                                <tr key={i} className={i !== 3 ? 'border-b border-white/5' : ''}>
                                    <td className="px-6 py-4 text-white/80">{row.type}</td>
                                    <td className="px-6 py-4 text-white/60">{row.period}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </LegalSection>

            {/* Section 6 */}
            <LegalSection title="6. Your Rights">
                <p className="text-white/70 mb-4">You have the right to:</p>
                <ul className="space-y-2 text-white/70">
                    <li>• Access all personal data we hold about you</li>
                    <li>• Request correction of inaccurate data</li>
                    <li>• Request deletion of your account and associated data</li>
                    <li>• Export your trade history</li>
                    <li>• Withdraw consent at any time</li>
                </ul>
                <p className="text-white/60 text-sm mt-4 p-4 bg-primary/10 rounded-xl border border-primary/20">
                    To exercise these rights, contact support through the in-app chat.
                </p>
            </LegalSection>

            {/* Section 7 */}
            <LegalSection title="7. Cookies">
                <p className="text-white/70 mb-3">We use essential cookies only for:</p>
                <ul className="space-y-2 text-white/70 mb-4">
                    <li>• Session management (authentication)</li>
                    <li>• Security (CSRF protection)</li>
                </ul>
                <p className="text-white/70">We <strong className="text-white">do not</strong> use tracking cookies, advertising cookies, or analytics cookies.</p>
            </LegalSection>

            {/* Section 8 */}
            <LegalSection title="8. Contact">
                <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-6 space-y-4">
                    <div>
                        <p className="text-white/60 text-sm uppercase font-bold tracking-widest mb-1">In-app Support</p>
                        <p className="text-white">Support Chat</p>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div>
                        <p className="text-white/60 text-sm uppercase font-bold tracking-widest mb-1">Email</p>
                        <a href="mailto:privacy@maatlakebs.com" className="text-primary hover:text-primary/80 transition">privacy@maatlakebs.com</a>
                    </div>
                </div>
            </LegalSection>
        </div>
    );
};

// ── Terms & Conditions Content ────────────────────────────────────────────────

const TermsContent = () => {
    return (
        <div className="space-y-12 max-w-4xl">
            {/* Header */}
            <div className="space-y-4">
                <div className="inline-block">
                    <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Last Updated</span>
                    <p className="text-white/40 text-sm mt-1">April 2026</p>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tighter leading-tight">Terms and Conditions</h2>
                <p className="text-white/50 font-medium">Binding agreement for using Maatla Kebs Copy Trading Platform</p>
            </div>

            {/* Section 1 */}
            <LegalSection title="1. Acceptance of Terms">
                <p className="text-white/70">By accessing or using Maatla Kebs ("the Platform"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Platform.</p>
            </LegalSection>

            {/* Section 2 */}
            <LegalSection title="2. Service Description">
                <p className="text-white/70 mb-4">Maatla Kebs is a copy trading platform that automatically mirrors trades from a designated Mentor account to your connected MetaTrader 5 account.</p>

                <SubSection title="2.1 How It Works">
                    <ul className="list-disc list-inside space-y-2 ml-2 text-white/70">
                        <li>You connect your MT5 account to the Platform</li>
                        <li>When the Mentor places a trade, the Platform copies it to your account</li>
                        <li>Trade parameters (lot size) are adjusted based on your risk settings</li>
                        <li>You retain full control to pause/stop copying at any time</li>
                    </ul>
                </SubSection>

                <SubSection title="2.2 Important Disclaimers">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2">
                        <p className="text-red-400 font-semibold">⚠️ IMPORTANT TRADING RISKS</p>
                        <ul className="list-disc list-inside space-y-2 ml-2 text-red-400/80 text-sm">
                            <li><strong>Past performance does not guarantee future results</strong></li>
                            <li><strong>Copy trading carries the same risks as manual trading</strong></li>
                            <li><strong>You may lose part or all of your trading capital</strong></li>
                            <li><strong>The Platform does not provide financial advice</strong></li>
                        </ul>
                    </div>
                </SubSection>
            </LegalSection>

            {/* Section 3 */}
            <LegalSection title="3. User Obligations">
                <SubSection title="3.1 Account Security">
                    <ul className="list-disc list-inside space-y-2 ml-2 text-white/70">
                        <li>You are responsible for maintaining the confidentiality of your login credentials</li>
                        <li>You must not share your account with third parties</li>
                        <li>You must notify us immediately of any unauthorized access</li>
                    </ul>
                </SubSection>

                <SubSection title="3.2 Trading Account">
                    <ul className="list-disc list-inside space-y-2 ml-2 text-white/70">
                        <li>You must provide valid MT5 credentials</li>
                        <li>Your MT5 account must have sufficient margin for copied trades</li>
                        <li>You are responsible for monitoring your account balance</li>
                    </ul>
                </SubSection>

                <SubSection title="3.3 Prohibited Activities">
                    <ul className="list-disc list-inside space-y-2 ml-2 text-white/70">
                        <li>Reverse engineering the Platform</li>
                        <li>Interfering with trade signal transmission</li>
                        <li>Using the Platform for illegal activities</li>
                        <li>Creating multiple accounts to abuse the trial period</li>
                    </ul>
                </SubSection>
            </LegalSection>

            {/* Section 4 */}
            <LegalSection title="4. Payments & Subscriptions">
                <SubSection title="4.1 Subscription Fees">
                    <ul className="space-y-2 text-white/70">
                        <li>• Subscription fee: <strong className="text-white">$200 USD per month</strong></li>
                        <li>• Payment is processed via <strong className="text-white">Binance Pay (USDT)</strong></li>
                        <li>• Subscriptions <strong className="text-white">auto-renew every 30 days</strong></li>
                    </ul>
                </SubSection>

                <SubSection title="4.2 Trial Period">
                    <ul className="space-y-2 text-white/70">
                        <li>• New users receive a trial period as specified at signup</li>
                        <li>• Trial may be terminated at our discretion</li>
                    </ul>
                </SubSection>
            </LegalSection>

            {/* Section 5 - REFUND POLICY */}
            <LegalSection title="5. Refund Policy">
                <div className="bg-red-500/15 border border-red-500/30 rounded-2xl p-6 space-y-6">
                    <SubSection title="5.1 Strict No-Refund Policy">
                        <p className="text-red-400 font-bold mb-3">❌ Once a trade has been entered on your behalf through the Platform, the service is considered fully rendered and no refund will be issued.</p>
                        <p className="text-white/70 text-sm mb-3">By connecting your MT5 account and enabling copy trading, you acknowledge that:</p>
                        <ul className="space-y-2 text-white/70 text-sm">
                            <li>• The service begins immediately upon activation</li>
                            <li>• Trade execution constitutes use of the service</li>
                            <li>• You waive any right to a refund once a trade has been copied to your account</li>
                            <li>• Subscription fees are non-refundable regardless of trading outcomes</li>
                        </ul>
                    </SubSection>

                    <div className="h-px bg-white/10" />

                    <SubSection title="5.2 Exceptions">
                        <p className="text-white/70 text-sm mb-3">Refunds may be considered <strong className="text-white">ONLY</strong> in these circumstances:</p>
                        <ul className="space-y-2 text-white/70 text-sm">
                            <li>• <strong className="text-green-400">Technical failure:</strong> Platform was down for 48+ continuous hours</li>
                            <li>• <strong className="text-green-400">Billing error:</strong> Duplicate charges or incorrect amounts</li>
                            <li>• <strong className="text-green-400">Service not delivered:</strong> No trades copied during entire billing period</li>
                        </ul>
                        <p className="text-white/60 text-sm mt-3">All exception requests must be submitted within 7 days via in-app support.</p>
                    </SubSection>

                    <div className="h-px bg-white/10" />

                    <SubSection title="5.3 Chargebacks">
                        <p className="text-red-400 text-sm"><strong>⚠️ WARNING:</strong> Initiating a chargeback or payment dispute without contacting support first constitutes a breach of these Terms and will result in immediate account termination.</p>
                    </SubSection>
                </div>
            </LegalSection>

            {/* Section 6 */}
            <LegalSection title="6. Limitation of Liability">
                <SubSection title="6.1 Trading Risks">
                    <ul className="space-y-2 text-white/70">
                        <li>• The Platform executes trades based on Mentor signals only</li>
                        <li>• We do not guarantee profits or prevent losses</li>
                        <li>• Market conditions, slippage, and broker execution may affect trade outcomes</li>
                        <li>• You acknowledge that trading involves substantial risk of loss</li>
                    </ul>
                </SubSection>

                <SubSection title="6.2 Technical Limitations">
                    <p className="text-white/70 mb-2">We strive for 99.9% uptime but cannot guarantee uninterrupted service. Trade execution speed depends on your broker, internet connection, and market conditions.</p>
                    <p className="text-white/70 mb-2">We are not liable for losses resulting from:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-white/70">
                        <li>Internet connectivity issues</li>
                        <li>Broker server downtime</li>
                        <li>MT5 platform errors</li>
                        <li>Force majeure events</li>
                    </ul>
                </SubSection>

                <SubSection title="6.3 Maximum Liability">
                    <p className="text-white/70">To the fullest extent permitted by law, our total liability for any claim shall not exceed the subscription fees paid by you in the 30 days preceding the claim.</p>
                </SubSection>
            </LegalSection>

            {/* Section 7 */}
            <LegalSection title="7. Account Termination">
                <SubSection title="7.1 By You">
                    <ul className="space-y-2 text-white/70">
                        <li>• You may disconnect your MT5 account at any time</li>
                        <li>• You may delete your account through the Platform</li>
                        <li>• Pre-paid subscription fees are non-refundable upon voluntary termination</li>
                    </ul>
                </SubSection>

                <SubSection title="7.2 By Us">
                    <p className="text-white/70 mb-2">We reserve the right to suspend or terminate your account if:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2 text-white/70">
                        <li>Subscription payment is overdue by 7+ days</li>
                        <li>You violate these Terms</li>
                        <li>Your activity poses a security risk to the Platform</li>
                        <li>We discontinue the service (with 30 days notice)</li>
                    </ul>
                </SubSection>
            </LegalSection>

            {/* Section 8 */}
            <LegalSection title="8. Intellectual Property">
                <p className="text-white/70">The Platform, including its code, design, branding, and documentation, is the exclusive property of Maatla Kebs. You may not copy, modify, distribute, or reverse engineer any part of the Platform.</p>
            </LegalSection>

            {/* Section 9 */}
            <LegalSection title="9. Changes to Terms">
                <p className="text-white/70">We may update these Terms from time to time. Material changes will be communicated via:</p>
                <ul className="list-disc list-inside space-y-2 ml-2 text-white/70 mt-3">
                    <li>Email notification (30 days before effective date)</li>
                    <li>In-app notification</li>
                </ul>
                <p className="text-white/70 mt-3">Continued use after changes take effect constitutes acceptance of the updated Terms.</p>
            </LegalSection>

            {/* Section 10 */}
            <LegalSection title="10. Governing Law">
                <p className="text-white/70">These Terms are governed by the laws of Botswana. Any disputes shall be resolved through binding arbitration in Gaborone, Botswana.</p>
            </LegalSection>

            {/* Section 11 */}
            <LegalSection title="11. Contact">
                <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-6 space-y-4">
                    <div>
                        <p className="text-white/60 text-sm uppercase font-bold tracking-widest mb-1">In-app Support</p>
                        <p className="text-white">Support Chat</p>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div>
                        <p className="text-white/60 text-sm uppercase font-bold tracking-widest mb-1">Legal Questions</p>
                        <a href="mailto:legal@maatlakebs.com" className="text-primary hover:text-primary/80 transition">legal@maatlakebs.com</a>
                    </div>
                </div>
            </LegalSection>

            {/* Disclaimer Footer */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-6">
                <p className="text-yellow-600/90 text-sm font-medium leading-relaxed">
                    ⚖️ <strong>Legal Disclaimer:</strong> These documents provide legal protection but should be reviewed by a qualified attorney before being deployed in production. This template is for reference and may need jurisdiction-specific adjustments.
                </p>
            </div>
        </div>
    );
};

// ── Utility Components ────────────────────────────────────────────────────────

interface LegalSectionProps {
    title: string;
    children: React.ReactNode;
}

const LegalSection = ({ title, children }: LegalSectionProps) => {
    return (
        <div className="space-y-4">
            <h3 className="text-xl font-black text-white tracking-tighter">{title}</h3>
            <div className="space-y-4 text-white/70">{children}</div>
        </div>
    );
};

interface SubSectionProps {
    title: string;
    children: React.ReactNode;
}

const SubSection = ({ title, children }: SubSectionProps) => {
    return (
        <div className="space-y-2 pl-4 border-l-2 border-primary/30">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest">{title}</h4>
            <div className="text-white/70 space-y-2">{children}</div>
        </div>
    );
};
