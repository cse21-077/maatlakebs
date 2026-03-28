import React from 'react';

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
