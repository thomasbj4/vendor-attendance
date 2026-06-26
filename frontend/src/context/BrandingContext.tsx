import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import api from '../api/client';

interface Branding {
  favicon: string;
  logo: string;
}

interface BrandingContextType {
  branding: Branding;
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextType>({
  branding: { favicon: '', logo: '' },
  refresh: async () => {},
});

function applyFavicon(dataUrl: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = dataUrl;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>({ favicon: '', logo: '' });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/branding');
      setBranding({ favicon: data.favicon || '', logo: data.logo || '' });
      if (data.favicon) applyFavicon(data.favicon);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <BrandingContext.Provider value={{ branding, refresh }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
