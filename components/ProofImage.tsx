import React, { useState, useCallback } from 'react';
import { ExternalLink, AlertCircle, Loader } from 'lucide-react';

interface ProofImageProps {
  url: string | null | undefined;
  alt?: string;
  className?: string;
}

export const ProofImage: React.FC<ProofImageProps> = ({ url, alt = 'Proof of payment', className = '' }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSignedUrl = useCallback(async (originalUrl: string) => {
    if (loading || signedUrl) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments?url=${encodeURIComponent(originalUrl)}`);
      const data = await res.json();
      if (res.ok && data.signedUrl) {
        setSignedUrl(data.signedUrl);
      } else {
        setFailed(true);
      }
    } catch (err) {
      console.error('Failed to fetch signed URL:', err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, signedUrl]);

  const handleError = useCallback(() => {
    if (!url || signedUrl || failed) return;
    // Try signed URL fallback
    fetchSignedUrl(url);
  }, [url, signedUrl, failed, fetchSignedUrl]);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-white/5 rounded-xl p-8 ${className}`}>
        <p className="text-xs text-white/30 font-bold">No proof uploaded</p>
      </div>
    );
  }

  // PDF fallback
  if (url.endsWith('.pdf')) {
    return (
      <div className={`text-center space-y-4 ${className}`}>
        <p className="text-sm text-white/60">PDF Document</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/80 transition-all"
        >
          <ExternalLink size={16} /> Open PDF
        </a>
      </div>
    );
  }

  const imageUrl = signedUrl || url;

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center bg-white/5 rounded-xl p-8 space-y-3 ${className}`}>
        <AlertCircle size={24} className="text-amber-400" />
        <p className="text-xs text-white/40 font-bold text-center">Unable to load image preview</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-4 py-2 bg-white/5 text-white/60 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-all"
        >
          <ExternalLink size={12} /> Open Image
        </a>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && !signedUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1c22] rounded-xl z-10">
          <Loader size={20} className="animate-spin text-white/30" />
        </div>
      )}
      <img
        src={imageUrl}
        alt={alt}
        className="max-w-full max-h-96 rounded-xl sm:rounded-2xl"
        onError={handleError}
        crossOrigin="anonymous"
      />
    </div>
  );
};
