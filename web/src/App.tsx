import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import SiteLayout from "./components/SiteLayout";
import Home from "./pages/Home";
import Pricing from "./pages/Pricing";
import Start from "./pages/Start";
import Account from "./pages/Account";
import CountryDetail from "./pages/CountryDetail";
import DataDelete from "./pages/DataDelete";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import NotFound from "./pages/NotFound";
import { initPixel, trackPageView } from "./lib/pixel";

function PixelTracker() {
  const location = useLocation();
  useEffect(() => {
    initPixel();
  }, []);
  useEffect(() => {
    trackPageView();
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <SiteLayout>
      <PixelTracker />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/start" element={<Start />} />
        <Route path="/account" element={<Account />} />
        <Route path="/country/:slug" element={<CountryDetail />} />
        <Route path="/data-delete" element={<DataDelete />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/privacy-policy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/terms-of-service" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </SiteLayout>
  );
}
