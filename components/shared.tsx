import React from 'react';

export const parseJson = async (res: Response) => {
    const text = await res.text();
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new Error(text || `Unexpected response (${res.status})`);
    }
    if (!text) {
        throw new Error(`Empty JSON response (${res.status})`);
    }
    try {
        return JSON.parse(text);
    } catch (err) {
        throw new Error(text || 'Invalid JSON response');
    }
};

export const Button = ({ children, onClick, variant = 'primary', className = '', loading = false, disabled = false }: any) => {
    const variants: Record<string, string> = {
        primary: 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20',
        outline: 'border border-white/20 text-white hover:bg-white/5',
        ghost: 'text-white/70 hover:text-white',
        danger: 'bg-red-500/10 text-red-500 border border-red-500/20',
    };
    const off = loading || disabled;
    return (
        <button onClick={onClick} disabled={off}
            className={`px-6 py-3 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 ${variants[variant]} ${className} ${off ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}>
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : children}
        </button>
    );
};

export const Card = ({ children, className = '' }: any) => (
    <div className={`glass rounded-2xl p-5 ${className}`}>{children}</div>
);

// Known MT5 server names, offered as autofill suggestions. The input stays
// free-text because brokers add/rename servers — always allow custom values.
export const DERIV_SERVERS = [
    'Deriv-Demo',
    'DerivBVI-Demo',
    'DerivSVG-Demo',
    'DerivSVG-Server',
    'DerivSVG-Server-02',
    'DerivSVG-Server-03',
    'DerivBVI-Server',
    'DerivBVI-Server-02',
    'DerivBVI-Server-03',
];

export const MT5_SERVER_PRESETS = [
    'Weltrade-Real',
    'Weltrade-Demo',
    ...DERIV_SERVERS,
];
