"use client";

import { GoogleAnalytics, GoogleTagManager } from "@next/third-parties/google";
import { useEffect } from "react";
import { configureGa4Tracking } from "@/lib/ga4";

export default function GoogleTracking({
  gaId,
  gtmId,
}: {
  gaId?: string;
  gtmId?: string;
}) {
  useEffect(() => {
    configureGa4Tracking(gaId ? "ga4" : gtmId ? "gtm" : "disabled");
  }, [gaId, gtmId]);

  return (
    <>
      {gtmId && <GoogleTagManager gtmId={gtmId} />}
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </>
  );
}
