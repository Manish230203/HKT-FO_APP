import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

import OfficerRoundReportsList from "./pages/officer-round/OfficerRoundReportsList";
import CreateOfficerRoundReport from "./pages/officer-round/CreateOfficerRoundReport";
import ObservationDetails from "./pages/officer-round/ObservationDetails";
import ReportPreview from "./pages/officer-round/ReportPreview";
import TemplateBuilder from "./pages/officer-round/TemplateBuilder";

import OfficerVisitReportsList from "./pages/officer-visit/OfficerVisitReportsList";
import CreateOfficerVisitReport from "./pages/officer-visit/CreateOfficerVisitReport";
import VisitReportPreview from "./pages/officer-visit/VisitReportPreview";
import VisitTemplateBuilder from "./pages/officer-visit/VisitTemplateBuilder";
import Dashboard from "./pages/Dashboard";
import GeneralVisit from "./pages/general-visit/GeneralVisit";
import MySites from "./pages/MySites";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const App = () => {
  const [alertState, setAlertState] = useState({ isOpen: false, title: "Alert", message: "" });

  useEffect(() => {
    window.alert = (message) => {
      let title = "Selection Required";
      if (
        message.toLowerCase().includes("compulsory") ||
        message.toLowerCase().includes("mandatory") ||
        message.toLowerCase().includes("select")
      ) {
        title = "Selection Required";
      } else if (message.toLowerCase().includes("fail") || message.toLowerCase().includes("error")) {
        title = "Error";
      } else if (message.toLowerCase().includes("success")) {
        title = "Success";
      } else {
        title = "Alert";
      }

      setAlertState({
        isOpen: true,
        title,
        message,
      });
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
        <AppLayout>
          <Routes>
            {/* Dashboard Route */}
            <Route
              path="/"
              element={<Dashboard />}
            />
            <Route
              path="/dashboard"
              element={<Dashboard />}
            />
            <Route
              path="/my-sites"
              element={<MySites />}
            />

            {/* Officer Round Routes */}
            <Route
              path="/officer-rounds"
              element={<OfficerRoundReportsList />}
            />
            <Route
              path="/officer-rounds/create"
              element={<CreateOfficerRoundReport />}
            />
            <Route
              path="/officer-rounds/observation/:id"
              element={<ObservationDetails />}
            />
            <Route
              path="/officer-rounds/preview/:id"
              element={<ReportPreview />}
            />
            <Route
              path="/officer-rounds/template-builder"
              element={<TemplateBuilder />}
            />

            {/* Officer Visit Routes */}
            <Route
              path="/officer-visits"
              element={<OfficerVisitReportsList />}
            />
            <Route
              path="/officer-visits/reports"
              element={<OfficerVisitReportsList />}
            />
            <Route
              path="/officer-visit/reports"
              element={<OfficerVisitReportsList />}
            />
            <Route
              path="/officer-visit"
              element={<Navigate to="/officer-visits" replace />}
            />
            <Route
              path="/general-visits"
              element={<GeneralVisit />}
            />
            <Route
              path="/officer-visits/create"
              element={<CreateOfficerVisitReport />}
            />
            <Route
              path="/officer-visit/create"
              element={<CreateOfficerVisitReport />}
            />
            <Route
              path="/officer-visits/edit/:id"
              element={<CreateOfficerVisitReport />}
            />
            <Route
              path="/officer-visit/edit/:id"
              element={<CreateOfficerVisitReport />}
            />
            <Route
              path="/officer-visits/preview/:id"
              element={<VisitReportPreview />}
            />
            <Route
              path="/officer-visit/preview/:id"
              element={<VisitReportPreview />}
            />
            <Route
              path="/officer-visits/template-builder"
              element={<VisitTemplateBuilder />}
            />
            <Route
              path="/officer-visit/template-builder"
              element={<VisitTemplateBuilder />}
            />

            {/* Fallback */}
            <Route
              path="*"
              element={<Navigate to="/officer-rounds" replace />}
            />
          </Routes>
        </AppLayout>
      </BrowserRouter>
      
      {/* Universal custom alert modal matching request design */}
      <Dialog open={alertState.isOpen} onOpenChange={(open) => setAlertState(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-[340px] rounded-2xl border border-slate-800 bg-[#0b1020] p-6 shadow-2xl flex flex-col items-center text-center text-xs">
          {/* Warning Icon Container */}
          <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
            <AlertTriangle className="h-8 w-8" />
          </div>
          
          <h2 className="text-base font-bold text-white mb-2 tracking-tight">
            {alertState.title}
          </h2>
          
          <p className="text-slate-400 text-xs mb-6 max-w-[240px] leading-relaxed">
            {alertState.message}
          </p>
          
          <Button
            onClick={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
            className="w-full bg-[#1b64f2] hover:bg-[#1553d1] text-white font-semibold text-xs h-10.5 rounded-xl transition-all shadow-md"
          >
            OK
          </Button>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
