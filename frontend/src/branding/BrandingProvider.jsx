/**
 * Product and deployment identity, available everywhere including before
 * sign-in.
 *
 * Fetched from the public /api/branding so the login screen and the browser tab
 * can show the company name without a session. Refreshed after Settings saves
 * so a rename takes effect without a reload.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PRODUCT_NAME, CREDIT, titleFor } from '../lib/branding.js';

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState(PRODUCT_NAME);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/branding', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      setCompanyName(data.companyName || '');
      setProductName(data.productName || PRODUCT_NAME);
    } catch {
      // Branding is decoration; never let it break a screen.
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo(
    () => ({ companyName, productName, credit: CREDIT, refresh }),
    [companyName, productName, refresh],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) throw new Error('useBranding must be used inside <BrandingProvider>');
  return context;
}

/** Keep the browser tab in step with the company and the current screen. */
export function useDocumentTitle(page) {
  const { companyName } = useBranding();
  useEffect(() => {
    document.title = titleFor(companyName, page);
  }, [companyName, page]);
}
